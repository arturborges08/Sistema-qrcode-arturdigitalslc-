import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// scrypt nativo do Node (sem dependências nativas). Parâmetros: N=2^15, r=8, p=1 (~32 MiB por hash).
const N = 32768;
const R = 8;
const P = 1;
const KEYLEN = 64;
const MAXMEM = 64 * 1024 * 1024;

function scryptAsync(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEYLEN, { N: n, r, p, maxmem: MAXMEM }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, keyB64] = parts;
  const expected = Buffer.from(keyB64, "base64");
  const key = await scryptAsync(password, Buffer.from(saltB64, "base64"), Number(n), Number(r), Number(p));
  return key.length === expected.length && timingSafeEqual(key, expected);
}

// Hash usado quando o e-mail não existe, para o tempo de resposta não revelar quais e-mails existem.
let dummyHash: Promise<string> | undefined;
export function getDummyHash(): Promise<string> {
  if (!dummyHash) dummyHash = hashPassword(randomBytes(16).toString("hex"));
  return dummyHash;
}

export const MIN_PASSWORD_LENGTH = 12;
