import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import {
  PropertyHistoryEventType,
  PropertyStatus,
  UserProperty,
} from 'generated/prisma';
import { EstateWebScope } from '../constants/estateweb-enums.constants';
import { resolveEstateWebScopeId } from '../utils/estateweb-catalog.util';
import {
  EstateWebPropertyListItem,
} from '../interfaces/estateweb-property.interface';
import { EstateWebIntegrationResolverService } from './estateweb-integration-resolver.service';
import { EstateWebPropertyService } from './estateweb-property.service';

const CMS_RELEVANT_HISTORY_EVENTS: PropertyHistoryEventType[] = [
  PropertyHistoryEventType.PRICE_CHANGED,
  PropertyHistoryEventType.UPDATED,
  PropertyHistoryEventType.IMAGE_ADDED,
  PropertyHistoryEventType.IMAGE_REMOVED,
  PropertyHistoryEventType.STATUS_CHANGED,
  PropertyHistoryEventType.REAPPEARED,
];

export interface EstateWebPropertyCatalog {
  byCode: Map<string, EstateWebPropertyListItem>;
  pushSiteIds: Set<number>;
}

export interface ReconcileCreateOutcome {
  matched: boolean;
  integrationPropertyId?: string;
  shouldUpdate: boolean;
}

@Injectable()
export class EstateWebPropertyReconciliationService {
  private readonly logger = new Logger(EstateWebPropertyReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly estateWebPropertyService: EstateWebPropertyService,
    private readonly estateWebIntegrationResolverService: EstateWebIntegrationResolverService,
  ) {}

  async loadCatalog(userId: string): Promise<EstateWebPropertyCatalog | null> {
    try {
      const { userIntegrationId } =
        await this.estateWebIntegrationResolverService.resolveDefaultForUser(
          userId,
        );
      const [response, pushSites] = await Promise.all([
        this.estateWebPropertyService.listAllProperties(userId),
        this.estateWebIntegrationResolverService.resolvePushSites(
          userIntegrationId,
        ),
      ]);

      return {
        byCode: this.buildCodeIndex(response.list),
        pushSiteIds: new Set(
          pushSites
            .filter((site) => site.selected)
            .map((site) => site.agent_site_id),
        ),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `EstateWeb reconciliation catalog unavailable for user ${userId}: ${message}`,
      );
      return null;
    }
  }

  async reconcileCreate(
    userProperty: UserProperty,
    catalog: EstateWebPropertyCatalog,
    crawlRunId?: string,
  ): Promise<ReconcileCreateOutcome> {
    const listing = this.findMatchingListing(userProperty, catalog.byCode);
    if (!listing) {
      return { matched: false, shouldUpdate: false };
    }

    const integrationPropertyId = String(listing.id);
    const shouldUpdate = await this.shouldPushUpdate(
      userProperty,
      listing,
      catalog.pushSiteIds,
      crawlRunId,
    );

    return {
      matched: true,
      integrationPropertyId,
      shouldUpdate,
    };
  }

  findMatchingListing(
    userProperty: UserProperty,
    byCode: Map<string, EstateWebPropertyListItem>,
  ): EstateWebPropertyListItem | null {
    for (const code of this.resolveUserPropertyCodes(userProperty)) {
      const listing = byCode.get(code);
      if (listing) {
        return listing;
      }
    }
    return null;
  }

  private buildCodeIndex(
    listings: EstateWebPropertyListItem[],
  ): Map<string, EstateWebPropertyListItem> {
    const byCode = new Map<string, EstateWebPropertyListItem>();

    for (const listing of listings) {
      const code = this.normalizeCode(listing.code);
      if (!code) continue;
      if (byCode.has(code)) continue;
      byCode.set(code, listing);
    }

    return byCode;
  }

  private resolveUserPropertyCodes(userProperty: UserProperty): string[] {
    const codes = new Set<string>();
    const internalId = this.normalizeCode(userProperty.internal_id);
    const propertyId = this.normalizeCode(userProperty.property_id);
    if (internalId) codes.add(internalId);
    if (propertyId) codes.add(propertyId);
    return [...codes];
  }

  private normalizeCode(value: string | null | undefined): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed.toLowerCase() : null;
  }

  private async shouldPushUpdate(
    userProperty: UserProperty,
    listing: EstateWebPropertyListItem,
    pushSiteIds: Set<number>,
    crawlRunId?: string,
  ): Promise<boolean> {
    if (userProperty.pending_crm_update) {
      return true;
    }

    if (this.differsFromListing(userProperty, listing, pushSiteIds)) {
      return true;
    }

    if (!crawlRunId) {
      return false;
    }

    const crawlHistory = await this.prisma.propertyHistory.findFirst({
      where: {
        property_id: userProperty.canonical_property_id,
        crawl_run_id: crawlRunId,
        event_type: { in: CMS_RELEVANT_HISTORY_EVENTS },
      },
      select: { id: true },
    });

    return Boolean(crawlHistory);
  }

  private differsFromListing(
    userProperty: UserProperty,
    listing: EstateWebPropertyListItem,
    pushSiteIds: Set<number>,
  ): boolean {
    if (!this.pricesEqual(userProperty.price, listing.price)) {
      return true;
    }

    if (
      !this.stringsEqual(userProperty.address ?? '', listing.address ?? '')
    ) {
      return true;
    }

    if (!this.numbersEqual(userProperty.square_meters, listing.sqm)) {
      return true;
    }

    if (this.resolveScopeId(userProperty) !== Number(listing.scope_id)) {
      return true;
    }

    if (
      userProperty.status === PropertyStatus.REMOVED &&
      this.hasSelectedPushSite(listing, pushSiteIds)
    ) {
      return true;
    }

    return false;
  }

  private hasSelectedPushSite(
    listing: EstateWebPropertyListItem,
    pushSiteIds: Set<number>,
  ): boolean {
    return (listing.sites ?? []).some(
      (site) =>
        pushSiteIds.has(Number(site.agent_site_id)) &&
        Boolean(site.selected),
    );
  }

  private resolveScopeId(userProperty: UserProperty): EstateWebScope {
    const scopeId = resolveEstateWebScopeId(
      userProperty.listing_type,
      userProperty.estateweb_scope_id,
    );
    if (scopeId === EstateWebScope.RENT) return EstateWebScope.RENT;
    return EstateWebScope.SALE;
  }

  private pricesEqual(
    left: UserProperty['price'],
    right: number | undefined,
  ): boolean {
    const a = left != null ? Number(left) : null;
    const b = right != null ? Number(right) : null;
    if (a == null && b == null) return true;
    if (a == null || b == null) return false;
    if (a === b) return true;
    const max = Math.max(Math.abs(a), Math.abs(b));
    if (max === 0) return true;
    return Math.abs(a - b) / max <= 0.01;
  }

  private numbersEqual(
    left: UserProperty['square_meters'],
    right: number | undefined,
  ): boolean {
    const a = left != null ? Number(left) : null;
    const b = right != null ? Number(right) : null;
    if (a == null && b == null) return true;
    if (a == null || b == null) return false;
    return Math.abs(a - b) < 0.01;
  }

  private stringsEqual(left: string, right: string): boolean {
    return left.trim().toLowerCase() === right.trim().toLowerCase();
  }
}
