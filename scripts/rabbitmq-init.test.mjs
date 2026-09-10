import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { provisionRabbitmq } from "./rabbitmq-init.mjs";

const env = {
  RABBITMQ_PROVISIONER_USER: "provisioner",
  RABBITMQ_PROVISIONER_PASSWORD: "admin:$@/!% secret",
  RABBITMQ_API_USER: "publisher",
  RABBITMQ_API_PASSWORD: "api:$@/!% secret",
  RABBITMQ_WORKER_USER: "consumer",
  RABBITMQ_WORKER_PASSWORD: "worker:$@/!% secret",
};
const sourcePath = "queues/exposurenexus/EXPOSURENEXUS_JOBS_INGEST";
const policyPath = "policies/exposurenexus/exposurenexus-jobs-retry";
const retryPolicy = {
  "delivery-limit": 5,
  "delayed-retry-type": "failed",
  "delayed-retry-min": 5000,
  "delayed-retry-max": 300000,
  "consumer-timeout": 21600000,
  overflow: "reject-publish",
  "dead-letter-strategy": "at-least-once",
  "dead-letter-exchange": "EXPOSURENEXUS_JOBS_DLX",
  "dead-letter-routing-key": "exposurenexus.jobs.dead",
};

// Stateful HTTP API double: no sockets, broker, messages, or containers.
function broker() {
  const state = new Map([
    ["overview", { rabbitmq_version: "4.3.5" }],
    [
      "feature-flags",
      ["quorum_queue", "stream_queue", "rabbitmq_4.3.0"].map((name) => ({
        name,
        state: "enabled",
      })),
    ],
    ["users/provisioner", { tags: ["administrator"] }],
  ]);
  const calls = [];
  let clock = 0;
  const double = {
    state,
    calls,
    intercept: async () => undefined,
    options: {
      env: { ...env },
      now: () => clock,
      wait: async (ms) => {
        clock += ms;
      },
      readinessTimeoutMs: 2000,
      policyTimeoutMs: 2000,
      fetchImpl: async (url, options) => {
        assert.equal(url.origin, "http://rabbitmq:15672");
        assert.equal(options.redirect, "error");
        assert.ok(options.signal instanceof AbortSignal);
        assert.equal(
          options.headers.authorization,
          `Basic ${Buffer.from(`${env.RABBITMQ_PROVISIONER_USER}:${env.RABBITMQ_PROVISIONER_PASSWORD}`).toString("base64")}`,
        );
        const path = url.pathname.slice("/api/".length);
        const body = options.body === undefined ? undefined : JSON.parse(options.body);
        const call = { path, method: options.method, body };
        calls.push(call);
        const intercepted = await double.intercept(call);
        if (intercepted !== undefined) return intercepted;
        const parts = path.split("/");
        if (options.method === "GET") {
          if (parts[0] === "users" && parts.length === 3) {
            const type = parts[2];
            return Response.json(
              [...state.entries()]
                .filter(([key]) => key.startsWith(`${type}/`) && key.split("/")[2] === parts[1])
                .map(([key, value]) =>
                  Object.assign({}, value, {
                    vhost: decodeURIComponent(key.split("/")[1]),
                    user: parts[1],
                  }),
                ),
            );
          }
          if (parts[0] === "bindings") return Response.json(state.get(path) ?? []);
          if (!state.has(path)) return new Response(null, { status: 404 });
          const result = structuredClone(state.get(path));
          if (path === sourcePath && state.has(policyPath)) {
            result.policy = "exposurenexus-jobs-retry";
            result.effective_policy_definition = state.get(policyPath).definition;
          }
          return Response.json(result);
        }
        if (options.method === "PUT") {
          state.set(
            parts[0] === "topic-permissions"
              ? `${path}/${encodeURIComponent(body.exchange)}`
              : path,
            parts[0] === "users" ? { ...body, tags: [] } : body,
          );
        } else if (options.method === "POST" && parts[0] === "bindings") {
          state.set(path, [...(state.get(path) ?? []), body]);
        } else if (
          options.method === "DELETE" &&
          ["permissions", "topic-permissions"].includes(parts[0])
        ) {
          if (parts[0] === "topic-permissions") assert.equal(parts.length, 4);
          state.delete(path);
        } else {
          assert.fail(`Unexpected mutation ${options.method} ${path}`);
        }
        return new Response(null, { status: 204 });
      },
    },
  };
  return double;
}

