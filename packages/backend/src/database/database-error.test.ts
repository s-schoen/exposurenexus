import { describe, expect, it } from "vitest";

import { isConflictError, isForeignKeyError } from "./database-error.js";

describe("database error classifiers", () => {
  it("detects conflict-shaped errors", () => {
    expect(isConflictError(new Error("role already exists"))).toBe(true);
    expect(isConflictError(new Error("duplicate key value"))).toBe(true);
    expect(isConflictError(Object.assign(new Error("db error"), { code: "23505" }))).toBe(true);
  });

  it("rejects non-conflict errors", () => {
    expect(isConflictError("duplicate" as never)).toBe(false);
    expect(isConflictError(new Error("db offline"))).toBe(false);
  });

  it("detects foreign-key-shaped errors", () => {
    expect(
      isForeignKeyError(
        Object.assign(new Error("violates foreign key constraint"), {
          code: "23503",
        }),
      ),
    ).toBe(true);
    expect(isForeignKeyError(new Error("foreign key violation"))).toBe(true);
  });

  it("rejects non-foreign-key errors", () => {
    expect(isForeignKeyError("foreign key" as never)).toBe(false);
    expect(isForeignKeyError(new Error("db offline"))).toBe(false);
  });
});
