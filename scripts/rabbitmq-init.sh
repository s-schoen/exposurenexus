#!/usr/bin/env bash
# jq expressions intentionally use literal dollar signs.
# shellcheck disable=SC2016
# Disable tracing before handling secrets, including when invoked with bash -x.
set +x +v
set -Eeuo pipefail
exec 3>&2 2>/dev/null
stage=configuration
fail() { printf '%s\n' "$1" >&3; exit 1; }
trap 'fail "Provisioning failed during ${stage}; underlying details suppressed to protect credentials."' ERR

for dependency in curl jq; do
  command -v "$dependency" >/dev/null || fail "Required dependency is unavailable: ${dependency}."
done

# Secrets enter jq through the environment, never command arguments.
jq -en '
  ["PROVISIONER", "API", "WORKER"] | all(.[];
    . as $role | env["RABBITMQ_" + $role + "_USER"] as $user |
    env["RABBITMQ_" + $role + "_PASSWORD"] as $password |
    ($user | type == "string") and
    ($user | test("^[A-Za-z0-9_-][A-Za-z0-9_.@-]*$")) and $user != "guest" and
    ($password | type == "string") and ($password | length > 0) and
    ($password | explode | all(.[]; . > 31 and (. < 127 or . > 159))))
' >/dev/null || fail 'Invalid required account configuration (non-guest safe usernames and nonempty passwords required).'
jq -en '[env.RABBITMQ_PROVISIONER_USER, env.RABBITMQ_API_USER, env.RABBITMQ_WORKER_USER] | unique | length == 3' >/dev/null ||
  fail 'Provisioner, API, and worker account names must be distinct.'

