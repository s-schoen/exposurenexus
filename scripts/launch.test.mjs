import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const launcher = new URL("./launch.mjs", import.meta.url).href;
const api = new URL("../apps/api/dist/src/index.js", import.meta.url).href;
const worker = new URL("../apps/worker/dist/src/index.js", import.meta.url).href;

function launch(args, source = 'console.log("started");') {
  return spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `
        import { registerHooks } from "node:module";
        registerHooks({
          resolve(specifier, context, nextResolve) {
            const url = new URL(specifier, context.parentURL).href;
            if (${JSON.stringify([api, worker])}.includes(url)) {
              return { url, shortCircuit: true };
            }
            return nextResolve(specifier, context);
          },
          load(url, context, nextLoad) {
            if (${JSON.stringify([api, worker])}.includes(url)) {
              console.log(url);
              return { format: "module", source: ${JSON.stringify(source)}, shortCircuit: true };
            }
            return nextLoad(url, context);
          }
        });
        process.argv = [process.execPath, ${JSON.stringify(launcher)}, ...${JSON.stringify(args)}];
        await import(${JSON.stringify(launcher)});
      `,
    ],
    { cwd: "/", encoding: "utf8", timeout: 5000, env: { NODE_ENV: "production" } },
  );
}

for (const { label, args, entrypoint } of [
  { label: "default API", args: [], entrypoint: api },
  { label: "explicit API", args: ["api"], entrypoint: api },
  { label: "worker", args: ["worker"], entrypoint: worker },
]) {
  await test(`${label} loads only its own entrypoint without configuration or cwd assumptions`, () => {
    const result = launch(args);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, `${entrypoint}\nstarted\n`);
    assert.equal(result.stderr, "");
  });
}

for (const args of [
  ["relay"],
  ["API"],
  [""],
  ["--help"],
  ["api", "extra"],
  ["worker", "api"],
  ["worker", "--flag"],
]) {
  await test(`rejects ${JSON.stringify(args)} before importing either application`, () => {
    const result = launch(args, 'throw new Error("application must not load");');
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /Usage: exposurenexus \[api\|worker\]/);
    assert.doesNotMatch(result.stderr, /application must not load/);
  });
}

for (const role of ["api", "worker"]) {
  await test(`${role} propagates module startup failure`, () => {
    const result = launch([role], 'throw new Error("controlled startup failure");');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /controlled startup failure/);
  });

  await test(`${role} preserves application exit status`, () => {
    const result = launch([role], "process.exitCode = 23;");
    assert.equal(result.status, 23, result.stderr);
  });

  await test(`${role} propagates asynchronous startup failure`, () => {
    const result = launch([role], 'await Promise.reject(new Error("async startup failure"));');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /async startup failure/);
  });
}
