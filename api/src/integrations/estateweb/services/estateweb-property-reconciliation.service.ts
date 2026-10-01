import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import {
  PropertyHistoryEventType,
  UserProperty,
} from 'generated/prisma';
import {
  EstateWebPropertyListItem,
} from '../interfaces/estateweb-property.interface';
import {
  buildEstateWebReconcileCodes,
  estateWebCodeLookupKeys,
} from '../utils/estateweb-property-code.util';
import { isEstateWebListingIdentityMismatch } from '../utils/estateweb-listing-identity.util';
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
    return isEstateWebListingIdentityMismatch(userProperty, listing);
  }

  private buildCodeIndex(
    listings: EstateWebPropertyListItem[],
  ): Map<string, EstateWebPropertyListItem> {
    const byCode = new Map<string, EstateWebPropertyListItem>();

    // Exact codes first, in listing order, so a real exact-code match always wins.
    for (const listing of listings) {
      const code = this.normalizeCode(listing.code);
      if (!code) continue;
      if (byCode.has(code)) continue;
      byCode.set(code, listing);
    }

    // Fallback pass: a listing whose code carries a leading numeric category prefix
    // from a prior bulk import (e.g. "4-2569") is also indexed under the de-prefixed
    // code, so it can still be found here even though our own internal_id/property_id
    // never carries that prefix -- otherwise reconcileCreate() never sees it as a
    // match and creates a duplicate instead (see docs/CLIENT-ISSUES-2026-10-01.md #4).
    // Never overrides an exact-code match found above.
    for (const listing of listings) {
      for (const key of estateWebCodeLookupKeys(listing.code)) {
        if (!byCode.has(key)) byCode.set(key, listing);
      }
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

}
