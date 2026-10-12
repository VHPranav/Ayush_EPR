// Unambiguous characters only (no 0/O, 1/l/I) so a generated password can be read out or typed from a note.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

export const MIN_PASSWORD = 12;

export function generatePassword(length = 16): string {
  const limit = 256 - (256 % ALPHABET.length); // rejection sampling: no modulo bias
  let out = "";
  while (out.length < length) {
    for (const b of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (b < limit && out.length < length) out += ALPHABET[b % ALPHABET.length];
    }
  }
  return out;
}
