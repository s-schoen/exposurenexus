import type { Database } from "./database/index.js";
import type { Kysely } from "kysely";
import type { Logger } from "pino";

const runtimeBrand: unique symbol = Symbol("BackendRuntime");

type RuntimeValueKey = object;

interface RuntimeState {
  database: Kysely<Database>;
  logger: Logger;
  values: Map<RuntimeValueKey, unknown>;
}

export interface BackendRuntime {
  readonly [runtimeBrand]: true;
}

export interface CreateBackendRuntimeOptions {
  database: Kysely<Database>;
  logger: Logger;
}

const runtimeStates = new WeakMap<BackendRuntime, RuntimeState>();

export function createBackendRuntime(options: CreateBackendRuntimeOptions): BackendRuntime {
  const runtime = Object.freeze({}) as BackendRuntime;
  runtimeStates.set(runtime, {
    database: options.database,
    logger: options.logger,
    values: new Map(),
  });
  return runtime;
}

function getRuntimeState(runtime: BackendRuntime): RuntimeState {
  const state = runtimeStates.get(runtime);
  if (!state) {
    throw new TypeError("invalid backend runtime");
  }
  return state;
}

export function getRuntimeDatabase(runtime: BackendRuntime): Kysely<Database> {
  return getRuntimeState(runtime).database;
}

export function getRuntimeLogger(runtime: BackendRuntime): Logger {
  return getRuntimeState(runtime).logger;
}

export function getOrCreateRuntimeValue<T>(
  runtime: BackendRuntime,
  key: RuntimeValueKey,
  create: () => T,
): T {
  const values = getRuntimeState(runtime).values;
  if (values.has(key)) {
    return values.get(key) as T;
  }

  const value = create();
  values.set(key, value);
  return value;
}
