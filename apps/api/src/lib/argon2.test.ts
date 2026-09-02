import { describe, expect, it } from "vitest";

import { hashPlaintextPassword } from "./argon2.js";

describe("password hash helper", () => {
  it("hashes plaintext passwords with argon2id", async () => {
    const passwordHash = await hashPlaintextPassword("correct-horse-battery-staple");

    expect(passwordHash).toMatch(
      /^\$argon2id\$v=19\$m=\d+,t=\d+,p=\d+\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/,
    );
  });

  it("uses a random salt for each hash", async () => {
    const firstPasswordHash = await hashPlaintextPassword("correct-horse-battery-staple");
    const secondPasswordHash = await hashPlaintextPassword("correct-horse-battery-staple");

    expect(firstPasswordHash).not.toBe(secondPasswordHash);
  });
});
