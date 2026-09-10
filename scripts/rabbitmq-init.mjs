import { setTimeout as sleep } from "node:timers/promises";
import { isDeepStrictEqual } from "node:util";

const vhost = "exposurenexus";
const exchange = "EXPOSURENEXUS_JOBS";
const queue = "EXPOSURENEXUS_JOBS_INGEST";
const dlx = "EXPOSURENEXUS_JOBS_DLX";
const dlq = "EXPOSURENEXUS_JOBS_INGEST_DLQ";
const policyName = "exposurenexus-jobs-retry";
const definition = {
  "delivery-limit": 5,
  "delayed-retry-type": "failed",
  "delayed-retry-min": 5000,
  "delayed-retry-max": 300000,
  "consumer-timeout": 21600000,
  overflow: "reject-publish",
  "dead-letter-strategy": "at-least-once",
  "dead-letter-exchange": dlx,
  "dead-letter-routing-key": "exposurenexus.jobs.dead",
};

class ProvisioningError extends Error {}

// Only locally authored messages may cross the logging boundary. Never include
// response bodies, URLs, account names, credentials, or underlying error causes.
function fail(message) {
  throw new ProvisioningError(message);
}

export async function provisionRabbitmq({
  env = process.env,
  fetchImpl = fetch,
  wait = sleep,
  now = Date.now,
  readinessTimeoutMs = 60000,
  requestTimeoutMs = 10000,
  policyTimeoutMs = 30000,
} = {}) {
  let stage = "configuration";
  try {
    const accounts = ["PROVISIONER", "API", "WORKER"].map((role) => {
      const user = env[`RABBITMQ_${role}_USER`];
      const password = env[`RABBITMQ_${role}_PASSWORD`];
      // Colon is ambiguous in Basic auth; controls also break AMQP PLAIN.
      if (
        typeof user !== "string" ||
        !/^[A-Za-z0-9_-][A-Za-z0-9_.@-]*$/.test(user) ||
        user === "guest" ||
        typeof password !== "string" ||
        password.length === 0 ||
        /\p{Cc}/u.test(password)
      ) {
        fail(
          "Invalid required account configuration (non-guest safe usernames and nonempty passwords required).",
        );
      }
      return { user, password };
    });
    if (new Set(accounts.map(({ user }) => user)).size !== 3) {
      fail("Provisioner, API, and worker account names must be distinct.");
    }
    const base = new URL(env.RABBITMQ_MANAGEMENT_URL ?? "http://rabbitmq:15672");
    if (
      !["http:", "https:"].includes(base.protocol) ||
      base.username ||
      base.password ||
      base.search ||
      base.hash
    ) {
      fail("Invalid management URL: use HTTP(S) without credentials, query, or fragment.");
    }
    base.pathname = `${base.pathname.replace(/\/$/, "")}/api/`;
    const authorization = `Basic ${Buffer.from(`${accounts[0].user}:${accounts[0].password}`, "utf8").toString("base64")}`;

    async function request(
      path,
      { method = "GET", body, missing = false, timeout = requestTimeoutMs } = {},
    ) {
      const response = await fetchImpl(new URL(path, base), {
        method,
        redirect: "error",
        signal: AbortSignal.timeout(Math.max(1, timeout)),
        headers: { authorization, "content-type": "application/json", accept: "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (missing && response.status === 404) {
        await response.body?.cancel();
        return null;
      }
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 401 || response.status === 403) {
          fail(
            "Management authentication/authorization failed; verify persisted provisioner credentials and administrator privileges.",
          );
        }
        fail(`Management operation failed during ${stage} (HTTP ${response.status}).`);
      }
      if (method === "GET") return await response.json();
      await response.body?.cancel();
      return null;
    }

    stage = "management readiness";
    const deadline = now() + readinessTimeoutMs;
    let overview;
    while (!overview) {
      try {
        overview = await request("overview", {
          timeout: Math.min(requestTimeoutMs, deadline - now()),
        });
      } catch (error) {
        if (
          error instanceof ProvisioningError &&
          error.message.startsWith("Management authentication")
        )
          throw error;
      }
      if (!overview) {
        if (now() >= deadline) fail("Management readiness deadline exceeded.");
        await wait(Math.min(1000, deadline - now()));
      }
    }

    stage = "broker capabilities";
    // Pin the supported release series, including the passive-permission change
    // in 4.3.1 and fixes shipped by the reference 4.3.5 deployment.
    if (!/^4\.3\.(?:[5-9]|[1-9]\d+)$/.test(overview.rabbitmq_version)) {
      fail("Unsupported broker version; RabbitMQ 4.3.5 or a later 4.3 patch is required.");
    }
    const flags = await request("feature-flags");
    for (const name of ["quorum_queue", "stream_queue", "rabbitmq_4.3.0"]) {
      if (!flags.some((flag) => flag.name === name && flag.state === "enabled")) {
        fail(`Required broker feature is not enabled: ${name}.`);
      }
    }
    const provisionerPath = `users/${encodeURIComponent(accounts[0].user)}`;
    const provisioner = await request(provisionerPath);
    if (!Array.isArray(provisioner.tags) || !provisioner.tags.includes("administrator")) {
      fail("Provisioner must be bootstrapped with administrator privileges.");
    }

    stage = "vhost provisioning";
    if (!(await request(`vhosts/${vhost}`, { missing: true }))) {
      await request(`vhosts/${vhost}`, { method: "PUT", body: {} });
    }
    await request(`permissions/${vhost}/${encodeURIComponent(accounts[0].user)}`, {
      method: "PUT",
      body: { configure: ".*", write: ".*", read: ".*" },
    });

    const resources = [
      ...[exchange, dlx].map((name) => ({
        path: `exchanges/${vhost}/${name}`,
        expected: {
          type: "topic",
          durable: true,
          auto_delete: false,
          internal: false,
          arguments: {},
        },
      })),
      ...[queue, dlq].map((name) => ({
        path: `queues/${vhost}/${name}`,
        expected: {
          type: "quorum",
          durable: true,
          auto_delete: false,
          exclusive: false,
          arguments: { "x-queue-type": "quorum" },
        },
      })),
    ];
    function verifyResource(actual, { path, expected }) {
      for (const [key, value] of Object.entries(expected)) {
        if (!isDeepStrictEqual(actual?.[key], value)) {
          fail(`Incompatible immutable topology: ${path} (${key}); no resources were deleted.`);
        }
      }
    }
    stage = "immutable topology validation";
    // Inspect all existing resources before declaring any missing ones. Strict
    // argument equality also excludes arguments that would override policies.
    const missingResources = [];
    for (const resource of resources) {
      const existing = await request(resource.path, { missing: true });
      if (existing) verifyResource(existing, resource);
      else missingResources.push(resource);
    }
    for (const resource of missingResources) {
      await request(resource.path, { method: "PUT", body: resource.expected });
      verifyResource(await request(resource.path), resource);
    }

    stage = "binding provisioning";
    for (const [source, destination, routingKey] of [
      [exchange, queue, "exposurenexus.jobs.*"],
      [dlx, dlq, "exposurenexus.jobs.dead"],
    ]) {
      const path = `bindings/${vhost}/e/${source}/q/${destination}`;
      const matches = (binding) =>
        binding.routing_key === routingKey && isDeepStrictEqual(binding.arguments, {});
      const bindings = await request(path);
      if (bindings.some((binding) => binding.routing_key === routingKey && !matches(binding))) {
        fail("Incompatible binding arguments; no bindings were deleted.");
      }
      if (!bindings.some(matches)) {
        await request(path, { method: "POST", body: { routing_key: routingKey, arguments: {} } });
      }
      if (!(await request(path)).some(matches)) fail("Required binding verification failed.");
    }

    stage = "policy reconciliation";
    const policy = {
      pattern: `^${queue}$`,
      priority: 100,
      "apply-to": "quorum_queues",
      definition,
    };
    const policyPath = `policies/${vhost}/${policyName}`;
    await request(policyPath, { method: "PUT", body: policy });
    const storedPolicy = await request(policyPath);
    for (const [key, value] of Object.entries(policy)) {
      if (!isDeepStrictEqual(storedPolicy[key], value))
        fail("Retry policy definition verification failed.");
    }
    // effective_policy_definition includes operator-policy merging, but not
    // declaration arguments (which are checked independently above and below).
    const policyDeadline = now() + policyTimeoutMs;
    while (true) {
      const source = await request(`queues/${vhost}/${queue}`, {
        timeout: Math.min(requestTimeoutMs, policyDeadline - now()),
      });
      verifyResource(source, resources[2]);
      if (
        source.policy === policyName &&
        Object.entries(definition).every(([key, value]) =>
          isDeepStrictEqual(source.effective_policy_definition?.[key], value),
        )
      )
        break;
      if (now() >= policyDeadline) {
        fail(
          "Effective retry policy verification failed; inspect competing policies and operator overrides.",
        );
      }
      await wait(Math.min(1000, policyDeadline - now()));
    }

    stage = "application account reconciliation";
    for (const [index, account] of accounts.entries()) {
      if (index === 0) continue;
      const user = encodeURIComponent(account.user);
      await request(`users/${user}`, {
        method: "PUT",
        body: { password: account.password, tags: "" },
      });
      const permissions =
        index === 1
          ? { configure: "^$", write: `^${exchange}$`, read: "^$" }
          : { configure: "^$", write: "^$", read: `^${queue}$` };
      for (const existing of await request(`users/${user}/permissions`)) {
        if (existing.vhost !== vhost) {
          await request(`permissions/${encodeURIComponent(existing.vhost)}/${user}`, {
            method: "DELETE",
          });
        }
      }
      // Missing topic rules allow all routing keys. Install the restriction
      // before granting write access, and never delete it during reconciliation.
      const topicPermission = { exchange, write: "^exposurenexus\\.jobs\\.[^.]+$", read: "^$" };
      if (index === 1) {
        await request(`topic-permissions/${vhost}/${user}`, {
          method: "PUT",
          body: topicPermission,
        });
      }
      await request(`permissions/${vhost}/${user}`, { method: "PUT", body: permissions });
      const topics = await request(`users/${user}/topic-permissions`);
      for (const topic of topics) {
        if (index === 1 && topic.vhost === vhost && topic.exchange === exchange) continue;
        await request(
          `topic-permissions/${encodeURIComponent(topic.vhost)}/${user}/${encodeURIComponent(topic.exchange)}`,
          { method: "DELETE" },
        );
      }
      const actualUser = await request(`users/${user}`);
      const actualPermissions = await request(`users/${user}/permissions`);
      const actualTopics = await request(`users/${user}/topic-permissions`);
      if (
        !isDeepStrictEqual(actualUser.tags, []) ||
        actualPermissions.length !== 1 ||
        actualPermissions[0].vhost !== vhost ||
        !Object.entries(permissions).every(([key, value]) => actualPermissions[0][key] === value) ||
        (index === 1
          ? actualTopics.length !== 1 ||
            actualTopics[0].vhost !== vhost ||
            !Object.entries(topicPermission).every(([key, value]) => actualTopics[0][key] === value)
          : actualTopics.length !== 0)
      )
        fail("Application privileges verification failed.");
    }
  } catch (error) {
    if (error instanceof ProvisioningError) throw error;
    fail(
      `Provisioning failed during ${stage}; underlying details suppressed to protect credentials.`,
    );
  }
}

if (import.meta.main) {
  try {
    await provisionRabbitmq();
    console.log("RabbitMQ provisioning completed successfully.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
