import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { WATERMARK_REMOVAL_QUEUE } from '@/core/queues/queues.constants';
import { DewatermarkOrchestratorService } from '@/integrations/dewatermark/services/dewatermark-orchestrator.service';
import { EstateWebPropertyImage } from '@/integrations/estateweb/interfaces/estateweb-property.interface';
import { EstateWebCmsSyncAdapter } from '@/integrations/estateweb/services/estateweb-cms-sync-adapter.service';
import { EstateWebIntegrationResolverService } from '@/integrations/estateweb/services/estateweb-integration-resolver.service';
import { CmsSyncAdapterFactory } from '@/modules/cms-sync/services/cms-sync-adapter.factory';
import { CmsSyncOrchestratorService } from '@/modules/cms-sync/services/cms-sync-orchestrator.service';
import { UserPropertyQueryType } from './dto/user-property-query.schema';
import { AdminUserPropertyQueryType } from './dto/admin-user-property-query.schema';
import { UpdateUserPropertyDto } from './dto/update-user-property.dto';
import {
  IntegrationType,
  JobStatus,
  Prisma,
  Property,
  PropertyStatus,
  UserProperty,
} from 'generated/prisma';
import {
  listingTypeFromEstateWebScopeId,
  resolveEstateWebScopeId,
} from '@/integrations/estateweb/utils/estateweb-catalog.util';
import { isEstateWebListingTypeAllowed } from '@/integrations/estateweb/utils/estateweb-integration-settings.util';
import { serializePropertyForApi } from '@/modules/properties/utils/property-api-response.util';
import { buildHistoryChangeFilter } from '@/modules/properties/utils/property-change-filter.util';
import {
  syncEstateWebFeaturesInCmsFields,
  upsertEstateWebEnergyClassInCmsFields,
  upsertEstateWebRoadTypeInCmsFields,
} from '@/modules/properties/utils/property-cms-field-mapper.util';
import {
  applyTextTruncatePieces,
  normalizeTextTruncatePieces,
} from '@/modules/user-tracked-agencies/utils/apply-text-truncate-pieces.util';
import { RemoveWatermarkImagesDto } from './dto/remove-watermark-images.dto';
import { WatermarkRemovalJobData } from './interfaces/watermark-removal-job.interface';
import { WatermarkRemovalService } from './services/watermark-removal.service';

export type PropertySyncChangeType = 'created' | 'updated' | 'removed';

export interface SyncForPropertyOptions {
  userTrackedAgencyId?: string;
  sourceAgencyId?: string;
  changeType: PropertySyncChangeType;
}

export interface SyncForPropertyResult {
  user_property_id: string;
  change_type: PropertySyncChangeType;
  user_tracked_agency_id: string;
}

