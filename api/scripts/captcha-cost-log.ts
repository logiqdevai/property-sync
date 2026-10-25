import { PrismaPg } from '@prisma/adapter-pg';
import { CostOperationType, IntegrationType, PrismaClient } from '../src/generated/prisma';
import { DEFAULT_CAPTCHA_SOLVE_COST_USD } from '../src/integrations/captcha/constants/captcha.constants';

/**
 * Shared by the CLI captcha scripts (solve-captcha.ts, mcp-autocrawl.ts): writes one CAPTCHA row to
 * cost_logs per paid 2captcha solve. Best-effort -- a failed log must never lose a token that is
 * already paid for. Needs DATABASE_URL (run through `dotenv -e .env.staging`). When 2captcha does
 * not report a cost, the usual per-solve rate is logged with metadata.estimated = true so the
 * solve still shows up in the totals.
 */
export async function recordCaptchaCost(
  kind: string,
  taskId: number,
  cost: string | undefined,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error('captcha cost NOT logged: DATABASE_URL is not set (run via dotenv -e .env.staging)');
    return;
  }
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  try {
    await prisma.costLog.create({
      data: {
        operation_type: CostOperationType.CAPTCHA,
        provider: IntegrationType.TWOCAPTCHA,
        model: kind,
        unit_count: 1,
        total_cost: cost ?? DEFAULT_CAPTCHA_SOLVE_COST_USD,
        metadata: { taskId, ...(cost == null ? { estimated: true } : {}), ...metadata } as object,
      },
    });
  } catch (e) {
    console.error(`captcha cost log failed: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    await prisma.$disconnect();
  }
}
