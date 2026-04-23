import { describe, expect, it } from "vitest"
import { hashPlaintextPassword, verifyPasswordHash } from "./argon2.js"

describe("password hash helpers", () => {
  it("hashes plaintext passwords with argon2id and verifies them", async () => {
    const passwordHash = await hashPlaintextPassword(
      "correct-horse-battery-staple"
    )

    expect(passwordHash).toMatch(
      /^\$argon2id\$v=19\$m=\d+,t=\d+,p=\d+\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/
    )
    await expect(
      verifyPasswordHash("correct-horse-battery-staple", passwordHash)
    ).resolves.toBe(true)
  })

  it("rejects non-matching plaintext passwords", async () => {
    const passwordHash = await hashPlaintextPassword(
      "correct-horse-battery-staple"
    )

    await expect(
      verifyPasswordHash("wrong-horse-battery-staple", passwordHash)
    ).resolves.toBe(false)
  })

  it("uses a random salt for each hash", async () => {
    const firstPasswordHash = await hashPlaintextPassword(
      "correct-horse-battery-staple"
    )
    const secondPasswordHash = await hashPlaintextPassword(
      "correct-horse-battery-staple"
    )

    expect(firstPasswordHash).not.toBe(secondPasswordHash)
    await expect(
      verifyPasswordHash("correct-horse-battery-staple", firstPasswordHash)
    ).resolves.toBe(true)
    await expect(
      verifyPasswordHash("correct-horse-battery-staple", secondPasswordHash)
    ).resolves.toBe(true)
  })

  it("rejects malformed or unsupported password hashes", async () => {
    await expect(
      verifyPasswordHash(
        "correct-horse-battery-staple",
        "$argon2id$v=18$m=65536,t=3,p=4$invalid$invalid"
      )
    ).resolves.toBe(false)
    await expect(
      verifyPasswordHash("correct-horse-battery-staple", "not-a-password-hash")
    ).resolves.toBe(false)
  })

  it("rejects valid-looking hashes with non-positive cost parameters", async () => {
    await expect(
      verifyPasswordHash(
        "correct-horse-battery-staple",
        "$argon2id$v=19$m=65536,t=0,p=4$MDEyMzQ1Njc$YWJjZA"
      )
    ).resolves.toBe(false)
    await expect(
      verifyPasswordHash(
        "correct-horse-battery-staple",
        "$argon2id$v=19$m=65536,t=3,p=0$MDEyMzQ1Njc$YWJjZA"
      )
    ).resolves.toBe(false)
  })

  it("rejects valid-looking hashes with memory below argon2 requirements", async () => {
    await expect(
      verifyPasswordHash(
        "correct-horse-battery-staple",
        "$argon2id$v=19$m=32,t=3,p=5$MDEyMzQ1Njc$YWJjZA"
      )
    ).resolves.toBe(false)
  })

  it("rejects valid-looking hashes with too-short decoded salts or hashes", async () => {
    await expect(
      verifyPasswordHash(
        "correct-horse-battery-staple",
        "$argon2id$v=19$m=65536,t=3,p=4$AA$YWJjZA"
      )
    ).resolves.toBe(false)
    await expect(
      verifyPasswordHash(
        "correct-horse-battery-staple",
        "$argon2id$v=19$m=65536,t=3,p=4$MDEyMzQ1Njc$A"
      )
    ).resolves.toBe(false)
  })

  it("rejects hashes whose numeric parameters are still out of range for argon2", async () => {
    await expect(
      verifyPasswordHash(
        "correct-horse-battery-staple",
        "$argon2id$v=19$m=9007199254740991,t=3,p=4$MDEyMzQ1Njc$YWJjZA"
      )
    ).resolves.toBe(false)
  })
})