base=${RABBITMQ_MANAGEMENT_URL-http://rabbitmq:15672}
# Accept conventional absolute HTTP(S) URLs only; reject ambiguous curl syntax.
printf '%s' "$base" | jq -Re '
  test("^https?://(\\[[0-9A-Fa-f:.]+\\]|[A-Za-z0-9._~-]+)(:[0-9]+)?(/[^?#]*)?$") and
  (test("[\\s\\\\\u0000-\u001f\u007f-\u009f]") | not) and
  (capture("^https?://(?:\\[[^]]+\\]|[^/:]+)(?::(?<port>[0-9]+))?") |
    .port == null or .port == "" or (.port | tonumber) <= 65535)
' >/dev/null || fail 'Invalid management URL: use HTTP(S) without credentials, query, or fragment.'
base=${base%/}/api/
authorization=$(jq -nr '"Basic " + ((env.RABBITMQ_PROVISIONER_USER + ":" + env.RABBITMQ_PROVISIONER_PASSWORD) | @base64)')
vhost=exposurenexus
exchange=EXPOSURENEXUS_JOBS
queue=EXPOSURENEXUS_JOBS_INGEST
dlx=EXPOSURENEXUS_JOBS_DLX
dlq=EXPOSURENEXUS_JOBS_INGEST_DLQ
policy_name=exposurenexus-jobs-retry

# curl config quoting is not shell quoting. Escape backslashes first.
config_value() {
  local value=$2
  value=${value//\\/\\\\}
  value=${value//\"/\\\"}
  value=${value//$'\n'/\\n}
  value=${value//$'\r'/\\r}
  value=${value//$'\t'/\\t}
  printf '%s = "%s"\n' "$1" "$value"
}

# Results stay in memory. Disable curlrc, URL globbing, redirects and diagnostics.
# Only readiness retries failures; authentication failures always stop immediately.
request() {
  local path=$1 method=${2-GET} body=${3-} allow_missing=${4-false} timeout=${5-10}
  local raw status error
  response=null
  missing=false
  (( timeout > 0 )) || timeout=1
  if raw=$(
    {
      config_value url "${base}${path}"
      config_value header "Authorization: ${authorization}"
      config_value header 'Content-Type: application/json'
      config_value header 'Accept: application/json'
      config_value request "$method"
      if [[ -n $body ]]; then config_value data-binary "$body"; fi
    } | curl --disable --silent --globoff --proto '=http,https' \
      --connect-timeout "$timeout" --max-time "$timeout" --max-redirs 0 \
      --write-out $'\n%{http_code}' --config -
  ); then
    status=${raw##*$'\n'}
    if [[ $status == 404 && $allow_missing == true ]]; then
      missing=true
      return 0
    fi
    case $status in
      401|403) fail 'Management authentication/authorization failed; verify persisted provisioner credentials and administrator privileges.' ;;
      2[0-9][0-9])
        if [[ $method != GET ]]; then return 0; fi
        if response=$(printf '%s' "${raw%$'\n'*}" | jq -cs 'if length == 1 then .[0] else error("invalid JSON") end'); then
          return 0
        fi
        error="Provisioning failed during ${stage}; underlying details suppressed to protect credentials."
        ;;
      [0-9][0-9][0-9]) error="Management operation failed during ${stage} (HTTP ${status})." ;;
      *) error="Provisioning failed during ${stage}; underlying details suppressed to protect credentials." ;;
    esac
  else
    error="Provisioning failed during ${stage}; underlying details suppressed to protect credentials."
  fi
  if [[ $stage == 'management readiness' ]]; then return 1; fi
  fail "$error"
}

matches() { printf '%s' "$response" | jq -e "$@" >/dev/null; }
encode() { printf '%s' "$1" | jq -sRr @uri; }
bounded_timeout() {
  timeout=$((deadline - SECONDS))
  (( timeout <= 10 )) || timeout=10
}

stage='management readiness'
deadline=$((SECONDS + 60))
while true; do
  (( SECONDS < deadline )) || fail 'Management readiness deadline exceeded.'
  bounded_timeout
  if request overview GET '' false "$timeout" && matches '. != null and . != false'; then break; fi
  (( SECONDS < deadline )) || fail 'Management readiness deadline exceeded.'
  sleep 1
done

stage='broker capabilities'
matches '.rabbitmq_version | type == "string" and test("^4\\.3\\.([5-9]|[1-9][0-9]+)$")' ||
  fail 'Unsupported broker version; RabbitMQ 4.3.5 or a later 4.3 patch is required.'
request feature-flags
for feature in quorum_queue stream_queue rabbitmq_4.3.0; do
  matches --arg name "$feature" 'any(.[]; .name == $name and .state == "enabled")' ||
    fail "Required broker feature is not enabled: ${feature}."
done
request "users/$(encode "$RABBITMQ_PROVISIONER_USER")"
matches '.tags | type == "array" and index("administrator") != null' ||
  fail 'Provisioner must be bootstrapped with administrator privileges.'

stage='vhost provisioning'
request "vhosts/$vhost" GET '' true
if [[ $missing == true ]] || matches '. == null or . == false'; then request "vhosts/$vhost" PUT '{}'; fi
request "permissions/$vhost/$(encode "$RABBITMQ_PROVISIONER_USER")" PUT '{"configure":".*","write":".*","read":".*"}'

paths=("exchanges/$vhost/$exchange" "exchanges/$vhost/$dlx" "queues/$vhost/$queue" "queues/$vhost/$dlq")
exchange_definition='{"type":"topic","durable":true,"auto_delete":false,"internal":false,"arguments":{}}'
queue_definition='{"type":"quorum","durable":true,"auto_delete":false,"exclusive":false,"arguments":{"x-queue-type":"quorum"}}'
expected=("$exchange_definition" "$exchange_definition" "$queue_definition" "$queue_definition")
verify_resource() {
  local index=$1 key
  for key in type durable auto_delete arguments internal exclusive; do
    matches --argjson expected "${expected[index]}" --arg key "$key" \
      '. as $actual | ($expected | has($key) | not) or ($actual[$key] == $expected[$key])' ||
      fail "Incompatible immutable topology: ${paths[index]} (${key}); no resources were deleted."
  done
}
stage='immutable topology validation'
missing_resources=()
for index in "${!paths[@]}"; do
  request "${paths[index]}" GET '' true
  if [[ $missing == true ]] || matches '. == null or . == false'; then
    missing_resources+=("$index")
  else
    verify_resource "$index"
  fi
done
for index in "${missing_resources[@]}"; do
  request "${paths[index]}" PUT "${expected[index]}"
  request "${paths[index]}"
  verify_resource "$index"
done

stage='binding provisioning'
for index in 0 1; do
  if [[ $index == 0 ]]; then
    path="bindings/$vhost/e/$exchange/q/$queue"
    routing_key='exposurenexus.jobs.*'
  else
    path="bindings/$vhost/e/$dlx/q/$dlq"
    routing_key=exposurenexus.jobs.dead
  fi
  request "$path"
  matches --arg key "$routing_key" 'all(.[]; .routing_key != $key or .arguments == {})' ||
    fail 'Incompatible binding arguments; no bindings were deleted.'
  if ! matches --arg key "$routing_key" 'any(.[]; .routing_key == $key and .arguments == {})'; then
    body=$(jq -cn --arg key "$routing_key" '{routing_key:$key, arguments:{}}')
    request "$path" POST "$body"
  fi
  request "$path"
  matches --arg key "$routing_key" 'any(.[]; .routing_key == $key and .arguments == {})' ||
    fail 'Required binding verification failed.'
done

stage='policy reconciliation'
definition='{"delivery-limit":5,"delayed-retry-type":"failed","delayed-retry-min":5000,"delayed-retry-max":300000,"consumer-timeout":21600000,"overflow":"reject-publish","dead-letter-strategy":"at-least-once","dead-letter-exchange":"EXPOSURENEXUS_JOBS_DLX","dead-letter-routing-key":"exposurenexus.jobs.dead"}'
policy=$(jq -cn --argjson definition "$definition" --arg queue "$queue" \
  '{pattern:("^" + $queue + "$"), priority:100, "apply-to":"quorum_queues", definition:$definition}')
request "policies/$vhost/$policy_name" PUT "$policy"
request "policies/$vhost/$policy_name"
matches --argjson expected "$policy" '. as $actual | $expected | to_entries | all(.[]; $actual[.key] == .value)' ||
  fail 'Retry policy definition verification failed.'
deadline=$((SECONDS + 30))
while true; do
  (( SECONDS < deadline )) ||
    fail 'Effective retry policy verification failed; inspect competing policies and operator overrides.'
  bounded_timeout
  request "queues/$vhost/$queue" GET '' false "$timeout"
  verify_resource 2
  if matches --arg name "$policy_name" --argjson definition "$definition" '
    .policy == $name and (.effective_policy_definition as $actual |
    $definition | to_entries | all(.[]; $actual[.key] == .value))'; then break; fi
  (( SECONDS < deadline )) ||
    fail 'Effective retry policy verification failed; inspect competing policies and operator overrides.'
  sleep 1
done

stage='application account reconciliation'
topic_permission=$(jq -cn --arg exchange "$exchange" \
  '{exchange:$exchange, write:"^exposurenexus\\.jobs\\.[^.]+$", read:"^$"}')
for role in API WORKER; do
  user_variable=RABBITMQ_${role}_USER
  user=$(encode "${!user_variable}")
  body=$(jq -cn --arg role "$role" '{password:env["RABBITMQ_" + $role + "_PASSWORD"], tags:""}')
  request "users/$user" PUT "$body"
  if [[ $role == API ]]; then
    permissions=$(jq -cn --arg exchange "$exchange" '{configure:"^$",write:("^" + $exchange + "$"),read:"^$"}')
  else
    permissions=$(jq -cn --arg queue "$queue" '{configure:"^$",write:"^$",read:("^" + $queue + "$")}')
  fi
  request "users/$user/permissions"
  removals=$(printf '%s' "$response" | jq -r --arg vhost "$vhost" '.[] | select(.vhost != $vhost) | "permissions/" + (.vhost | @uri)')
  while IFS= read -r permission_path; do
    [[ -n $permission_path ]] || continue
    request "$permission_path/$user" DELETE
  done <<< "$removals"
  # Install topic restrictions before granting write access; never remove them.
  if [[ $role == API ]]; then request "topic-permissions/$vhost/$user" PUT "$topic_permission"; fi
  request "permissions/$vhost/$user" PUT "$permissions"
  request "users/$user/topic-permissions"
  removals=$(printf '%s' "$response" | jq -r --arg role "$role" --arg vhost "$vhost" --arg exchange "$exchange" '
    .[] | select(($role == "API" and .vhost == $vhost and .exchange == $exchange) | not) |
    "\(.vhost | @uri)/\(.exchange | @uri)"')
  while IFS= read -r topic; do
    [[ -n $topic ]] || continue
    request "topic-permissions/${topic%%/*}/$user/${topic#*/}" DELETE
  done <<< "$removals"
  request "users/$user"
  matches '.tags == []' || fail 'Application privileges verification failed.'
  request "users/$user/permissions"
  matches --arg vhost "$vhost" --argjson expected "$permissions" '
    length == 1 and .[0].vhost == $vhost and
    (.[0] as $actual | $expected | to_entries | all(.[]; $actual[.key] == .value))' ||
    fail 'Application privileges verification failed.'
  request "users/$user/topic-permissions"
  if [[ $role == API ]]; then
    matches --arg vhost "$vhost" --argjson expected "$topic_permission" '
      length == 1 and .[0].vhost == $vhost and
      (.[0] as $actual | $expected | to_entries | all(.[]; $actual[.key] == .value))' ||
      fail 'Application privileges verification failed.'
  else
    matches '. == []' || fail 'Application privileges verification failed.'
  fi
done
printf '%s\n' 'RabbitMQ provisioning completed successfully.'
