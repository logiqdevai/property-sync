import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ContentLanguage,
  DescriptionProductionStrategy,
  TitleProductionStrategy,
} from 'generated/prisma';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { UpsertContentPublishingConfigDto } from '../dto/upsert-content-publishing-config.dto';
import { ContentPublishingConfigEntity } from '../entities/content-publishing-config.entity';
import { ContentPublishingConfigWithRelations } from '../interfaces/content-publishing.interface';

@Injectable()
export class ContentPublishingConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async getForTrackedAgency(
    userId: string,
    agencyId: string,
  ): Promise<ContentPublishingConfigEntity | null> {
    const tracker = await this.requireTracker(userId, agencyId);
    const config = await this.loadConfig(tracker.id);
    if (!config) return null;
    return this.toEntity(config, tracker.source_agency.content_language);
  }

  async upsertForTrackedAgency(
    userId: string,
    agencyId: string,
    dto: UpsertContentPublishingConfigDto,
  ): Promise<ContentPublishingConfigEntity> {
    const tracker = await this.requireTracker(userId, agencyId);
    this.validateDto(dto, tracker.source_agency.content_language);

    const config = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.contentPublishingConfig.findUnique({
        where: { user_tracked_agency_id: tracker.id },
        include: { outputs: true, ai_title_families: true },
      });

      if (existing) {
        if (existing.outputs.length > 0) {
          await tx.contentOutput.deleteMany({
            where: { config_id: existing.id },
          });
        }
        if (existing.ai_title_families.length > 0) {
          await tx.aiTitleFamily.deleteMany({
            where: { config_id: existing.id },
          });
        }
        await tx.contentPublishingConfig.update({
          where: { id: existing.id },
          data: {
            ai_titles_enabled: dto.ai_titles_enabled ?? false,
            use_ai_batch: dto.use_ai_batch ?? false,
            is_enabled: dto.is_enabled ?? true,
            notes: dto.notes ?? null,
          },
        });
      } else {
        await tx.contentPublishingConfig.create({
          data: {
            user_tracked_agency_id: tracker.id,
            ai_titles_enabled: dto.ai_titles_enabled ?? false,
            use_ai_batch: dto.use_ai_batch ?? false,
            is_enabled: dto.is_enabled ?? true,
            notes: dto.notes ?? null,
          },
        });
      }

      const configRow = await tx.contentPublishingConfig.findUniqueOrThrow({
        where: { user_tracked_agency_id: tracker.id },
      });

      const families = await Promise.all(
        (dto.ai_title_families ?? []).map((family) =>
          tx.aiTitleFamily.create({
            data: {
              config_id: configRow.id,
              name: family.name.trim(),
              model: family.model ?? null,
              use_batch: family.use_batch ?? null,
              instructions: family.instructions ?? null,
              writing_language: family.writing_language ?? null,
              is_enabled: family.is_enabled ?? true,
            },
          }),
        ),
      );

      const familyByName = new Map(
        families.map((f) => [f.name.trim().toLowerCase(), f]),
      );

      await Promise.all(
        dto.outputs.map((output) => {
          let familyId: string | null = null;
          if (output.title_strategy === TitleProductionStrategy.AI) {
            const family = familyByName.get(
              (output.ai_title_family ?? '').trim().toLowerCase(),
            );
            if (!family) {
              throw new BadRequestException(
                `AI title family "${output.ai_title_family}" not found in config`,
              );
            }
            familyId = family.id;
          }
          return tx.contentOutput.create({
            data: {
              config_id: configRow.id,
              language: output.language,
              title_strategy: output.title_strategy,
              description_strategy: output.description_strategy,
              description_content_language:
                output.description_content_language &&
                output.description_content_language !== output.language
                  ? output.description_content_language
                  : null,
              ai_title_family_id: familyId,
            },
          });
        }),
      );

      return tx.contentPublishingConfig.findUniqueOrThrow({
        where: { id: configRow.id },
        include: {
          outputs: { include: { ai_title_family: true } },
          ai_title_families: true,
        },
      });
    });

    return this.toEntity(
      config as ContentPublishingConfigWithRelations,
      tracker.source_agency.content_language,
    );
  }

  async deleteForTrackedAgency(
    userId: string,
    agencyId: string,
  ): Promise<void> {
    const tracker = await this.requireTracker(userId, agencyId);
    const existing = await this.prisma.contentPublishingConfig.findUnique({
      where: { user_tracked_agency_id: tracker.id },
      include: { outputs: true },
    });
    if (!existing) return;

    await this.prisma.$transaction(async (tx) => {
      await tx.contentOutput.deleteMany({ where: { config_id: existing.id } });
      await tx.contentPublishingConfig.delete({ where: { id: existing.id } });
    });
  }

  async getByTrackerId(
    trackerId: string,
  ): Promise<ContentPublishingConfigWithRelations | null> {
    return this.loadConfig(trackerId);
  }

  // Sets the OpenAI Batch API default across every agency this user has a
  // content publishing config for, and clears any per-family override so no
  // family can keep fighting the new default (it falls back to inheriting it).
  async bulkSetUseAiBatch(
    userId: string,
    useAiBatch: boolean,
  ): Promise<{ updated: number }> {
    return this.prisma.$transaction(async (tx) => {
      const configUpdate = await tx.contentPublishingConfig.updateMany({
        where: { user_tracked_agency: { user_id: userId } },
        data: { use_ai_batch: useAiBatch },
      });
      await tx.aiTitleFamily.updateMany({
        where: { config: { user_tracked_agency: { user_id: userId } } },
        data: { use_batch: null },
      });
      return { updated: configUpdate.count };
    });
  }

  private validateDto(
    dto: UpsertContentPublishingConfigDto,
    sourceLanguage: ContentLanguage,
  ): void {
    if (!dto.outputs?.length) {
      throw new BadRequestException(
        'ContentPublishingConfig requires at least one output',
      );
    }

    const languages = new Set<ContentLanguage>();
    const familyNames = new Set(
      (dto.ai_title_families ?? []).map((f) => f.name.trim().toLowerCase()),
    );
    if (familyNames.size !== (dto.ai_title_families ?? []).length) {
      throw new BadRequestException('AI title family names must be unique');
    }

    const aiEnabled = dto.ai_titles_enabled ?? false;

    for (const output of dto.outputs) {
      if (languages.has(output.language)) {
        throw new BadRequestException(
          `Duplicate output language ${output.language}`,
        );
      }
      languages.add(output.language);

      if (output.title_strategy === TitleProductionStrategy.AI) {
        if (!aiEnabled) {
          throw new BadRequestException(
            'ai_titles_enabled must be true when any title_strategy is AI',
          );
        }
        if (!output.ai_title_family?.trim()) {
          throw new BadRequestException(
            `ai_title_family required for AI title strategy (${output.language})`,
          );
        }
        if (!familyNames.has(output.ai_title_family.trim().toLowerCase())) {
          throw new BadRequestException(
            `Unknown AI title family "${output.ai_title_family}"`,
          );
        }
      } else if (output.ai_title_family) {
        throw new BadRequestException(
          `ai_title_family must be null when title_strategy is not AI (${output.language})`,
        );
      }

      if (
        output.title_strategy === TitleProductionStrategy.TRANSLATE &&
        output.language === sourceLanguage
      ) {
        throw new BadRequestException(
          `Use ORIGINAL for title when language equals source (${sourceLanguage})`,
        );
      }

      const descriptionLanguage =
        output.description_content_language ?? output.language;
      if (
        output.description_strategy ===
          DescriptionProductionStrategy.TRANSLATE &&
        descriptionLanguage === sourceLanguage
      ) {
        throw new BadRequestException(
          `Use ORIGINAL for description when content language equals source (${sourceLanguage})`,
        );
      }
    }
  }

  private async requireTracker(userId: string, agencyId: string) {
    const tracker = await this.prisma.userTrackedAgency.findUnique({
      where: {
        user_id_source_agency_id: {
          user_id: userId,
          source_agency_id: agencyId,
        },
      },
      include: { source_agency: true },
    });
    if (!tracker) {
      throw new NotFoundException('Tracking relationship not found');
    }
    return tracker;
  }

  private loadConfig(
    trackerId: string,
  ): Promise<ContentPublishingConfigWithRelations | null> {
    return this.prisma.contentPublishingConfig.findUnique({
      where: { user_tracked_agency_id: trackerId },
      include: {
        outputs: { include: { ai_title_family: true } },
        ai_title_families: { orderBy: { name: 'asc' } },
      },
    });
  }

  private toEntity(
    config: ContentPublishingConfigWithRelations,
    sourceLanguage: ContentLanguage,
  ): ContentPublishingConfigEntity {
    const assignedByFamily = new Map<string, ContentLanguage[]>();
    for (const output of config.outputs) {
      if (
        output.title_strategy === TitleProductionStrategy.AI &&
        output.ai_title_family_id
      ) {
        const list = assignedByFamily.get(output.ai_title_family_id) ?? [];
        list.push(output.language);
        assignedByFamily.set(output.ai_title_family_id, list);
      }
    }

    return {
      id: config.id,
      user_tracked_agency_id: config.user_tracked_agency_id,
      ai_titles_enabled: config.ai_titles_enabled,
      use_ai_batch: config.use_ai_batch,
      is_enabled: config.is_enabled,
      notes: config.notes,
      source_language: sourceLanguage,
      ai_title_families: config.ai_title_families.map((family) => ({
        id: family.id,
        config_id: family.config_id,
        name: family.name,
        model: family.model,
        use_batch: family.use_batch,
        instructions: family.instructions,
        writing_language: family.writing_language ?? null,
        is_enabled: family.is_enabled,
        assigned_languages: assignedByFamily.get(family.id) ?? [],
      })),
      outputs: config.outputs
        .slice()
        .sort((a, b) => a.language.localeCompare(b.language))
        .map((output) => ({
          id: output.id,
          language: output.language,
          title_strategy: output.title_strategy,
          description_strategy: output.description_strategy,
          description_content_language:
            output.description_content_language ?? null,
          ai_title_family_id: output.ai_title_family_id,
          ai_title_family_name: output.ai_title_family?.name ?? null,
        })),
    };
  }
}
