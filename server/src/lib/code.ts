import { randomInt } from "node:crypto";

// Sem caracteres ambíguos (0/O, 1/I/l). 57 símbolos ^ 8 posições ≈ 1,1 × 10^14 combinações (~46,7 bits).
export const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export const CODE_LENGTH = 8;

// Aceita qualquer alfanumérico de 4 a 32 caracteres para não quebrar códigos se o alfabeto mudar no futuro.
export const CODE_PATTERN = /^[A-Za-z0-9]{4,32}$/;

export function generateCode(length = CODE_LENGTH): string {
  let out = "";
  // randomInt usa CSPRNG e não tem viés de módulo.
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return out;
}
