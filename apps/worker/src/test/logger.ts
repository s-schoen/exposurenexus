import { vi } from "vitest";

import type { Logger } from "pino";

const levels = ["fatal", "error", "warn", "info", "debug", "trace"] as const;

export interface LogEntry {
  level: (typeof levels)[number];
  /** Child bindings merged with the call's fields. */
  fields: Record<string, unknown>;
  message: string | undefined;
}

/** Creates a fake pino logger that records every entry of itself and its children. */
export function recordingLogger(
  bindings: Record<string, unknown> = {},
  entries: LogEntry[] = [],
): Logger & { entries: LogEntry[] } {
  const log = (level: LogEntry["level"]) =>
    vi.fn((fields?: Record<string, unknown> | string, message?: string) => {
      entries.push(
        typeof fields === "string"
          ? { level, fields: { ...bindings }, message: fields }
          : { level, fields: { ...bindings, ...fields }, message },
      );
    });
  return {
    entries,
    child: (more: Record<string, unknown>) => recordingLogger({ ...bindings, ...more }, entries),
    ...Object.fromEntries(levels.map((level) => [level, log(level)])),
  } as unknown as Logger & { entries: LogEntry[] };
}
