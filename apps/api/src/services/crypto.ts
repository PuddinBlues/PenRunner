import { createHash, randomBytes } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";

// Parametri argon2id secondo le raccomandazioni OWASP correnti.
const ARGON2_OPTS = {
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTS);
}

export async function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/** Genera un token opaco da consegnare all'utente (mai salvato in chiaro). */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Nel database si salva solo l'hash del token. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
