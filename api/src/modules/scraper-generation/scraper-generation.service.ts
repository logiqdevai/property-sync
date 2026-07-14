import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { UserIntegrationsService } from '@/modules/user-integrations/user-integrations.service';
import { GENERATION_QUEUE } from '@/core/queues/queues.constants';
import {
  AiProvider,
  GenerationRunStatus,
  GenerationTrigger,
  IntegrationType,
  Prisma,
  ScraperStatus,
  ScraperVersionCreatedBy,
} from 'generated/prisma';
import { CreateGenerationRunDto } from './dto/create-generation-run.dto';
import { RejectGenerationRunDto } from './dto/reject-generation-run.dto';
import { GenerationRunQueryType } from './dto/generation-run-query.schema';
import { PaginatedResult } from './interfaces/generation-run.interface';

const TERMINAL_STATUSES: GenerationRunStatus[] = [
  GenerationRunStatus.SUCCESS,
  GenerationRunStatus.FAILED,
  GenerationRunStatus.CANCELLED,
];

@Injectable()
export class ScraperGenerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userIntegrationsService: UserIntegrationsService,
    @InjectQueue(GENERATION_QUEUE) private readonly generationQueue: Queue,
  ) {}

  async findAll(
    query: GenerationRunQueryType,
  ): Promise<PaginatedResult<any>> {
    const where = {
      ...(query.status && { status: query.status }),
      ...(query.trigger && { trigger: query.trigger }),
      ...(query.source_agency_id && {
        source_agency_id: query.source_agency_id,
      }),
      ...(query.scraper_id && { scraper_id: query.scraper_id }),
    };

    const [items, total] = await Promise.all([
      this.prisma.scraperGenerationRun.findMany({
        where,
        include: {
          source_agency: { select: { name: true } },
          scraper: { select: { name: true } },
        },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.scraperGenerationRun.count({ where }),
    ]);

    return {
      data: items,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        total_pages: Math.ceil(total / query.limit),
        has_next: query.page < Math.ceil(total / query.limit),
        has_prev: query.page > 1,
      },
    };
  }

  async findOne(id: string) {
    const run = await this.prisma.scraperGenerationRun.findUnique({
      where: { id },
      include: {
        source_agency: { select: { name: true } },
        scraper: { select: { name: true } },
        steps: { orderBy: { step_index: 'asc' } },
      },
    });

    if (!run) {
      throw new NotFoundException('Generation run not found');
    }

    return run;
  }

  async create(dto: CreateGenerationRunDto, initiatedByUserId: string) {
    await this.userIntegrationsService.resolveActiveApiKey(
      initiatedByUserId,
      IntegrationType.ANTHROPIC,
    );

    const run = await this.prisma.scraperGenerationRun.create({
      data: {
        source_agency_id: dto.source_agency_id,
        scraper_id: dto.scraper_id,
        trigger: GenerationTrigger.MANUAL,
        status: GenerationRunStatus.QUEUED,
        prompt: dto.prompt,
      },
    });

    await this.generationQueue.add('generate', {
      runId: run.id,
      initiatedByUserId,
    });

    return run;
  }

  /**
   * Internal, non-HTTP entry point for Feature 05's broken-scraper self-heal detection.
   * Non-MANUAL triggers have no admin initiator, so the Anthropic key is resolved from the
   * agency's own enabled trackers instead of a caller-supplied user id.
   */
  async trigger(
    sourceAgencyId: string,
    scraperId: string | null,
    trigger: GenerationTrigger,
    prompt?: string,
  ) {
    let initiatedByUserId: string | undefined;

    if (trigger !== GenerationTrigger.MANUAL) {
      const resolved = await this.userIntegrationsService.resolveForSourceAgency(
        sourceAgencyId,
        AiProvider.ANTHROPIC,
      );

      if (!resolved) {
        // TODO(Feature 08): notify that generation could not start (no AI credentials)
        return null;
      }

      initiatedByUserId = resolved.userId;
    }

    const run = await this.prisma.scraperGenerationRun.create({
      data: {
        source_agency_id: sourceAgencyId,
        scraper_id: scraperId,
        trigger,
        status: GenerationRunStatus.QUEUED,
        prompt,
      },
    });

    await this.generationQueue.add('generate', {
      runId: run.id,
      initiatedByUserId,
    });

    return run;
  }

  async approve(id: string) {
    const run = await this.ensureExists(id);

    if (run.status !== GenerationRunStatus.AWAITING_REVIEW || !run.staged_config) {
      throw new BadRequestException(
        'Run must be AWAITING_REVIEW with a staged config to approve',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      let scraperId = run.scraper_id;

      if (!scraperId) {
        const agency = await tx.sourceAgency.findUniqueOrThrow({
          where: { id: run.source_agency_id },
        });

        const scraper = await tx.scraper.create({
          data: {
            source_agency_id: run.source_agency_id,
            name: `${agency.name} scraper`,
            status: ScraperStatus.TESTING,
          },
        });

        scraperId = scraper.id;
      }

      const scraper = await tx.scraper.findUniqueOrThrow({
        where: { id: scraperId },
      });

      const latestVersion = await tx.scraperVersion.findFirst({
        where: { scraper_id: scraperId },
        orderBy: { version: 'desc' },
      });

      const version = await tx.scraperVersion.create({
        data: {
          scraper_id: scraperId,
          version: (latestVersion?.version ?? 0) + 1,
          config: run.staged_config as Prisma.InputJsonValue,
          created_by: ScraperVersionCreatedBy.AI,
          notes: `Generated via ${run.trigger} run ${run.id}`,
        },
      });

      await tx.scraper.update({
        where: { id: scraperId },
        data: {
          active_version_id: version.id,
          version_count: { increment: 1 },
          ...(scraper.status === ScraperStatus.BROKEN && {
            status: ScraperStatus.ACTIVE,
          }),
        },
      });

      return tx.scraperGenerationRun.update({
        where: { id },
        data: {
          scraper_id: scraperId,
          produced_version_id: version.id,
          status: GenerationRunStatus.SUCCESS,
          finished_at: new Date(),
        },
        include: { steps: { orderBy: { step_index: 'asc' } } },
      });
    });
  }

  async reject(id: string, dto: RejectGenerationRunDto) {
    const run = await this.ensureExists(id);

    if (TERMINAL_STATUSES.includes(run.status)) {
      throw new BadRequestException('Run has already finished');
    }

    return this.prisma.scraperGenerationRun.update({
      where: { id },
      data: {
        status: GenerationRunStatus.FAILED,
        error_message: dto.reason ?? 'Rejected by admin',
        finished_at: new Date(),
      },
    });
  }

  async cancel(id: string) {
    const run = await this.ensureExists(id);

    if (
      run.status !== GenerationRunStatus.QUEUED &&
      run.status !== GenerationRunStatus.RUNNING
    ) {
      throw new BadRequestException(
        'Only QUEUED or RUNNING runs can be cancelled',
      );
    }

    // TODO(next task): signal the running BullMQ job/loop to stop
    return this.prisma.scraperGenerationRun.update({
      where: { id },
      data: { status: GenerationRunStatus.CANCELLED, finished_at: new Date() },
    });
  }

  private async ensureExists(id: string) {
    const run = await this.prisma.scraperGenerationRun.findUnique({
      where: { id },
    });

    if (!run) {
      throw new NotFoundException('Generation run not found');
    }

    return run;
  }
}
