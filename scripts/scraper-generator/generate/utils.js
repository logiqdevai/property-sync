import crypto from 'crypto';

export function uuid() {
  return crypto.randomUUID();
}

export function extractJSON(text) {
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlock) return JSON.parse(codeBlock[1]);
  const raw = text.match(/\{[\s\S]*\}/);
  if (raw) return JSON.parse(raw[0]);
  throw new Error('No JSON found in response');
}
