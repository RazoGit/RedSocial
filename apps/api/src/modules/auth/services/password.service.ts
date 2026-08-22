import { Injectable } from "@nestjs/common";
import { hash, verify } from "@node-rs/argon2";

/**
 * Parametros OWASP 2024+ para argon2id (plan 001, decision D3):
 * 19 MiB de memoria, 2 iteraciones, paralelismo 1.
 */
const ARGON2ID_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class PasswordService {
  async hashPassword(plain: string): Promise<string> {
    return hash(plain, ARGON2ID_OPTIONS);
  }

  async verifyPassword(storedHash: string, plain: string): Promise<boolean> {
    try {
      return await verify(storedHash, plain, ARGON2ID_OPTIONS);
    } catch {
      return false;
    }
  }
}
