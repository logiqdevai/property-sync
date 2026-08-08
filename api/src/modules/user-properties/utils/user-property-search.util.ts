import { Prisma } from 'generated/prisma';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseSearchTokens(search: string): string[] {
  return search
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);
}

export function buildUserPropertySearchOr(
  search: string,
  options?: { includeUserEmail?: boolean },
): Prisma.UserPropertyWhereInput['OR'] {
  const trimmed = search.trim();
  if (!trimmed) return undefined;

  if (trimmed.includes(',')) {
    const tokens = parseSearchTokens(trimmed);
    if (tokens.length === 0) return undefined;

    const uuidIds = tokens.filter((token) => UUID_RE.test(token));
    const or: Prisma.UserPropertyWhereInput[] = [];

    if (uuidIds.length > 0) {
      or.push({ id: { in: uuidIds } });
    }
    or.push(
      { property_id: { in: tokens } },
      { internal_id: { in: tokens } },
      { integration_property_id: { in: tokens } },
    );

    return or;
  }

  const or: Prisma.UserPropertyWhereInput[] = [
    { id: { equals: trimmed } },
    { property_id: { contains: trimmed, mode: 'insensitive' } },
    { internal_id: { contains: trimmed, mode: 'insensitive' } },
    {
      integration_property_id: {
        contains: trimmed,
        mode: 'insensitive',
      },
    },
    { title: { contains: trimmed, mode: 'insensitive' } },
    { city: { contains: trimmed, mode: 'insensitive' } },
    { district: { contains: trimmed, mode: 'insensitive' } },
  ];

  if (options?.includeUserEmail) {
    or.push({
      user: {
        email: { contains: trimmed, mode: 'insensitive' },
      },
    });
  }

  return or;
}