await test("provisions the exact contract and repeats without redeclaring or deleting topology", async () => {
  const api = broker();
  await provisionRabbitmq(api.options);
  assert.deepEqual(api.state.get(policyPath).definition, retryPolicy);
  assert.deepEqual(api.state.get(sourcePath).arguments, { "x-queue-type": "quorum" });
  const first = structuredClone(api.state);
  api.calls.length = 0;
  await provisionRabbitmq(api.options);
  assert.deepEqual(api.state, first);
  assert.equal(
    api.calls.filter(
      ({ path, method }) => /^(queues|exchanges|bindings)\//.test(path) && method !== "GET",
    ).length,
    0,
  );
  assert.equal(api.state.get("users/publisher").password, env.RABBITMQ_API_PASSWORD);
  assert.equal(api.state.get("users/consumer").password, env.RABBITMQ_WORKER_PASSWORD);
  assert.deepEqual(api.state.get("permissions/exposurenexus/publisher"), {
    configure: "^$",
    write: "^EXPOSURENEXUS_JOBS$",
    read: "^$",
  });
  assert.deepEqual(api.state.get("permissions/exposurenexus/consumer"), {
    configure: "^$",
    write: "^$",
    read: "^EXPOSURENEXUS_JOBS_INGEST$",
  });
});

await test("reconciles policy, passwords, tags, and resource/topic permissions across vhosts", async () => {
  const api = broker();
  await provisionRabbitmq(api.options);
  api.state.get(policyPath).definition = { "delivery-limit": 99 };
  for (const user of ["publisher", "consumer"]) {
    api.state.set(`users/${user}`, { tags: ["administrator"], password: "old" });
    for (const host of ["%2F", "other%2Fhost", "exposurenexus"]) {
      api.state.set(`permissions/${host}/${user}`, { configure: ".*", write: ".*", read: ".*" });
      api.state.set(`topic-permissions/${host}/${user}/other%2Fexchange`, {
        exchange: "other/exchange",
        write: ".*",
        read: ".*",
      });
    }
  }
  await provisionRabbitmq(api.options);
  assert.deepEqual(api.state.get(policyPath).definition, retryPolicy);
  for (const user of ["publisher", "consumer"]) {
    assert.deepEqual(api.state.get(`users/${user}`).tags, []);
    assert.equal(api.state.has(`permissions/%2F/${user}`), false);
    assert.equal(api.state.has(`permissions/other%2Fhost/${user}`), false);
    for (const host of ["%2F", "other%2Fhost", "exposurenexus"]) {
      assert.equal(api.state.has(`topic-permissions/${host}/${user}/other%2Fexchange`), false);
    }
  }
});

await test("installs the API topic restriction before granting write access and never deletes it", async () => {
  const api = broker();
  const topicPath = "topic-permissions/exposurenexus/publisher/EXPOSURENEXUS_JOBS";
  for (let run = 0; run < 2; run++) {
    api.calls.length = 0;
    api.intercept = ({ path, method }) => {
      if (path === "permissions/exposurenexus/publisher" && method === "PUT") {
        assert.equal(api.state.get(topicPath)?.write, "^exposurenexus\\.jobs\\.[^.]+$");
      }
    };
    await provisionRabbitmq(api.options);
    const topicPut = api.calls.findIndex(
      ({ path, method }) =>
        path === "topic-permissions/exposurenexus/publisher" && method === "PUT",
    );
    const resourcePut = api.calls.findIndex(
      ({ path, method }) => path === "permissions/exposurenexus/publisher" && method === "PUT",
    );
    assert.ok(topicPut >= 0 && resourcePut > topicPut);
    assert.ok(api.calls.every(({ path, method }) => path !== topicPath || method !== "DELETE"));
  }
});

await test("failed desired topic PUT preserves existing restrictions and does not grant new users write access", async () => {
  for (const existing of [false, true]) {
    const api = broker();
    const topicPath = "topic-permissions/exposurenexus/publisher/EXPOSURENEXUS_JOBS";
    const resourcePath = "permissions/exposurenexus/publisher";
    if (existing) {
      await provisionRabbitmq(api.options);
      api.state.get(topicPath).write = "^exposurenexus\\.jobs\\.ingest$";
    }
    const restriction = structuredClone(api.state.get(topicPath));
    const permissions = structuredClone(api.state.get(resourcePath));
    api.calls.length = 0;
    api.intercept = ({ path, method }) => {
      if (path === "topic-permissions/exposurenexus/publisher" && method === "PUT") {
        return new Response("rejected", { status: 500 });
      }
    };
    await assert.rejects(provisionRabbitmq(api.options), /Management operation failed/);
    assert.deepEqual(api.state.get(topicPath), restriction);
    assert.deepEqual(api.state.get(resourcePath), permissions);
    assert.ok(api.calls.every(({ path, method }) => path !== resourcePath || method !== "PUT"));
    assert.ok(
      api.calls.every(
        ({ path, method }) => !path.startsWith("topic-permissions/") || method !== "DELETE",
      ),
    );
  }
});

