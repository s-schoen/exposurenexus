import { argon2, randomBytes, timingSafeEqual } from "node:crypto";

import { z } from "zod/v4";

const PASSWORD_HASH_ALGORITHM = "argon2id";
const PASSWORD_HASH_VERSION = 19;
const PASSWORD_HASH_MEMORY_KIB = 65536;
const PASSWORD_HASH_PASSES = 3;
const PASSWORD_HASH_PARALLELISM = 4;
const PASSWORD_HASH_SALT_LENGTH = 16;
const PASSWORD_HASH_TAG_LENGTH = 32;
const passwordHashRegex =
  /^\$(argon2id)\$v=(\d+)\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)$/;
const passwordHashSchema = z.string().regex(passwordHashRegex);

type Argon2Algorithm = "argon2d" | "argon2i" | "argon2id";

interface PasswordHashParameters {
  algorithm: Argon2Algorithm;
  memory: number;
  passes: number;
  parallelism: number;
  salt: Buffer;
  hash: Buffer;
}

function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

async function deriveArgon2Key(
  algorithm: Argon2Algorithm,
  {
    password,
    salt,
    memory,
    passes,
    parallelism,
    tagLength,
  }: {
    password: string;
    salt: Buffer;
    memory: number;
    passes: number;
    parallelism: number;
    tagLength: number;
  },
): Promise<Buffer> {
  if (typeof argon2 !== "function") {
    throw new Error("node:crypto argon2 requires Node.js 24.7.0 or newer");
  }

  return await new Promise((resolve, reject) => {
    argon2(
      algorithm,
      {
        message: password,
        nonce: salt,
        memory,
        passes,
        parallelism,
        tagLength,
      },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(derivedKey);
      },
    );
  });
}

function parsePasswordHash(passwordHash: string): PasswordHashParameters | null {
  const parsedPasswordHash = passwordHashSchema.safeParse(passwordHash);
  if (!parsedPasswordHash.success) {
    return null;
  }

  const [, algorithm, versionText, memoryText, passesText, parallelismText, saltText, hashText] =
    passwordHashRegex.exec(parsedPasswordHash.data)!;
  const version = Number(versionText);
  const memory = Number(memoryText);
  const passes = Number(passesText);
  const parallelism = Number(parallelismText);
  const salt = Buffer.from(saltText, "base64url");
  const hash = Buffer.from(hashText, "base64url");

  if (version !== PASSWORD_HASH_VERSION) {
    return null;
  }

  if (
    algorithm !== PASSWORD_HASH_ALGORITHM ||
    !isPositiveSafeInteger(memory) ||
    !isPositiveSafeInteger(passes) ||
    !isPositiveSafeInteger(parallelism)
  ) {
    return null;
  }

  if (memory < Math.max(32, parallelism * 8)) {
    return null;
  }

  if (salt.length < 8) {
    return null;
  }

  if (hash.length < 4) {
    return null;
  }

  return {
    algorithm: PASSWORD_HASH_ALGORITHM,
    memory,
    passes,
    parallelism,
    salt,
    hash,
  };
}

export async function hashPlaintextPassword(password: string): Promise<string> {
  const salt = randomBytes(PASSWORD_HASH_SALT_LENGTH);
  const hash = await deriveArgon2Key(PASSWORD_HASH_ALGORITHM, {
    password,
    salt,
    memory: PASSWORD_HASH_MEMORY_KIB,
    passes: PASSWORD_HASH_PASSES,
    parallelism: PASSWORD_HASH_PARALLELISM,
    tagLength: PASSWORD_HASH_TAG_LENGTH,
  });

  return `$${PASSWORD_HASH_ALGORITHM}$v=${PASSWORD_HASH_VERSION}$m=${PASSWORD_HASH_MEMORY_KIB},t=${PASSWORD_HASH_PASSES},p=${PASSWORD_HASH_PARALLELISM}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export async function verifyPasswordHash(password: string, passwordHash: string): Promise<boolean> {
  const parsedPasswordHash = parsePasswordHash(passwordHash);
  if (!parsedPasswordHash) {
    return false;
  }

  try {
    const derivedHash = await deriveArgon2Key(parsedPasswordHash.algorithm, {
      password,
      salt: parsedPasswordHash.salt,
      memory: parsedPasswordHash.memory,
      passes: parsedPasswordHash.passes,
      parallelism: parsedPasswordHash.parallelism,
      tagLength: parsedPasswordHash.hash.length,
    });

    return timingSafeEqual(derivedHash, parsedPasswordHash.hash);
  } catch {
    return false;
  }
}
