import { argon2, randomBytes } from "node:crypto";

const PASSWORD_HASH_ALGORITHM = "argon2id";
const PASSWORD_HASH_VERSION = 19;
const PASSWORD_HASH_MEMORY_KIB = 65536;
const PASSWORD_HASH_PASSES = 3;
const PASSWORD_HASH_PARALLELISM = 4;
const PASSWORD_HASH_SALT_LENGTH = 16;
const PASSWORD_HASH_TAG_LENGTH = 32;

export async function hashPlaintextPassword(password: string): Promise<string> {
  const salt = randomBytes(PASSWORD_HASH_SALT_LENGTH);
  const hash = await new Promise<Buffer>((resolve, reject) => {
    argon2(
      PASSWORD_HASH_ALGORITHM,
      {
        message: password,
        nonce: salt,
        memory: PASSWORD_HASH_MEMORY_KIB,
        passes: PASSWORD_HASH_PASSES,
        parallelism: PASSWORD_HASH_PARALLELISM,
        tagLength: PASSWORD_HASH_TAG_LENGTH,
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

  return `$${PASSWORD_HASH_ALGORITHM}$v=${PASSWORD_HASH_VERSION}$m=${PASSWORD_HASH_MEMORY_KIB},t=${PASSWORD_HASH_PASSES},p=${PASSWORD_HASH_PARALLELISM}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}