for (const [key, value] of [
  ["type", "classic"],
  ["durable", false],
  ["auto_delete", true],
  ["exclusive", true],
  ["arguments", { "x-queue-type": "quorum", "x-delivery-limit": 99 }],
  ["arguments", { "x-queue-type": "quorum", "x-delayed-retry-type": "disabled" }],
  ["arguments", { "x-queue-type": "quorum", "x-message-ttl": 1 }],
]) {
  await test(`rejects immutable queue conflict: ${JSON.stringify(key)} ${JSON.stringify(value)}`, async () => {
    const api = broker();
    await provisionRabbitmq(api.options);
    api.state.get(sourcePath)[key] = value;
    api.calls.length = 0;
    await assert.rejects(provisionRabbitmq(api.options), /Incompatible immutable topology/);
    assert.ok(api.calls.every(({ method }) => method !== "DELETE"));
    assert.ok(
      api.calls.every(({ path, method }) => !path.startsWith("queues/") || method === "GET"),
    );
  });
}

await test("rejects exchange and binding argument conflicts", async () => {
  for (const kind of ["exchange", "binding"]) {
    const api = broker();
    await provisionRabbitmq(api.options);
    if (kind === "exchange") {
      api.state.get("exchanges/exposurenexus/EXPOSURENEXUS_JOBS").arguments = {
        "alternate-exchange": "other",
      };
    } else {
      api.state.get(
        "bindings/exposurenexus/e/EXPOSURENEXUS_JOBS/q/EXPOSURENEXUS_JOBS_INGEST",
      )[0].arguments = { other: true };
    }
    await assert.rejects(provisionRabbitmq(api.options), /Incompatible/);
  }
});

for (const key of Object.keys(retryPolicy)) {
  await test(`rejects effective operator override: ${key}`, async () => {
    const api = broker();
    api.intercept = ({ path, method }) => {
      if (method === "GET" && path === sourcePath && api.state.has(policyPath)) {
        return Response.json(
          Object.assign({}, api.state.get(sourcePath), {
            policy: "exposurenexus-jobs-retry",
            effective_policy_definition: { ...retryPolicy, [key]: "wrong" },
          }),
        );
      }
    };
    await assert.rejects(provisionRabbitmq(api.options), /Effective retry policy/);
    assert.ok(api.calls.filter(({ path }) => path === sourcePath).length < 10);
  });
}

await test("waits for policy propagation and rejects a competing selected policy", async () => {
  for (const competing of [false, true]) {
    const api = broker();
    let reads = 0;
    api.intercept = ({ path, method }) => {
      if (
        method === "GET" &&
        path === sourcePath &&
        api.state.has(policyPath) &&
        (competing || reads++ === 0)
      ) {
        return Response.json(
          Object.assign({}, api.state.get(sourcePath), {
            policy: "other",
            effective_policy_definition: retryPolicy,
          }),
        );
      }
    };
    if (competing) await assert.rejects(provisionRabbitmq(api.options), /Effective retry policy/);
    else await provisionRabbitmq(api.options);
  }
});

await test("waits boundedly for management and recovers from transient failures", async () => {
  const api = broker();
  let attempts = 0;
  api.intercept = ({ path }) => {
    if (path === "overview" && attempts++ < 2) throw new Error("secret network failure");
  };
  await provisionRabbitmq(api.options);
  assert.equal(attempts, 3);
  const unavailable = broker();
  unavailable.intercept = () => new Response("secret", { status: 503 });
  await assert.rejects(provisionRabbitmq(unavailable.options), /readiness deadline/);
  assert.equal(unavailable.calls.length, 3);
});

await test("rejects unsupported versions and missing or disabled requisite features before mutations", async () => {
  for (const version of ["4.2.9", "4.3.0", "4.3.4", "4.3.5-rc.1", "5.0.0", "garbage"]) {
    const api = broker();
    api.state.set("overview", { rabbitmq_version: version });
    await assert.rejects(provisionRabbitmq(api.options), /Unsupported broker version/);
    assert.ok(api.calls.every(({ method }) => method === "GET"));
  }
  for (const name of ["quorum_queue", "stream_queue", "rabbitmq_4.3.0"]) {
    for (const state of ["disabled", "state_changing", "missing"]) {
      const api = broker();
      api.state.set(
        "feature-flags",
        api.state
          .get("feature-flags")
          .filter((flag) => state !== "missing" || flag.name !== name)
          .map((flag) => (flag.name === name ? { ...flag, state } : flag)),
      );
      await assert.rejects(provisionRabbitmq(api.options), /Required broker feature/);
      assert.ok(api.calls.every(({ method }) => method === "GET"));
    }
  }
});

