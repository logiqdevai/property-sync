const MASKED_SECRET_PREFIX = "••••";

export function isMaskedSecretValue(value: string | undefined | null): boolean {
  return !!value && value.startsWith(MASKED_SECRET_PREFIX);
}
