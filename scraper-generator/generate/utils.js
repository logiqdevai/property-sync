import crypto from 'crypto';

export function uid() {
  return crypto.randomBytes(4).toString('hex');
}

export function extractJSON(text) {
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlock) return JSON.parse(codeBlock[1]);
  const raw = text.match(/\{[\s\S]*\}/);
  if (raw) return JSON.parse(raw[0]);
  throw new Error('No JSON found in response');
}
