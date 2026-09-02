import { argon2, randomBytes } from "node:crypto";

const PASSWORD_HASH_ALGORITHM = "argon2id";
const PASSWORD_HASH_VERSION = 19;
const PASSWORD_HASH_MEMORY_KIB = 65536;
const PASSWORD_HASH_PASSES = 3;
const PASSWORD_HASH_PARALLELISM = 4;
const PASSWORD_HASH_SALT_LENGTH = 16;
const PASSWORD_HASH_TAG_LENGTH = 32;

type Argon2Algorithm = "argon2d" | "argon2i" | "argon2id";

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

  const { promise, resolve, reject } = Promise.withResolvers<Buffer>();
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
  return await promise;
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