await test("fails closed on unsuccessful writes, malformed JSON, and privilege readback drift", async () => {
  for (const mode of ["write", "json", "privileges", "admin"]) {
    const api = broker();
    api.intercept = ({ path, method }) => {
      if (mode === "write" && method === "PUT") return new Response("secret", { status: 500 });
      if (mode === "json" && path === "feature-flags") return new Response("secret-not-json");
      if (mode === "privileges" && path === "users/publisher" && method === "GET")
        return Response.json({ tags: ["management"] });
      if (mode === "admin" && path === "users/provisioner")
        return Response.json({ tags: ["management"] });
    };
    await assert.rejects(provisionRabbitmq(api.options), (error) => {
      assert.doesNotMatch(error.message, /secret/);
      assert.equal(error.cause, undefined);
      return true;
    });
  }
});

await test("authentication failure is immediate and never includes response credentials", async () => {
  for (const status of [401, 403]) {
    const api = broker();
    api.intercept = () => new Response(JSON.stringify(env), { status });
    await assert.rejects(provisionRabbitmq(api.options), /authentication\/authorization failed/);
    assert.equal(api.calls.length, 1);
  }
});

await test("fails on rejected bindings and permission revocations without deleting topology", async () => {
  for (const operation of ["POST", "DELETE"]) {
    const api = broker();
    api.state.set("permissions/%2F/publisher", { configure: ".*", write: ".*", read: ".*" });
    api.intercept = ({ method }) => {
      if (method === operation) return new Response(JSON.stringify(env), { status: 400 });
    };
    await assert.rejects(provisionRabbitmq(api.options), /Management operation failed/);
    assert.ok(
      api.calls.every(({ path, method }) => method !== "DELETE" || path.startsWith("permissions/")),
    );
  }
});

await test("does not accept successful writes without matching resource and policy readback", async () => {
  for (const target of [sourcePath, policyPath]) {
    const api = broker();
    api.intercept = ({ path, method }) => {
      if (path === target && method === "PUT") return new Response(null, { status: 204 });
    };
    await assert.rejects(provisionRabbitmq(api.options), /Management operation failed/);
  }
});

await test("rejects invalid account configuration and unsafe URLs before network access", async () => {
  for (const change of [
    { RABBITMQ_API_USER: "provisioner" },
    { RABBITMQ_WORKER_USER: "publisher" },
    { RABBITMQ_PROVISIONER_USER: "colon:name" },
    { RABBITMQ_API_USER: "guest" },
    { RABBITMQ_WORKER_USER: "../other" },
    { RABBITMQ_API_USER: "" },
    { RABBITMQ_API_PASSWORD: "" },
    { RABBITMQ_WORKER_PASSWORD: undefined },
    { RABBITMQ_PROVISIONER_PASSWORD: "secret\n" },
    { RABBITMQ_MANAGEMENT_URL: "http://user:secret@rabbitmq:15672" },
    { RABBITMQ_MANAGEMENT_URL: "http://rabbitmq:15672?secret" },
    { RABBITMQ_MANAGEMENT_URL: "file:///secret" },
    { RABBITMQ_MANAGEMENT_URL: "not a URL secret" },
  ]) {
    const api = broker();
    api.options.env = { ...env, ...change };
    await assert.rejects(provisionRabbitmq(api.options), (error) => {
      assert.doesNotMatch(error.message, /secret/);
      return true;
    });
    assert.equal(api.calls.length, 0);
  }
});

await test("sanitizes thrown transport errors and enforces a deadline on stalled fetches", async () => {
  const api = broker();
  api.options.requestTimeoutMs = 5;
  api.intercept = ({ path }) => {
    if (path === "feature-flags") throw new Error(JSON.stringify(env));
  };
  await assert.rejects(provisionRabbitmq(api.options), /underlying details suppressed/);
  // Keep the test alive because AbortSignal.timeout uses an unreferenced timer.
  const keepAlive = setInterval(() => {}, 1000);
  try {
    await assert.rejects(
      provisionRabbitmq({
        ...api.options,
        fetchImpl: (_url, { signal }) =>
          new Promise((_resolve, reject) =>
            signal.addEventListener("abort", () => reject(signal.reason), { once: true }),
          ),
      }),
      /readiness deadline/,
    );
  } finally {
    clearInterval(keepAlive);
  }
});

await test("CLI exits nonzero with sanitized configuration diagnostics", () => {
  const result = spawnSync(
    process.execPath,
    [new URL("./rabbitmq-init.mjs", import.meta.url).pathname],
    {
      env: { ...env, RABBITMQ_API_USER: "secret:unsafe" },
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /Invalid required account configuration/);
  assert.doesNotMatch(result.stderr, /secret:unsafe|at provisionRabbitmq/);
});
