import crypto from 'crypto';

export function uid() {
  return crypto.randomBytes(6).toString('hex');
}

export function now() {
  return new Date().toISOString();
}

export function contentHash(obj) {
  return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex').slice(0, 16);
}
