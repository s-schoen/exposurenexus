import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const available = spawnSync("docker", ["compose", "version"], { encoding: "utf8" });
const credentials = {
  RABBITMQ_PROVISIONER_USER: "provisioner",
  RABBITMQ_PROVISIONER_PASSWORD: "provisioner-test-password",
  RABBITMQ_API_USER: "publisher",
  RABBITMQ_API_PASSWORD: "publisher-test-password",
  RABBITMQ_WORKER_USER: "consumer",
  RABBITMQ_WORKER_PASSWORD: "consumer-test-password",
  RABBITMQ_API_URL: "amqp://publisher:publisher-test-password@rabbitmq:5672/exposurenexus",
  RABBITMQ_WORKER_URL: "amqp://consumer:consumer-test-password@rabbitmq:5672/exposurenexus",
};

for (const development of [false, true]) {
  await test(
    `Compose ${development ? "development" : "base"} wiring`,
    {
      skip:
        available.status !== 0 && "Docker Compose is unavailable (rendering only; no containers)",
    },
    () => {
      const args = ["compose", "--env-file", "/dev/null", "-f", "docker-compose.yaml"];
      if (development) args.push("-f", "docker-compose.dev.yaml");
      args.push("config", "--format", "json");
      const rendered = spawnSync("docker", args, {
        cwd: new URL("../", import.meta.url),
        env: { ...process.env, ...credentials, APP_IMAGE: "exposurenexus:compose-test" },
        encoding: "utf8",
      });
      assert.equal(rendered.status, 0, rendered.stderr);
      const { services } = JSON.parse(rendered.stdout);
      const { app, worker, postgres, rabbitmq } = services;
      assert.equal(app.image, "exposurenexus:compose-test");
      assert.equal(worker.image, app.image);
      assert.deepEqual(app.command, ["api"]);
      assert.deepEqual(worker.command, ["worker"]);
      for (const service of [app, worker]) {
        assert.equal(service.depends_on.postgres.condition, "service_healthy");
        assert.equal(service.depends_on.rabbitmq.condition, "service_healthy");
        assert.equal(
          service.depends_on["rabbitmq-init"].condition,
          "service_completed_successfully",
        );
        assert.equal(service.restart, "unless-stopped");
        assert.equal(service.stop_grace_period, "1m15s");
        assert.equal(service.read_only, true);
        assert.deepEqual(service.cap_drop, ["ALL"]);
        assert.deepEqual(service.security_opt, ["no-new-privileges:true"]);
        assert.equal(service.container_name, undefined);
        assert.equal(service.profiles, undefined);
        for (const key of Object.keys(credentials))
          assert.equal(service.environment[key], undefined);
      }
      assert.equal(app.environment.RABBITMQ_URL, credentials.RABBITMQ_API_URL);
      assert.equal(worker.environment.RABBITMQ_URL, credentials.RABBITMQ_WORKER_URL);
      assert.equal(worker.environment.DATABASE_URL, app.environment.DATABASE_URL);
      assert.equal(app.environment.RABBITMQ_EXCHANGE, "EXPOSURENEXUS_JOBS");
      assert.deepEqual(Object.keys(worker.environment).sort(), [
        "DATABASE_URL",
        "LOG_LEVEL",
        "RABBITMQ_QUEUE",
        "RABBITMQ_URL",
      ]);
      assert.equal(worker.depends_on.app.condition, "service_healthy");
      assert.ok(app.healthcheck.test.includes("/nodejs/bin/node"));
      assert.equal(worker.healthcheck, undefined);
      assert.equal(worker.ports, undefined);
      assert.equal(services["rabbitmq-init"].restart, "no");
      assert.equal(services["rabbitmq-init"].depends_on.rabbitmq.condition, "service_healthy");
      for (const [service, targets] of [
        [postgres, [5432]],
        [rabbitmq, [5672, 15672]],
      ]) {
        if (!development) {
          assert.equal(service.ports, undefined);
          continue;
        }
        assert.deepEqual(
          service.ports.map((port) => port.target),
          targets,
        );
        for (const port of service.ports) {
          assert.equal(port.host_ip, "127.0.0.1");
          assert.equal(port.published, String(port.target));
        }
      }
    },
  );
}