@Injectable()
export class UserPropertiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cmsSyncOrchestratorService: CmsSyncOrchestratorService,
    private readonly cmsSyncAdapterFactory: CmsSyncAdapterFactory,
    private readonly estateWebCmsSyncAdapter: EstateWebCmsSyncAdapter,
    private readonly estateWebIntegrationResolver: EstateWebIntegrationResolverService,
    private readonly dewatermarkOrchestrator: DewatermarkOrchestratorService,
    private readonly watermarkRemovalService: WatermarkRemovalService,
    @InjectQueue(WATERMARK_REMOVAL_QUEUE)
    private readonly watermarkRemovalQueue: Queue<WatermarkRemovalJobData>,
  ) {}

  private async resolveFilterSourceAgencyId(
    userId: string,
    query: UserPropertyQueryType,
  ): Promise<string | undefined | null> {
    let sourceAgencyId = query.agency_id;

    if (query.user_tracked_agency_id) {
      const tracker = await this.prisma.userTrackedAgency.findFirst({
        where: {
          id: query.user_tracked_agency_id,
          user_id: userId,
        },
        select: { source_agency_id: true },
      });

      if (!tracker) {
        return null;
      }

      sourceAgencyId = tracker.source_agency_id;
    }

    return sourceAgencyId;
  }

  private buildWhere(
    userId: string,
    query: UserPropertyQueryType,
    sourceAgencyId?: string,
  ): Prisma.UserPropertyWhereInput {
    const historyFilter = buildHistoryChangeFilter({
      change: query.change,
      dateFrom: query.date_from,
      dateTo: query.date_to,
    });
    const hasCanonicalFilter =
      !!sourceAgencyId ||
      query.has_duplicate_group !== undefined ||
      !!historyFilter;

    return {
      user_id: userId,
      ...(query.status && { status: query.status }),
      ...(query.search && {
        OR: [
          { id: { equals: query.search } },
          { property_id: { contains: query.search, mode: 'insensitive' } },
          { internal_id: { contains: query.search, mode: 'insensitive' } },
          {
            integration_property_id: {
              contains: query.search,
              mode: 'insensitive',
            },
          },
          { title: { contains: query.search, mode: 'insensitive' } },
          { city: { contains: query.search, mode: 'insensitive' } },
          { district: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
      ...(query.city && {
        city: { contains: query.city, mode: 'insensitive' },
      }),
      ...(hasCanonicalFilter && {
        canonical_property: {
          ...(sourceAgencyId && {
            source_links: {
              some: {
                source_property: { source_agency_id: sourceAgencyId },
              },
            },
          }),
          ...(query.has_duplicate_group === true && {
            duplicate_group_id: { not: null },
          }),
          ...(query.has_duplicate_group === false && {
            duplicate_group_id: null,
          }),
          ...(historyFilter && { history: historyFilter }),
        },
      }),
      ...(query.price_min != null || query.price_max != null
        ? {
            price: {
              ...(query.price_min != null ? { gte: query.price_min } : {}),
              ...(query.price_max != null ? { lte: query.price_max } : {}),
            },
          }
        : {}),
      ...(!query.change && (query.date_from || query.date_to)
        ? {
            created_at: {
              ...(query.date_from && { gte: query.date_from }),
              ...(query.date_to && { lte: query.date_to }),
            },
          }
        : {}),
      ...(query.pushed_to_crm === true && {
        integration_property_id: { not: null },
      }),
      ...(query.pushed_to_crm === false && {
        integration_property_id: null,
      }),
      ...(query.pending_crm_update !== undefined && {
        pending_crm_update: query.pending_crm_update,
      }),
    };
  }

  async findAll(userId: string, query: UserPropertyQueryType) {
    const sourceAgencyId = await this.resolveFilterSourceAgencyId(
      userId,
      query,
    );

    if (sourceAgencyId === null) {
      return {
        data: [],
        pagination: {
          page: query.page,
          limit: query.limit,
          total: 0,
          total_pages: 0,
          has_next: false,
          has_prev: false,
        },
      };
    }

    const where = this.buildWhere(userId, query, sourceAgencyId);

    const unlimited = query.limit === 0;
    const [items, total] = await Promise.all([
      this.prisma.userProperty.findMany({
        where,
        ...(unlimited
          ? {}
          : {
              skip: (query.page - 1) * query.limit,
              take: query.limit,
            }),
        orderBy:
          query.has_duplicate_group === true
            ? [
                { canonical_property: { duplicate_group_id: 'asc' } },
                { updated_at: 'desc' },
              ]
            : { updated_at: 'desc' },
        include: {
          canonical_property: {
            select: { duplicate_group_id: true },
          },
        },
      }),
      this.prisma.userProperty.count({ where }),
    ]);

    const totalPages = unlimited ? 1 : Math.ceil(total / query.limit);

    return {
      data: items.map(({ canonical_property, ...item }) =>
        serializePropertyForApi({
          ...item,
          duplicate_group_id: canonical_property.duplicate_group_id,
        }),
      ),
      pagination: {
        page: unlimited ? 1 : query.page,
        limit: query.limit,
        total,
        total_pages: totalPages,
        has_next: unlimited ? false : query.page < totalPages,
        has_prev: unlimited ? false : query.page > 1,
      },
    };
  }

  async count(userId: string, query: UserPropertyQueryType) {
    const sourceAgencyId = await this.resolveFilterSourceAgencyId(
      userId,
      query,
    );

    if (sourceAgencyId === null) {
      return { total: 0 };
    }

    const total = await this.prisma.userProperty.count({
      where: this.buildWhere(userId, query, sourceAgencyId),
    });
    return { total };
  }

  async findOne(userId: string, id: string) {
    const userProperty = await this.prisma.userProperty.findFirst({
      where: { id, user_id: userId },
      include: {
        integration_properties: {
          orderBy: { updated_at: 'desc' },
          take: 1,
        },
        canonical_property: {
          include: {
            source_links: {
              include: {
                source_property: {
                  select: {
                    id: true,
                    source_url: true,
                    property_id: true,
                    internal_id: true,
                    raw_title: true,
                    raw_description: true,
                    raw_price: true,
                    raw_location: true,
                    raw_property_type: true,
                    raw_listing_type: true,
                    raw_sqm: true,
                    raw_bedrooms: true,
                    raw_bathrooms: true,
                    last_seen_at: true,
                    status: true,
                  },
                },
              },
            },
            history: {
              orderBy: { created_at: 'desc' },
            },
          },
        },
      },
    });

    if (!userProperty) {
      throw new NotFoundException('Property not found');
    }

    const { canonical_property, integration_properties, ...rest } =
      userProperty;
    const integrationProperty = integration_properties[0] ?? null;

    return serializePropertyForApi({
      ...rest,
      duplicate_group_id: canonical_property.duplicate_group_id,
      source_links: canonical_property.source_links,
      history: canonical_property.history,
      integration_property: integrationProperty
        ? {
            id: integrationProperty.id,
            user_id: integrationProperty.user_id,
            user_integration_settings_id:
              integrationProperty.user_integration_settings_id,
            user_property_id: integrationProperty.user_property_id,
            images: integrationProperty.images,
            created_at: integrationProperty.created_at,
            updated_at: integrationProperty.updated_at,
          }
        : null,
    });
  }

  async update(userId: string, id: string, dto: UpdateUserPropertyDto) {
    const existing = await this.prisma.userProperty.findFirst({
      where: { id, user_id: userId },
      include: {
        canonical_property: {
          include: {
            source_links: {
              include: {
                source_property: { select: { source_agency_id: true } },
              },
            },
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Property not found');
    }

    const sourceAgencyId =
      existing.canonical_property.source_links[0]?.source_property
        .source_agency_id;
    let pendingCrmUpdate = existing.pending_crm_update;

    if (
      existing.integration_property_id &&
      sourceAgencyId &&
      !pendingCrmUpdate
    ) {
      const tracker = await this.prisma.userTrackedAgency.findUnique({
        where: {
          user_id_source_agency_id: {
            user_id: userId,
            source_agency_id: sourceAgencyId,
          },
        },
        select: { auto_update_to_crm: true, enabled: true },
      });

      if (tracker?.enabled && !tracker.auto_update_to_crm) {
        pendingCrmUpdate = true;
      }
    }

    return serializePropertyForApi(
      await this.prisma.userProperty.update({
        where: { id },
        data: this.buildUserPropertyUpdateData(
          dto,
          pendingCrmUpdate,
          existing.cms_fields,
          existing.estateweb_type_id,
        ),
      }),
    );
  }

  private buildUserPropertyUpdateData(
    dto: UpdateUserPropertyDto,
    pendingCrmUpdate: boolean,
    existingCmsFields: unknown,
    existingPropertyTypeId?: number | null,
  ): Prisma.UserPropertyUpdateInput {
    const {
      estateweb_energy_class_id,
      estateweb_road_type_id,
      ...rest
    } = dto;
    const data: Prisma.UserPropertyUpdateInput = {
      ...rest,
      is_modified: true,
      pending_crm_update: pendingCrmUpdate,
    };

    if (dto.estateweb_scope_id != null) {
      data.listing_type = listingTypeFromEstateWebScopeId(dto.estateweb_scope_id);
    } else if (dto.listing_type != null && dto.estateweb_scope_id === undefined) {
      const scopeId = resolveEstateWebScopeId(dto.listing_type, null);
      if (scopeId != null) {
        data.estateweb_scope_id = scopeId;
      }
    }

    const propertyTypeId =
      dto.estateweb_type_id ?? existingPropertyTypeId ?? null;
    let cmsFields = existingCmsFields;
    let cmsFieldsChanged = false;

    if (estateweb_energy_class_id !== undefined) {
      cmsFields = upsertEstateWebEnergyClassInCmsFields(
        cmsFields,
        estateweb_energy_class_id,
      );
      cmsFieldsChanged = true;
    }
    if (estateweb_road_type_id !== undefined) {
      cmsFields = upsertEstateWebRoadTypeInCmsFields(
        cmsFields,
        estateweb_road_type_id,
      );
      cmsFieldsChanged = true;
    }
    if (dto.features !== undefined) {
      cmsFields = syncEstateWebFeaturesInCmsFields(
        cmsFields,
        dto.features,
        propertyTypeId,
      );
      cmsFieldsChanged = true;
    }

    if (cmsFieldsChanged) {
      data.cms_fields = cmsFields as unknown as Prisma.InputJsonValue;
    }

    return data;
  }

  async pushToCrm(userId: string, ids: string | string[]) {
    const idList = [...new Set(Array.isArray(ids) ? ids : [ids])];
    if (idList.length === 0) {
      throw new BadRequestException('No properties selected');
    }

    const owned = await this.prisma.userProperty.findMany({
      where: { id: { in: idList }, user_id: userId },
      select: { id: true },
    });

    if (owned.length === 0) {
      throw new NotFoundException('Property not found');
    }

    try {
      const result =
        await this.cmsSyncOrchestratorService.planAndEnqueueManualPropertyUpdate(
          userId,
          idList,
        );

      if (idList.length === 1 && result.queued === 1) {
        return serializePropertyForApi(
          await this.prisma.userProperty.findFirstOrThrow({
            where: { id: idList[0], user_id: userId },
          }),
        );
      }

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(message);
    }
  }

  async migrateIntegrationImages(userId: string, id: string) {
    const userProperty = await this.prisma.userProperty.findFirst({
      where: { id, user_id: userId },
      select: {
        id: true,
        user_id: true,
        canonical_property_id: true,
        integration_property_id: true,
        images: true,
      },
    });

    if (!userProperty) {
      throw new NotFoundException('Property not found');
    }

    await this.runMigrateIntegrationImages(userProperty);
    return this.findOne(userId, id);
  }

  async adminMigrateIntegrationImages(id: string) {
    const userProperty = await this.prisma.userProperty.findFirst({
      where: { id },
      select: {
        id: true,
        user_id: true,
        canonical_property_id: true,
        integration_property_id: true,
        images: true,
      },
    });

    if (!userProperty) {
      throw new NotFoundException('Property not found');
    }

    await this.runMigrateIntegrationImages(userProperty);
    return this.adminFindOne(id);
  }

  async deleteIntegrationImages(
    userId: string,
    id: string,
    imageIds: number[],
  ) {
    const userProperty = await this.prisma.userProperty.findFirst({
      where: { id, user_id: userId },
      select: {
        id: true,
        user_id: true,
        canonical_property_id: true,
        integration_property_id: true,
      },
    });

    if (!userProperty) {
      throw new NotFoundException('Property not found');
    }

    await this.runDeleteIntegrationImages(userProperty, imageIds);
    return this.findOne(userId, id);
  }

  async adminDeleteIntegrationImages(id: string, imageIds: number[]) {
    const userProperty = await this.prisma.userProperty.findFirst({
      where: { id },
      select: {
        id: true,
        user_id: true,
        canonical_property_id: true,
        integration_property_id: true,
      },
    });

    if (!userProperty) {
      throw new NotFoundException('Property not found');
    }

    await this.runDeleteIntegrationImages(userProperty, imageIds);
    return this.adminFindOne(id);
  }

  async adminCreateIntegrationImages(id: string, imageIndexes: number[]) {
    const userProperty = await this.prisma.userProperty.findFirst({
      where: { id },
      select: {
        id: true,
        user_id: true,
        canonical_property_id: true,
        integration_property_id: true,
        images: true,
      },
    });

    if (!userProperty) {
      throw new NotFoundException('Property not found');
    }

    await this.runCreateIntegrationImages(userProperty, imageIndexes);
    return this.adminFindOne(id);
  }

  async createIntegrationImages(
    userId: string,
    id: string,
    imageIndexes: number[],
  ) {
    const userProperty = await this.prisma.userProperty.findFirst({
      where: { id, user_id: userId },
      select: {
        id: true,
        user_id: true,
        canonical_property_id: true,
        integration_property_id: true,
        images: true,
      },
    });

    if (!userProperty) {
      throw new NotFoundException('Property not found');
    }

    await this.runCreateIntegrationImages(userProperty, imageIndexes);
    return this.findOne(userId, id);
  }

  async updateIntegrationImages(
    userId: string,
    id: string,
    imageIds: number[],
    options: {
      show_on_site: boolean;
      show_on_groups: boolean;
      show_on_foreign_agents: boolean;
    },
  ) {
    const userProperty = await this.prisma.userProperty.findFirst({
      where: { id, user_id: userId },
      select: {
        id: true,
        user_id: true,
        canonical_property_id: true,
        integration_property_id: true,
      },
    });

    if (!userProperty) {
      throw new NotFoundException('Property not found');
    }

    await this.runUpdateIntegrationImages(userProperty, imageIds, options);
    return this.findOne(userId, id);
  }

  async adminUpdateIntegrationImages(
    id: string,
    imageIds: number[],
    options: {
      show_on_site: boolean;
      show_on_groups: boolean;
      show_on_foreign_agents: boolean;
    },
  ) {
    const userProperty = await this.prisma.userProperty.findFirst({
      where: { id },
      select: {
        id: true,
        user_id: true,
        canonical_property_id: true,
        integration_property_id: true,
      },
    });

    if (!userProperty) {
      throw new NotFoundException('Property not found');
    }

    await this.runUpdateIntegrationImages(userProperty, imageIds, options);
    return this.adminFindOne(id);
  }

  async enqueueRemoveWatermarkImages(
    userId: string,
    id: string,
    dto: RemoveWatermarkImagesDto,
  ) {
    const userProperty = await this.prisma.userProperty.findFirst({
      where: { id, user_id: userId },
      select: {
        id: true,
        user_id: true,
        canonical_property_id: true,
        integration_property_id: true,
        integration_properties: {
          orderBy: { updated_at: 'desc' },
          take: 1,
          select: { images: true },
        },
      },
    });

    if (!userProperty) {
      throw new NotFoundException('Property not found');
    }

    return this.runEnqueueRemoveWatermarkImages(userProperty, dto);
  }

  async adminEnqueueRemoveWatermarkImages(
    id: string,
    dto: RemoveWatermarkImagesDto,
  ) {
    const userProperty = await this.prisma.userProperty.findFirst({
      where: { id },
      select: {
        id: true,
        user_id: true,
        canonical_property_id: true,
        integration_property_id: true,
        integration_properties: {
          orderBy: { updated_at: 'desc' },
          take: 1,
          select: { images: true },
        },
      },
    });

    if (!userProperty) {
      throw new NotFoundException('Property not found');
    }

    return this.runEnqueueRemoveWatermarkImages(userProperty, dto);
  }

  private async runEnqueueRemoveWatermarkImages(
    userProperty: {
      id: string;
      user_id: string;
      canonical_property_id: string;
      integration_property_id: string | null;
      integration_properties: { images: unknown }[];
    },
    dto: RemoveWatermarkImagesDto,
  ) {
    if (!userProperty.integration_property_id) {
      throw new BadRequestException('Property is not linked to a CMS');
    }

    const { userIntegrationId, integrationType } =
      await this.resolveCmsIntegrationForProperty(userProperty);

    if (integrationType !== IntegrationType.ESTATEWEB) {
      throw new BadRequestException(
        'Watermark removal is only supported for EstateWeb',
      );
    }

    const dewatermarkIntegration =
      await this.dewatermarkOrchestrator.findActiveForUser(userProperty.user_id);
    if (!dewatermarkIntegration) {
      throw new BadRequestException(
        'No active Dewatermark integration configured for this user',
      );
    }

    const parsedImageIds = this.parseWatermarkImageIds(dto.image_ids);
    const integrationImages = this.watermarkRemovalService.parseIntegrationImages(
      userProperty.integration_properties[0]?.images,
    );
    this.assertWatermarkImageSelection(parsedImageIds, integrationImages);

    const jobData: WatermarkRemovalJobData = {
      job_log_id: '',
      user_id: userProperty.user_id,
      user_property_id: userProperty.id,
      user_integration_id: userIntegrationId,
      crm_property_id: userProperty.integration_property_id,
      image_ids: parsedImageIds.map(String),
      replace_crm_images: dto.replace_crm_images,
    };

    const jobLog = await this.prisma.jobLog.create({
      data: {
        queue_name: WATERMARK_REMOVAL_QUEUE,
        job_name: 'remove-watermark',
        status: JobStatus.WAITING,
        payload: jobData as object,
      },
    });

    jobData.job_log_id = jobLog.id;

    await this.prisma.jobLog.update({
      where: { id: jobLog.id },
      data: { payload: jobData as object },
    });

    await this.watermarkRemovalQueue.add('remove-watermark', jobData);

    return {
      job_log_id: jobLog.id,
      message:
        'Watermark removal has started and is being processed in the background.',
    };
  }

  private parseWatermarkImageIds(imageIds: string[]): number[] {
    const uniqueIds = [
      ...new Set(
        imageIds
          .map((id) => Number(id.trim()))
          .filter((id) => Number.isInteger(id) && id > 0),
      ),
    ];

    if (uniqueIds.length === 0) {
      throw new BadRequestException('No valid image ids provided');
    }

    return uniqueIds;
  }

  private assertWatermarkImageSelection(
    imageIds: number[],
    integrationImages: EstateWebPropertyImage[],
  ): void {
    for (const imageId of imageIds) {
      const image = integrationImages.find((item) => item.id === imageId);
      if (!image) {
        throw new BadRequestException(
          `Image ${imageId} was not found on this property`,
        );
      }
      if (!image.source_image) {
        throw new BadRequestException(
          `Image ${imageId} does not have a source image to process`,
        );
      }
    }
  }

  private async runCreateIntegrationImages(
    userProperty: {
      id: string;
      user_id: string;
      canonical_property_id: string;
      integration_property_id: string | null;
      images: unknown;
    },
    imageIndexes: number[],
  ) {
    if (!userProperty.integration_property_id) {
      throw new BadRequestException('Property is not linked to a CMS');
    }

    const propertyImages = Array.isArray(userProperty.images)
      ? userProperty.images.filter(
          (item): item is string => typeof item === 'string' && item.length > 0,
        )
      : [];

    const uniqueIndexes = [
      ...new Set(
        imageIndexes.filter(
          (index) =>
            Number.isInteger(index) &&
            index >= 0 &&
            index < propertyImages.length,
        ),
      ),
    ].sort((a, b) => a - b);

    if (uniqueIndexes.length === 0) {
      throw new BadRequestException(
        'No valid Property.images indexes provided',
      );
    }

    const sourceImageUrls = uniqueIndexes.map(
      (index) => propertyImages[index],
    );

    const { userIntegrationId, integrationType } =
      await this.resolveCmsIntegrationForProperty(userProperty);

    try {
      const adapter = this.cmsSyncAdapterFactory.getAdapter(integrationType);
      await adapter.createImages({
        userIntegrationId,
        crmPropertyId: userProperty.integration_property_id,
        userPropertyId: userProperty.id,
        sourceImageUrls,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(message);
    }
  }

  private async runDeleteIntegrationImages(
    userProperty: {
      id: string;
      user_id: string;
      canonical_property_id: string;
      integration_property_id: string | null;
    },
    imageIds: number[],
  ) {
    if (!userProperty.integration_property_id) {
      throw new BadRequestException('Property is not linked to a CMS');
    }

    const uniqueIds = [
      ...new Set(
        imageIds.filter((id) => Number.isFinite(id) && id > 0),
      ),
    ];
    if (uniqueIds.length === 0) {
      throw new BadRequestException('No valid image ids provided');
    }

    const { userIntegrationId, integrationType } =
      await this.resolveCmsIntegrationForProperty(userProperty);

    try {
      const adapter = this.cmsSyncAdapterFactory.getAdapter(integrationType);
      await adapter.deleteImages({
        userIntegrationId,
        crmPropertyId: userProperty.integration_property_id,
        userPropertyId: userProperty.id,
        imageIds: uniqueIds,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(message);
    }
  }

  private async runUpdateIntegrationImages(
    userProperty: {
      id: string;
      user_id: string;
      canonical_property_id: string;
      integration_property_id: string | null;
    },
    imageIds: number[],
    options: {
      show_on_site: boolean;
      show_on_groups: boolean;
      show_on_foreign_agents: boolean;
    },
  ) {
    if (!userProperty.integration_property_id) {
      throw new BadRequestException('Property is not linked to a CMS');
    }

    const uniqueIds = [
      ...new Set(
        imageIds.filter((id) => Number.isFinite(id) && id > 0),
      ),
    ];
    if (uniqueIds.length === 0) {
      throw new BadRequestException('No valid image ids provided');
    }

    const { userIntegrationId, integrationType } =
      await this.resolveCmsIntegrationForProperty(userProperty);

    if (integrationType !== IntegrationType.ESTATEWEB) {
      throw new BadRequestException(
        'Image visibility options are only supported for EstateWeb',
      );
    }

    try {
      const adapter = this.cmsSyncAdapterFactory.getAdapter(integrationType);
      await adapter.updateImages({
        userIntegrationId,
        crmPropertyId: userProperty.integration_property_id,
        userPropertyId: userProperty.id,
        imageIds: uniqueIds,
        show_on_site: options.show_on_site,
        show_on_groups: options.show_on_groups,
        show_on_foreign_agents: options.show_on_foreign_agents,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(message);
    }
  }

  private async resolveCmsIntegrationForProperty(userProperty: {
    user_id: string;
    canonical_property_id: string;
  }): Promise<{
    userIntegrationId: string;
    integrationType: IntegrationType;
  }> {
    const sourceAgencyId = await this.resolveSourceAgencyId(
      userProperty.canonical_property_id,
    );

    let userIntegrationId: string;
    try {
      if (sourceAgencyId) {
        try {
          const resolved =
            await this.estateWebIntegrationResolver.resolveForTrackedAgency(
              userProperty.user_id,
              sourceAgencyId,
            );
          userIntegrationId = resolved.userIntegrationId;
        } catch {
          const resolved =
            await this.estateWebIntegrationResolver.resolveDefaultForUser(
              userProperty.user_id,
            );
          userIntegrationId = resolved.userIntegrationId;
        }
      } else {
        const resolved =
          await this.estateWebIntegrationResolver.resolveDefaultForUser(
            userProperty.user_id,
          );
        userIntegrationId = resolved.userIntegrationId;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(message);
    }

    const integration = await this.prisma.userIntegration.findUnique({
      where: { id: userIntegrationId },
      select: {
        integration_target: {
          select: { integration_type: true },
        },
      },
    });

    if (!integration) {
      throw new BadRequestException('CMS integration connection not found');
    }

    return {
      userIntegrationId,
      integrationType: integration.integration_target.integration_type,
    };
  }

  private async runMigrateIntegrationImages(userProperty: {
    id: string;
    user_id: string;
    canonical_property_id: string;
    integration_property_id: string | null;
    images: unknown;
  }) {
    if (!userProperty.integration_property_id) {
      throw new BadRequestException(
        'Property is not linked to EstateWeb CMS',
      );
    }

    const sourceAgencyId = await this.resolveSourceAgencyId(
      userProperty.canonical_property_id,
    );

    let userIntegrationId: string;
    try {
      if (sourceAgencyId) {
        try {
          const resolved =
            await this.estateWebIntegrationResolver.resolveForTrackedAgency(
              userProperty.user_id,
              sourceAgencyId,
            );
          userIntegrationId = resolved.userIntegrationId;
        } catch {
          const resolved =
            await this.estateWebIntegrationResolver.resolveDefaultForUser(
              userProperty.user_id,
            );
          userIntegrationId = resolved.userIntegrationId;
        }
      } else {
        const resolved =
          await this.estateWebIntegrationResolver.resolveDefaultForUser(
            userProperty.user_id,
          );
        userIntegrationId = resolved.userIntegrationId;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(message);
    }

    try {
      await this.estateWebCmsSyncAdapter.syncOrRepairIntegrationPropertyImages({
        userIntegrationId,
        userPropertyId: userProperty.id,
        estateWebPropertyId: userProperty.integration_property_id,
        sourceImages: userProperty.images,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(message);
    }
  }

  async resync(userId: string, id: string) {
    const userProperty = await this.prisma.userProperty.findFirst({
      where: { id, user_id: userId },
      include: { canonical_property: true },
    });

    if (!userProperty) {
      throw new NotFoundException('Property not found');
    }

    const sourceAgencyId = await this.resolveSourceAgencyId(
      userProperty.canonical_property_id,
    );
    const tracker = sourceAgencyId
      ? await this.prisma.userTrackedAgency.findUnique({
          where: {
            user_id_source_agency_id: {
              user_id: userId,
              source_agency_id: sourceAgencyId,
            },
          },
          select: { text_truncate_pieces: true },
        })
      : null;

    return serializePropertyForApi(
      await this.prisma.userProperty.update({
        where: { id },
        data: {
          ...this.mapFromCanonical(
            userProperty.canonical_property,
            tracker?.text_truncate_pieces,
          ),
          is_modified: false,
          last_synced_at: new Date(),
        },
      }),
    );
  }

  async remove(userId: string, id: string) {
    const property = await this.prisma.userProperty.findFirst({
      where: { id, user_id: userId },
      select: {
        id: true,
        duplicate_group_id: true,
        canonical_property: { select: { duplicate_group_id: true } },
      },
    });

    if (!property) {
      throw new ForbiddenException('Property not found');
    }

    const groupId =
      property.canonical_property.duplicate_group_id ??
      property.duplicate_group_id;

    await this.prisma.userProperty.delete({ where: { id } });

    if (groupId) {
      await this.clearSingletonUserDuplicateGroups(userId, [groupId]);
    }
  }

  async removeMany(userId: string, ids: string[]) {
    const uniqueIds = [...new Set(ids)];
    const owned = await this.prisma.userProperty.findMany({
      where: { user_id: userId, id: { in: uniqueIds } },
      select: {
        id: true,
        duplicate_group_id: true,
        canonical_property: { select: { duplicate_group_id: true } },
      },
    });

    if (owned.length !== uniqueIds.length) {
      throw new NotFoundException('One or more properties not found');
    }

    const groupIds = owned
      .map(
        (property) =>
          property.canonical_property.duplicate_group_id ??
          property.duplicate_group_id,
      )
      .filter((groupId): groupId is string => !!groupId);

    await this.prisma.userProperty.deleteMany({
      where: { user_id: userId, id: { in: uniqueIds } },
    });

    await this.clearSingletonUserDuplicateGroups(userId, groupIds);

    return { deleted: uniqueIds.length };
  }

  async truncateDescriptions(
    userId: string,
    ids: string[],
    text: string,
    replacement?: string,
  ) {
    const pieces = normalizeTextTruncatePieces([text]);
    if (pieces.length === 0) {
      throw new BadRequestException('Truncate text is required');
    }

    const replaceWith = replacement ?? '';
    const persistPieces = replaceWith.length === 0;

    const uniqueIds = [...new Set(ids)];
    const properties = await this.prisma.userProperty.findMany({
      where: { user_id: userId, id: { in: uniqueIds } },
      select: {
        id: true,
        title: true,
        description: true,
        canonical_property_id: true,
      },
    });

    if (properties.length !== uniqueIds.length) {
      throw new NotFoundException('One or more properties not found');
    }

    const propertyUpdates = properties.flatMap((property) => {
      const nextTitle =
        applyTextTruncatePieces(property.title, pieces, replaceWith) ??
        property.title;
      const nextDescription = applyTextTruncatePieces(
        property.description,
        pieces,
        replaceWith,
      );

      if (
        nextTitle === property.title &&
        nextDescription === property.description
      ) {
        return [];
      }

      return [
        {
          id: property.id,
          title: nextTitle,
          description: nextDescription,
        },
      ];
    });

    const canonicalPropertyIds = [
      ...new Set(properties.map((property) => property.canonical_property_id)),
    ];

    await this.prisma.$transaction(
      async (tx) => {
        if (propertyUpdates.length > 0) {
          await Promise.all(
            propertyUpdates.map((update) =>
              tx.userProperty.update({
                where: { id: update.id },
                data: {
                  title: update.title,
                  description: update.description,
                },
              }),
            ),
          );
        }

        if (!persistPieces) return;

        const links = await tx.propertySourceLink.findMany({
          where: { property_id: { in: canonicalPropertyIds } },
          select: {
            source_property: { select: { source_agency_id: true } },
          },
        });

        const sourceAgencyIds = [
          ...new Set(
            links
              .map((link) => link.source_property.source_agency_id)
              .filter((agencyId): agencyId is string => Boolean(agencyId)),
          ),
        ];

        if (sourceAgencyIds.length === 0) return;

        const trackers = await tx.userTrackedAgency.findMany({
          where: {
            user_id: userId,
            source_agency_id: { in: sourceAgencyIds },
          },
          select: { id: true, text_truncate_pieces: true },
        });

        const trackerUpdates = trackers.flatMap((tracker) => {
          const nextPieces = normalizeTextTruncatePieces([
            ...tracker.text_truncate_pieces,
            ...pieces,
          ]);
          if (
            nextPieces.length === tracker.text_truncate_pieces.length &&
            nextPieces.every(
              (piece, index) => piece === tracker.text_truncate_pieces[index],
            )
          ) {
            return [];
          }

          return [{ id: tracker.id, text_truncate_pieces: nextPieces }];
        });

        if (trackerUpdates.length === 0) return;

        await Promise.all(
          trackerUpdates.map((update) =>
            tx.userTrackedAgency.update({
              where: { id: update.id },
              data: { text_truncate_pieces: update.text_truncate_pieces },
            }),
          ),
        );
      },
      { timeout: 30_000 },
    );

    return { updated: propertyUpdates.length, total: uniqueIds.length };
  }

  async splitMany(userId: string, ids: string[]) {
    const uniqueIds = [...new Set(ids)];
    const properties = await this.prisma.userProperty.findMany({
      where: { user_id: userId, id: { in: uniqueIds } },
      select: {
        id: true,
        duplicate_group_id: true,
        canonical_property_id: true,
        canonical_property: { select: { duplicate_group_id: true } },
      },
    });

    if (properties.length !== uniqueIds.length) {
      throw new NotFoundException('One or more properties not found');
    }

    const grouped = properties.filter(
      (property) =>
        property.canonical_property.duplicate_group_id ??
        property.duplicate_group_id,
    );

    if (grouped.length === 0) {
      throw new BadRequestException(
        'None of the selected properties are in a duplicate group',
      );
    }

    const userPropertyIds = grouped.map((property) => property.id);
    const canonicalIds = [
      ...new Set(grouped.map((property) => property.canonical_property_id)),
    ];
    const groupIds = grouped
      .map(
        (property) =>
          property.canonical_property.duplicate_group_id ??
          property.duplicate_group_id,
      )
      .filter((groupId): groupId is string => !!groupId);

    await this.prisma.$transaction([
      this.prisma.property.updateMany({
        where: { id: { in: canonicalIds } },
        data: { duplicate_group_id: null },
      }),
      this.prisma.userProperty.updateMany({
        where: {
          OR: [
            { id: { in: userPropertyIds } },
            { canonical_property_id: { in: canonicalIds } },
          ],
        },
        data: { duplicate_group_id: null },
      }),
    ]);

    await this.clearSingletonUserDuplicateGroups(userId, groupIds);

    return { split: grouped.length };
  }

  async dedupeGroups(userId: string, ids: string[]) {
    const uniqueIds = [...new Set(ids)];
    const properties = await this.prisma.userProperty.findMany({
      where: { user_id: userId, id: { in: uniqueIds } },
      select: {
        id: true,
        duplicate_group_id: true,
        canonical_property: { select: { duplicate_group_id: true } },
      },
    });

    if (properties.length !== uniqueIds.length) {
      throw new NotFoundException('One or more properties not found');
    }

    const byGroup = new Map<string, string[]>();
    for (const property of properties) {
      const groupId =
        property.canonical_property.duplicate_group_id ??
        property.duplicate_group_id;
      if (!groupId) continue;
      const members = byGroup.get(groupId) ?? [];
      members.push(property.id);
      byGroup.set(groupId, members);
    }

    const keepIds: string[] = [];
    const deleteIds: string[] = [];
    const affectedGroupIds: string[] = [];

    for (const [groupId, members] of byGroup) {
      if (members.length < 2) continue;
      const sorted = [...members].sort();
      keepIds.push(sorted[0]);
      deleteIds.push(...sorted.slice(1));
      affectedGroupIds.push(groupId);
    }

    if (deleteIds.length === 0) {
      throw new BadRequestException(
        'Select at least two properties from the same duplicate group',
      );
    }

    await this.prisma.userProperty.deleteMany({
      where: { user_id: userId, id: { in: deleteIds } },
    });

    await this.clearSingletonUserDuplicateGroups(userId, affectedGroupIds);

    return { deleted: deleteIds.length, kept: keepIds };
  }

  private async clearSingletonUserDuplicateGroups(
    userId: string,
    groupIds: string[],
  ) {
    const uniqueGroupIds = [...new Set(groupIds.filter(Boolean))];

    for (const groupId of uniqueGroupIds) {
      const remaining = await this.prisma.userProperty.findMany({
        where: {
          user_id: userId,
          OR: [
            { duplicate_group_id: groupId },
            { canonical_property: { duplicate_group_id: groupId } },
          ],
        },
        select: { id: true },
      });

      if (remaining.length !== 1) continue;

      await this.prisma.userProperty.update({
        where: { id: remaining[0].id },
        data: { duplicate_group_id: null },
      });

      const canonicalRemaining = await this.prisma.property.count({
        where: { duplicate_group_id: groupId },
      });

      if (canonicalRemaining === 1) {
        await this.prisma.$transaction([
          this.prisma.property.updateMany({
            where: { duplicate_group_id: groupId },
            data: { duplicate_group_id: null },
          }),
          this.prisma.userProperty.updateMany({
            where: { duplicate_group_id: groupId },
            data: { duplicate_group_id: null },
          }),
        ]);
      }
    }
  }

  async syncForProperty(
    propertyId: string,
    options: SyncForPropertyOptions,
  ): Promise<SyncForPropertyResult[]> {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
    });

    if (!property) return [];

    const sourceAgencyId =
      options.sourceAgencyId ?? (await this.resolveSourceAgencyId(propertyId));

    if (!sourceAgencyId) return [];

    const trackers = options.userTrackedAgencyId
      ? await this.prisma.userTrackedAgency.findMany({
          where: {
            id: options.userTrackedAgencyId,
            enabled: true,
          },
        })
      : await this.prisma.userTrackedAgency.findMany({
          where: {
            source_agency_id: sourceAgencyId,
            enabled: true,
          },
        });

    const results: SyncForPropertyResult[] = [];
    const estateWebSettingsByUserId =
      await this.loadEstateWebSettingsByUserIds(
        trackers.map((tracker) => tracker.user_id),
      );

    for (const tracker of trackers) {
      if (options.changeType === 'created' && !tracker.track_new_listings) {
        continue;
      }

      if (options.changeType === 'updated' && !tracker.track_updated_listings) {
        continue;
      }

      if (options.changeType === 'removed' && !tracker.track_removed_listings) {
        continue;
      }

      const existing = await this.prisma.userProperty.findUnique({
        where: {
          user_id_canonical_property_id: {
            user_id: tracker.user_id,
            canonical_property_id: propertyId,
          },
        },
      });

      const canonicalFields = this.mapFromCanonical(
        property,
        tracker.text_truncate_pieces,
      );
      const listingTypeAllowed = isEstateWebListingTypeAllowed(
        estateWebSettingsByUserId.get(tracker.user_id),
        property.listing_type,
      );

      if (options.changeType === 'created') {
        if (existing || !listingTypeAllowed) continue;
        const created = await this.prisma.userProperty.create({
          data: {
            user_id: tracker.user_id,
            canonical_property_id: propertyId,
            ...canonicalFields,
          },
        });
        results.push({
          user_property_id: created.id,
          change_type: 'created',
          user_tracked_agency_id: tracker.id,
        });
        continue;
      }

      if (options.changeType === 'removed') {
        if (!existing) continue;
        await this.prisma.userProperty.update({
          where: { id: existing.id },
          data: {
            status: PropertyStatus.REMOVED,
            last_synced_at: new Date(),
          },
        });
        results.push({
          user_property_id: existing.id,
          change_type: 'removed',
          user_tracked_agency_id: tracker.id,
        });
        continue;
      }

      if (!existing) {
        if (!tracker.track_new_listings || !listingTypeAllowed) continue;
        const created = await this.prisma.userProperty.create({
          data: {
            user_id: tracker.user_id,
            canonical_property_id: propertyId,
            ...canonicalFields,
          },
        });
        results.push({
          user_property_id: created.id,
          change_type: 'created',
          user_tracked_agency_id: tracker.id,
        });
        continue;
      }

      if (!this.hasUserPropertyFieldChanges(existing, canonicalFields)) {
        continue;
      }

      await this.prisma.userProperty.update({
        where: { id: existing.id },
        data: canonicalFields,
      });
      results.push({
        user_property_id: existing.id,
        change_type: 'updated',
        user_tracked_agency_id: tracker.id,
      });
    }

    return results;
  }

  private hasUserPropertyFieldChanges(
    existing: UserProperty,
    next: ReturnType<UserPropertiesService['mapFromCanonical']>,
  ): boolean {
    const keys = [
      'property_id',
      'internal_id',
      'title',
      'description',
      'listing_type',
      'property_type',
      'status',
      'price',
      'city',
      'latitude',
      'longitude',
      'square_meters',
      'bedrooms',
      'bathrooms',
      'floor',
      'construction_year',
      'renovation_year',
      'estateweb_type_id',
      'estateweb_location_id',
      'cms_fields',
      'cms_metadata',
      'distance_airport',
      'distance_port',
      'distance_beach',
      'price_start',
      'price_web',
      'features',
      'images',
      'normalized_data',
      'duplicate_group_id',
    ] as const;

    for (const key of keys) {
      if (
        this.normalizeComparableValue(existing[key]) !==
        this.normalizeComparableValue(next[key])
      ) {
        return true;
      }
    }

    return false;
  }

  private normalizeComparableValue(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }
    if (value instanceof Prisma.Decimal) {
      return value.toString();
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  }

  private async loadEstateWebSettingsByUserIds(
    userIds: string[],
  ): Promise<Map<string, Prisma.JsonValue | null>> {
    const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
    if (uniqueUserIds.length === 0) {
      return new Map();
    }

    const rows = await this.prisma.userIntegrationSettings.findMany({
      where: {
        user_id: { in: uniqueUserIds },
        integration_target: { integration_type: IntegrationType.ESTATEWEB },
      },
      select: { user_id: true, settings: true },
    });

    return new Map(rows.map((row) => [row.user_id, row.settings]));
  }

  private mapFromCanonical(property: Property, textTruncatePieces?: string[]) {
    return {
      property_id: property.property_id,
      internal_id: property.internal_id,
      title:
        applyTextTruncatePieces(property.title, textTruncatePieces) ??
        property.title,
      description: applyTextTruncatePieces(
        property.description,
        textTruncatePieces,
      ),
      listing_type: property.listing_type,
      property_type: property.property_type,
      status: property.status,
      price: property.price,
      currency: property.currency,
      city: property.city,
      district: property.district,
      address: property.address,
      postal_code: property.postal_code,
      country: property.country,
      latitude: property.latitude,
      longitude: property.longitude,
      square_meters: property.square_meters,
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      floor: property.floor,
      construction_year: property.construction_year,
      renovation_year: property.renovation_year,
      estateweb_type_id: property.estateweb_type_id,
      estateweb_location_id: property.estateweb_location_id,
      cms_fields: property.cms_fields ?? undefined,
      cms_metadata: property.cms_metadata ?? undefined,
      video_url: property.video_url,
      distance_airport: property.distance_airport,
      distance_port: property.distance_port,
      distance_beach: property.distance_beach,
      price_start: property.price_start,
      price_web: property.price_web,
      features: property.features ?? undefined,
      images: property.images ?? undefined,
      normalized_data: property.normalized_data ?? undefined,
      duplicate_group_id: property.duplicate_group_id,
      last_synced_at: new Date(),
      is_modified: false,
    };
  }

  private async resolveSourceAgencyId(
    propertyId: string,
  ): Promise<string | null> {
    const link = await this.prisma.propertySourceLink.findFirst({
      where: { property_id: propertyId },
      include: {
        source_property: { select: { source_agency_id: true } },
      },
    });

    return link?.source_property.source_agency_id ?? null;
  }

  private async assertOwned(userId: string, id: string) {
    const userProperty = await this.prisma.userProperty.findFirst({
      where: { id, user_id: userId },
      select: { id: true },
    });

    if (!userProperty) {
      throw new ForbiddenException('Property not found');
    }
  }

  private buildAdminWhere(
    query: AdminUserPropertyQueryType,
  ): Prisma.UserPropertyWhereInput {
    const historyFilter = buildHistoryChangeFilter({
      change: query.change,
      dateFrom: query.date_from,
      dateTo: query.date_to,
    });
    const hasCanonicalFilter =
      !!query.agency_id ||
      query.has_duplicate_group !== undefined ||
      !!historyFilter;

    return {
      ...(query.user_id && { user_id: query.user_id }),
      ...(query.status && { status: query.status }),
      ...(query.listing_type && { listing_type: query.listing_type }),
      ...(query.property_type && { property_type: query.property_type }),
      ...(query.search && {
        OR: [
          { id: { equals: query.search } },
          { property_id: { contains: query.search, mode: 'insensitive' } },
          { internal_id: { contains: query.search, mode: 'insensitive' } },
          {
            integration_property_id: {
              contains: query.search,
              mode: 'insensitive',
            },
          },
          { title: { contains: query.search, mode: 'insensitive' } },
          { city: { contains: query.search, mode: 'insensitive' } },
          { district: { contains: query.search, mode: 'insensitive' } },
          {
            user: {
              email: { contains: query.search, mode: 'insensitive' },
            },
          },
        ],
      }),
      ...(hasCanonicalFilter && {
        canonical_property: {
          ...(query.agency_id && {
            source_links: {
              some: {
                source_property: { source_agency_id: query.agency_id },
              },
            },
          }),
          ...(query.has_duplicate_group === true && {
            duplicate_group_id: { not: null },
          }),
          ...(query.has_duplicate_group === false && {
            duplicate_group_id: null,
          }),
          ...(historyFilter && { history: historyFilter }),
        },
      }),
      ...(!query.change && (query.date_from || query.date_to)
        ? {
            created_at: {
              ...(query.date_from && { gte: query.date_from }),
              ...(query.date_to && { lte: query.date_to }),
            },
          }
        : {}),
      ...(query.pushed_to_crm === true && {
        integration_property_id: { not: null },
      }),
      ...(query.pushed_to_crm === false && {
        integration_property_id: null,
      }),
      ...(query.pending_crm_update !== undefined && {
        pending_crm_update: query.pending_crm_update,
      }),
    };
  }

  async adminFindAll(query: AdminUserPropertyQueryType) {
    const where = this.buildAdminWhere(query);
    const unlimited = query.limit === 0;

    const [items, total] = await Promise.all([
      this.prisma.userProperty.findMany({
        where,
        ...(unlimited
          ? {}
          : {
              skip: (query.page - 1) * query.limit,
              take: query.limit,
            }),
        orderBy:
          query.has_duplicate_group === true
            ? [
                { canonical_property: { duplicate_group_id: 'asc' } },
                { updated_at: 'desc' },
              ]
            : { updated_at: 'desc' },
        include: {
          user: { select: { id: true, email: true } },
          canonical_property: {
            select: { duplicate_group_id: true },
          },
        },
      }),
      this.prisma.userProperty.count({ where }),
    ]);

    const totalPages = unlimited ? 1 : Math.ceil(total / query.limit);

    return {
      data: items.map(({ canonical_property, user, ...item }) =>
        serializePropertyForApi({
          ...item,
          user,
          duplicate_group_id: canonical_property.duplicate_group_id,
        }),
      ),
      pagination: {
        page: unlimited ? 1 : query.page,
        limit: query.limit,
        total,
        total_pages: totalPages,
        has_next: unlimited ? false : query.page < totalPages,
        has_prev: unlimited ? false : query.page > 1,
      },
    };
  }

  async adminCount(query: AdminUserPropertyQueryType) {
    const total = await this.prisma.userProperty.count({
      where: this.buildAdminWhere(query),
    });
    return { total };
  }

  async adminFindOne(id: string) {
    const userProperty = await this.prisma.userProperty.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, role: true } },
        integration_properties: {
          orderBy: { updated_at: 'desc' },
        },
        canonical_property: {
          include: {
            source_links: {
              include: {
                source_property: {
                  select: {
                    id: true,
                    source_url: true,
                    property_id: true,
                    internal_id: true,
                    raw_title: true,
                    raw_description: true,
                    raw_price: true,
                    raw_location: true,
                    raw_property_type: true,
                    raw_listing_type: true,
                    raw_sqm: true,
                    raw_bedrooms: true,
                    raw_bathrooms: true,
                    last_seen_at: true,
                    status: true,
                  },
                },
              },
            },
            history: {
              orderBy: { created_at: 'desc' },
            },
          },
        },
      },
    });

    if (!userProperty) {
      throw new NotFoundException('User property not found');
    }

    const { canonical_property, user, integration_properties, ...rest } =
      userProperty;
    const integrationProperty =
      integration_properties.find((row) => row.user_id === userProperty.user_id) ??
      null;

    return serializePropertyForApi({
      ...rest,
      user,
      duplicate_group_id: canonical_property.duplicate_group_id,
      source_links: canonical_property.source_links,
      history: canonical_property.history,
      integration_property: integrationProperty
        ? {
            id: integrationProperty.id,
            user_id: integrationProperty.user_id,
            user_integration_settings_id:
              integrationProperty.user_integration_settings_id,
            user_property_id: integrationProperty.user_property_id,
            images: integrationProperty.images,
            created_at: integrationProperty.created_at,
            updated_at: integrationProperty.updated_at,
          }
        : null,
    });
  }

  async adminRemove(id: string) {
    const property = await this.prisma.userProperty.findUnique({
      where: { id },
      select: {
        id: true,
        user_id: true,
        duplicate_group_id: true,
        canonical_property: { select: { duplicate_group_id: true } },
      },
    });

    if (!property) {
      throw new NotFoundException('User property not found');
    }

    const groupId =
      property.canonical_property.duplicate_group_id ??
      property.duplicate_group_id;

    await this.prisma.userProperty.delete({ where: { id } });

    if (groupId) {
      await this.clearSingletonUserDuplicateGroups(property.user_id, [
        groupId,
      ]);
    }
  }

  async adminRemoveMany(ids: string[]) {
    const uniqueIds = [...new Set(ids)];
    const properties = await this.prisma.userProperty.findMany({
      where: { id: { in: uniqueIds } },
      select: {
        id: true,
        user_id: true,
        duplicate_group_id: true,
        canonical_property: { select: { duplicate_group_id: true } },
      },
    });

    if (properties.length !== uniqueIds.length) {
      throw new NotFoundException('One or more user properties not found');
    }

    await this.prisma.userProperty.deleteMany({
      where: { id: { in: uniqueIds } },
    });

    const groupsByUser = new Map<string, string[]>();
    for (const property of properties) {
      const groupId =
        property.canonical_property.duplicate_group_id ??
        property.duplicate_group_id;
      if (!groupId) continue;
      const groupIds = groupsByUser.get(property.user_id) ?? [];
      groupIds.push(groupId);
      groupsByUser.set(property.user_id, groupIds);
    }

    await Promise.all(
      [...groupsByUser.entries()].map(([userId, groupIds]) =>
        this.clearSingletonUserDuplicateGroups(userId, groupIds),
      ),
    );

    return { deleted: uniqueIds.length };
  }

  async adminTruncateDescriptions(
    ids: string[],
    text: string,
    replacement?: string,
  ) {
    const pieces = normalizeTextTruncatePieces([text]);
    if (pieces.length === 0) {
      throw new BadRequestException('Truncate text is required');
    }

    const replaceWith = replacement ?? '';
    const persistPieces = replaceWith.length === 0;

    const uniqueIds = [...new Set(ids)];
    const properties = await this.prisma.userProperty.findMany({
      where: { id: { in: uniqueIds } },
      select: {
        id: true,
        user_id: true,
        title: true,
        description: true,
        canonical_property_id: true,
      },
    });

    if (properties.length !== uniqueIds.length) {
      throw new NotFoundException('One or more user properties not found');
    }

    const propertyUpdates = properties.flatMap((property) => {
      const nextTitle =
        applyTextTruncatePieces(property.title, pieces, replaceWith) ??
        property.title;
      const nextDescription = applyTextTruncatePieces(
        property.description,
        pieces,
        replaceWith,
      );

      if (
        nextTitle === property.title &&
        nextDescription === property.description
      ) {
        return [];
      }

      return [
        {
          id: property.id,
          title: nextTitle,
          description: nextDescription,
        },
      ];
    });

    const canonicalPropertyIds = [
      ...new Set(properties.map((property) => property.canonical_property_id)),
    ];
    const userIds = [...new Set(properties.map((property) => property.user_id))];

    await this.prisma.$transaction(
      async (tx) => {
        if (propertyUpdates.length > 0) {
          await Promise.all(
            propertyUpdates.map((update) =>
              tx.userProperty.update({
                where: { id: update.id },
                data: {
                  title: update.title,
                  description: update.description,
                },
              }),
            ),
          );
        }

        if (!persistPieces) return;

        const links = await tx.propertySourceLink.findMany({
          where: { property_id: { in: canonicalPropertyIds } },
          select: {
            source_property: { select: { source_agency_id: true } },
          },
        });

        const sourceAgencyIds = [
          ...new Set(
            links
              .map((link) => link.source_property.source_agency_id)
              .filter((agencyId): agencyId is string => Boolean(agencyId)),
          ),
        ];

        if (sourceAgencyIds.length === 0) return;

        const trackers = await tx.userTrackedAgency.findMany({
          where: {
            user_id: { in: userIds },
            source_agency_id: { in: sourceAgencyIds },
          },
          select: { id: true, text_truncate_pieces: true },
        });

        const trackerUpdates = trackers.flatMap((tracker) => {
          const nextPieces = normalizeTextTruncatePieces([
            ...tracker.text_truncate_pieces,
            ...pieces,
          ]);
          if (
            nextPieces.length === tracker.text_truncate_pieces.length &&
            nextPieces.every(
              (piece, index) => piece === tracker.text_truncate_pieces[index],
            )
          ) {
            return [];
          }

          return [{ id: tracker.id, text_truncate_pieces: nextPieces }];
        });

        if (trackerUpdates.length === 0) return;

        await Promise.all(
          trackerUpdates.map((update) =>
            tx.userTrackedAgency.update({
              where: { id: update.id },
              data: { text_truncate_pieces: update.text_truncate_pieces },
            }),
          ),
        );
      },
      { timeout: 30_000 },
    );

    return { updated: propertyUpdates.length, total: uniqueIds.length };
  }

  async adminSplitMany(ids: string[]) {
    const uniqueIds = [...new Set(ids)];
    const properties = await this.prisma.userProperty.findMany({
      where: { id: { in: uniqueIds } },
      select: {
        id: true,
        user_id: true,
        duplicate_group_id: true,
        canonical_property_id: true,
        canonical_property: { select: { duplicate_group_id: true } },
      },
    });

    if (properties.length !== uniqueIds.length) {
      throw new NotFoundException('One or more user properties not found');
    }

    const grouped = properties.filter(
      (property) =>
        property.canonical_property.duplicate_group_id ??
        property.duplicate_group_id,
    );

    if (grouped.length === 0) {
      throw new BadRequestException(
        'None of the selected properties are in a duplicate group',
      );
    }

    const userPropertyIds = grouped.map((property) => property.id);
    const canonicalIds = [
      ...new Set(grouped.map((property) => property.canonical_property_id)),
    ];

    await this.prisma.$transaction([
      this.prisma.property.updateMany({
        where: { id: { in: canonicalIds } },
        data: { duplicate_group_id: null },
      }),
      this.prisma.userProperty.updateMany({
        where: {
          OR: [
            { id: { in: userPropertyIds } },
            { canonical_property_id: { in: canonicalIds } },
          ],
        },
        data: { duplicate_group_id: null },
      }),
    ]);

    const groupsByUser = new Map<string, string[]>();
    for (const property of grouped) {
      const groupId =
        property.canonical_property.duplicate_group_id ??
        property.duplicate_group_id;
      if (!groupId) continue;
      const groupIds = groupsByUser.get(property.user_id) ?? [];
      groupIds.push(groupId);
      groupsByUser.set(property.user_id, groupIds);
    }

    await Promise.all(
      [...groupsByUser.entries()].map(([userId, groupIds]) =>
        this.clearSingletonUserDuplicateGroups(userId, groupIds),
      ),
    );

    return { split: grouped.length };
  }

  async adminDedupeGroups(ids: string[]) {
    const uniqueIds = [...new Set(ids)];
    const properties = await this.prisma.userProperty.findMany({
      where: { id: { in: uniqueIds } },
      select: {
        id: true,
        user_id: true,
        duplicate_group_id: true,
        canonical_property: { select: { duplicate_group_id: true } },
      },
    });

    if (properties.length !== uniqueIds.length) {
      throw new NotFoundException('One or more user properties not found');
    }

    const byGroup = new Map<string, string[]>();
    for (const property of properties) {
      const groupId =
        property.canonical_property.duplicate_group_id ??
        property.duplicate_group_id;
      if (!groupId) continue;
      const members = byGroup.get(groupId) ?? [];
      members.push(property.id);
      byGroup.set(groupId, members);
    }

    const keepIds: string[] = [];
    const deleteIds: string[] = [];
    const affectedByUser = new Map<string, string[]>();

    for (const [groupId, members] of byGroup) {
      if (members.length < 2) continue;
      const sorted = [...members].sort();
      keepIds.push(sorted[0]);
      deleteIds.push(...sorted.slice(1));

      for (const id of members) {
        const property = properties.find((item) => item.id === id);
        if (!property) continue;
        const groupIds = affectedByUser.get(property.user_id) ?? [];
        groupIds.push(groupId);
        affectedByUser.set(property.user_id, groupIds);
      }
    }

    if (deleteIds.length === 0) {
      throw new BadRequestException(
        'Select at least two properties from the same duplicate group',
      );
    }

    await this.prisma.userProperty.deleteMany({
      where: { id: { in: deleteIds } },
    });

    await Promise.all(
      [...affectedByUser.entries()].map(([userId, groupIds]) =>
        this.clearSingletonUserDuplicateGroups(userId, groupIds),
      ),
    );

    return { deleted: deleteIds.length, kept: keepIds };
  }
}
