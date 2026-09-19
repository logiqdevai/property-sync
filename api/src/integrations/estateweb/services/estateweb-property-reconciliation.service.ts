import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import {
  PropertyHistoryEventType,
  UserProperty,
} from 'generated/prisma';
import { EstateWebScope } from '../constants/estateweb-enums.constants';
import { resolveEstateWebScopeId } from '../utils/estateweb-catalog.util';
import {
  EstateWebPropertyListItem,
} from '../interfaces/estateweb-property.interface';
import { resolveSaleBasePrice } from '@/modules/user-integrations/utils/sales-pricing.util';
import { buildEstateWebReconcileCodes } from '../utils/estateweb-property-code.util';
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

  async loadCatalog(
    userIntegrationId: string,
  ): Promise<EstateWebPropertyCatalog | null> {
    try {
      const [response, pushSites] = await Promise.all([
        this.estateWebPropertyService.listAllPropertiesForIntegration(
          userIntegrationId,
        ),
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
        `EstateWeb reconciliation catalog unavailable for integration ${userIntegrationId}: ${message}`,
      );
      return null;
    }
  }

  async reconcileCreate(
    userProperty: UserProperty,
    catalog: EstateWebPropertyCatalog,
    crawlRunId?: string | null,
  ): Promise<ReconcileCreateOutcome> {
    // Look up the code we actually push (sanitized internal_id, falling back to
    // property_id), not just the raw internal_id -- otherwise a listing we already
    // created is invisible here whenever the two differ, and a retry duplicates it.
    let listing: EstateWebPropertyListItem | undefined;
    for (const code of buildEstateWebReconcileCodes(
      userProperty.internal_id,
      userProperty.property_id,
    )) {
      const candidate = catalog.byCode.get(code);
      if (!candidate) continue;

      if (this.isDefiniteCodeCollision(userProperty, candidate)) {
        this.logger.warn(
          `Refusing EstateWeb reconciliation for user property ${userProperty.id}: code "${code}" exists on listing ${candidate.id} but identity fields conflict`,
        );
        continue;
      }

      listing = candidate;
      break;
    }

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

  private isDefiniteCodeCollision(
    userProperty: UserProperty,
    listing: EstateWebPropertyListItem,
  ): boolean {
    if (this.resolveScopeId(userProperty) !== Number(listing.scope_id)) {
      return true;
    }

    const userAddress = (userProperty.address ?? '').trim();
    const listingAddress = (listing.address ?? '').trim();
    if (
      userAddress.length > 0 &&
      listingAddress.length > 0 &&
      !this.stringsEqual(userAddress, listingAddress)
    ) {
      return true;
    }

    // The price we push is resolveSaleBasePrice(price, price_web, sqm), which can
    // legitimately differ from the raw `price` (e.g. `price` was mis-parsed as the
    // sqm figure). Accept a match on either, or we'd refuse our own listing.
    const pushedPrice = resolveSaleBasePrice(
      userProperty.price,
      userProperty.price_web,
      userProperty.square_meters,
    );
    if (
      userProperty.price != null &&
      listing.price != null &&
      !this.pricesEqual(userProperty.price, listing.price) &&
      !this.pricesEqual(pushedPrice, listing.price)
    ) {
      return true;
    }

    if (
      userProperty.square_meters != null &&
      listing.sqm != null &&
      !this.numbersEqual(userProperty.square_meters, listing.sqm)
    ) {
      return true;
    }

    return false;
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

  private normalizeCode(value: string | null | undefined): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed.toLowerCase() : null;
  }

  private async shouldPushUpdate(
    userProperty: UserProperty,
    listing: EstateWebPropertyListItem,
    pushSiteIds: Set<number>,
    crawlRunId?: string | null,
  ): Promise<boolean> {
    if (userProperty.pending_crm_update) {
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

  private resolveScopeId(userProperty: UserProperty): EstateWebScope {
    const scopeId = resolveEstateWebScopeId(
      userProperty.listing_type,
      userProperty.estateweb_scope_id,
    );
    if (scopeId === EstateWebScope.RENT) return EstateWebScope.RENT;
    return EstateWebScope.SALE;
  }

  private pricesEqual(
    left: UserProperty['price'] | number,
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
