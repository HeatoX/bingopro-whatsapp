import crypto from 'crypto';

export function generateServerSeed(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function hashSeed(seed: string): string {
  return crypto.createHash('sha256').update(seed).digest('hex');
}

export function generateIdempotencyKey(...parts: string[]): string {
  return crypto.createHash('sha256').update(parts.join(':')).digest('hex');
}
