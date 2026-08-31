import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Button,
  Checkbox,
  Chip,
  Input,
  Pagination,
  Select,
  ListBox,
  Table,
  Tabs,
  useOverlayState,
  type Selection,
} from "@heroui/react";
import { CircleDot, Compass, CopyCheck, ExternalLink, Globe, Hash, ImageOff, Images, Languages, Layers, ListFilter, MapIcon, MapPin, NotebookPen, Percent, RefreshCw, Scissors, Sparkles, TableIcon, Trash2, Ungroup, Upload, X } from "lucide-react";
import { Routes } from "@/routes/routes";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { ClearableSearchInput } from "@/components/ui/clearable-search-input";
import { CopyIconButton } from "@/components/ui/copy-icon-button";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { TruncateDescriptionDialog } from "@/components/ui/truncate-description-dialog";
import { BulkActionsMenu } from "@/components/ui/bulk-actions-menu";
import { GeocodeMissingCoordinatesModal } from "@/components/ui/geocode-missing-coordinates-modal";
import { ResolveEstateWebLocationsModal } from "@/components/ui/resolve-estateweb-locations-modal";
import { PropertyStatusChip } from "@/components/ui/property-status-chip";
import { MigrateIntegrationImagesModal } from "@/components/ui/migrate-integration-images-modal";
import {
  TableRowActionsMenu,
  type TableRowAction,
  type TableRowActionEntry,
} from "@/components/ui/table-row-actions-menu";
import { useIsMobile } from "@/hooks/use-mobile";
import { ManageEstateWebSitesModal } from "./components/manage-estateweb-sites-modal";
import { EstateWebDuplicatePropertiesModal } from "./components/estateweb-duplicate-properties-modal";
import { EstateWebOrphanSitesModal } from "./components/estateweb-orphan-sites-modal";
import { RemoveWatermarkByCountModal } from "./components/remove-watermark-by-count-modal";
import { ProduceContentModal } from "./components/produce-content-modal";
import { ChangePropertyStatusModal } from "./components/change-property-status-modal";
import {
  PropertyStatuses,
  type PropertyStatus,
} from "@/features/properties/interfaces/properties.interfaces";
import { PropertyStatusFilterOptions } from "@/config/constants/dropdowns/properties/property-status-filter.options";
import { PropertyChangeFilterOptions } from "@/config/constants/dropdowns/properties/property-change-filter.options";
import { PropertySortByOptions } from "@/config/constants/dropdowns/properties/property-sort-by.options";
import { PropertyDuplicateGroupFilterOptions } from "@/config/constants/dropdowns/properties/property-duplicate-group-filter.options";
import { PropertyCrmPushFilterOptions } from "@/config/constants/dropdowns/properties/property-crm-push-filter.options";
import { PropertyPendingCrmUpdateFilterOptions } from "@/config/constants/dropdowns/properties/property-pending-crm-update-filter.options";
import { OrderDirectionOptions } from "@/config/constants/dropdowns/shared/order-direction.options";
import { TablePageSizeOptions } from "@/config/constants/dropdowns/shared/table-page-size.options";
import {
  type OrderBy as OrderByType,
  type OrderDirection as OrderDirectionType,
} from "@/interfaces/filters/filters.interface";
import {
  useDeleteUserProperties,
  useDeleteUserProperty,
  useDedupeUserPropertyGroups,
  useProduceUserPropertyContent,
  usePushUserPropertiesToCrm,
  usePushUserPropertyToCrm,
  useRemoveUserPropertiesWatermarkImages,
  useRenormalizeUserProperties,
  useGeocodeMissingCoordinates,
  useUserPropertiesMissingCoordinatesCount,
  useResolveEstateWebLocations,
  useBulkDeleteUserPropertyIntegrationImages,
  useBulkMigrateUserPropertyIntegrationImages,
  useSplitUserProperties,
  useTruncateUserPropertyDescriptions,
  useUpdateUserPropertySalesPrices,
  useUpdateUserPropertyStatus,
  useSyncUserPropertyCrmClientNotes,
  useUserProperties,
  useUserPropertiesCount,
  useUserPropertiesMap,
} from "@/features/user-properties/hooks/use-user-properties";
import type {
  UserPropertyCountQuery,
  UserPropertyListQuery,
  UserPropertyMapQuery,
} from "@/features/user-properties/interfaces/user-properties.interfaces";
import { PropertyClusterMap } from "@/components/map/property-cluster-map";
import { useTrackableAgencies } from "@/features/user-tracked-agencies/hooks/use-user-tracked-agencies";
import { getTrackableAgencyLabel } from "@/features/user-tracked-agencies/utils/integration-link.utils";
import { RoleTypes } from "@/features/user/interfaces/user.interface";
import { useAuthStore } from "@/stores/auth";
import { formatPrice } from "@/lib/price";
import { formatDateTime, toEndOfDayIso, toStartOfDayIso } from "@/lib/date";
import { getDuplicateGroupRowClasses } from "@/lib/duplicate-group-color.utils";
import { getDuplicateGroupDedupePlan } from "@/lib/duplicate-group-dedupe.utils";
import { getIdPrefixBeforeDash } from "@/lib/id-prefix.utils";
import { cn } from "@/lib/utils";
import { PropertyListCard } from "./components/property-list-card";
import { PropertyTableIdCell } from "./components/property-table-id-cell";
import {
  usePropertiesListFilters,
  type PropertiesListBoolFilter,
  type PropertiesListLocationState,
} from "./hooks/use-properties-list-filters";

const PROPERTY_PUSH_ACTION: TableRowAction = {
  id: "push-to-crm",
  label: "Push to CRM",
  icon: Upload,
};

const PROPERTY_MANAGE_SITES_ACTION: TableRowAction = {
  id: "manage-estateweb-sites",
  label: "Manage EstateWeb Sites",
  icon: Globe,
};

const PROPERTY_UPDATE_SALES_PRICES_ACTION: TableRowAction = {
  id: "update-sales-prices",
  label: "Update sales prices on CRM",
  icon: Percent,
};

const PROPERTY_SYNC_CRM_CLIENT_NOTES_ACTION: TableRowAction = {
  id: "sync-crm-client-notes",
  label: "Sync CRM client notes",
  icon: NotebookPen,
};

const PROPERTY_DELETE_CMS_IMAGES_ACTION: TableRowAction = {
  id: "delete-cms-images",
  label: "Delete CMS images",
  variant: "danger",
  icon: ImageOff,
};

const PROPERTY_MIGRATE_CMS_IMAGES_ACTION: TableRowAction = {
  id: "migrate-cms-images",
  label: "Migrate CMS images",
  icon: Images,
};

const PROPERTY_REMOVE_WATERMARK_ACTION: TableRowAction = {
  id: "remove-watermarks",
  label: "Remove watermarks",
  icon: Sparkles,
};

const PROPERTY_PRODUCE_CONTENT_ACTION: TableRowAction = {
  id: "produce-content",
  label: "Produce content",
  icon: Languages,
};

const PROPERTY_RENORMALIZE_ACTION: TableRowAction = {
  id: "renormalize",
  label: "Renormalize",
  icon: RefreshCw,
};

const PROPERTY_DELETE_ACTION: TableRowAction = {
  id: "delete",
  label: "Delete",
  variant: "danger",
  icon: Trash2,
};

function buildPropertyRowActions(options: {
  canManageBulk: boolean;
  canDelete: boolean;
  hasIntegration: boolean;
  pushPending: boolean;
  producePending: boolean;
  renormalizePending: boolean;
  updateSalesPricesPending: boolean;
  syncCrmClientNotesPending: boolean;
  deleteCmsImagesPending: boolean;
  migrateCmsImagesPending: boolean;
  removeWatermarksPending: boolean;
}): TableRowActionEntry[] {
  const {
    canManageBulk,
    canDelete,
    hasIntegration,
    pushPending,
    producePending,
    renormalizePending,
    updateSalesPricesPending,
    syncCrmClientNotesPending,
    deleteCmsImagesPending,
    migrateCmsImagesPending,
    removeWatermarksPending,
  } = options;

  const imageItems: TableRowAction[] = [
    {
      ...PROPERTY_REMOVE_WATERMARK_ACTION,
      isDisabled: !hasIntegration || removeWatermarksPending,
    },
  ];

  if (canManageBulk) {
    imageItems.push({
      ...PROPERTY_MIGRATE_CMS_IMAGES_ACTION,
      isDisabled: !hasIntegration || migrateCmsImagesPending,
    });
  }

  imageItems.push({
    ...PROPERTY_DELETE_CMS_IMAGES_ACTION,
    isDisabled: !hasIntegration || deleteCmsImagesPending,
  });

  const entries: TableRowActionEntry[] = [
    {
      id: "crm",
      label: "CRM",
      icon: Upload,
      items: [
        {
          ...PROPERTY_PUSH_ACTION,
          isDisabled: pushPending,
        },
        {
          ...PROPERTY_MANAGE_SITES_ACTION,
          isDisabled: !hasIntegration,
        },
        {
          ...PROPERTY_UPDATE_SALES_PRICES_ACTION,
          isDisabled: !hasIntegration || updateSalesPricesPending,
        },
        {
          ...PROPERTY_SYNC_CRM_CLIENT_NOTES_ACTION,
          isDisabled: !hasIntegration || syncCrmClientNotesPending,
        },
      ],
    },
    {
      id: "content",
      label: "Content",
      icon: Languages,
      items: [
        {
          ...PROPERTY_PRODUCE_CONTENT_ACTION,
          isDisabled: producePending,
        },
        {
          ...PROPERTY_RENORMALIZE_ACTION,
          isDisabled: renormalizePending,
        },
      ],
    },
    {
      id: "images",
      label: "Images",
      icon: Images,
      items: imageItems,
    },
  ];

  if (canDelete) {
    entries.push(PROPERTY_DELETE_ACTION);
  }

  return entries;
}

export default function DashboardPropertiesListPage() {
  const isMobile = useIsMobile();
  const deleteConfirm = useOverlayState();
  const bulkDeleteConfirm = useOverlayState();
  const dedupeConfirm = useOverlayState();
  const truncateConfirm = useOverlayState();
  const splitConfirm = useOverlayState();
  const manageSitesModal = useOverlayState();
  const removeWatermarkModal = useOverlayState();
  const produceContentModal = useOverlayState();
  const changeStatusModal = useOverlayState();
  const updateSalesPricesConfirm = useOverlayState();
  const syncCrmClientNotesConfirm = useOverlayState();
  const renormalizeConfirm = useOverlayState();
  const deleteCmsImagesConfirm = useOverlayState();
  const migrateCmsImagesModal = useOverlayState();
  const checkCrmDuplicatesModal = useOverlayState();
  const manageOrphanSitesModal = useOverlayState();
  const geocodeModal = useOverlayState();
  const resolveEstateWebLocationsModal = useOverlayState();
  const [manageSitesPropertyIds, setManageSitesPropertyIds] = useState<string[]>([]);
  const [removeWatermarkPropertyIds, setRemoveWatermarkPropertyIds] = useState<
    string[]
  >([]);
  const [produceContentPropertyIds, setProduceContentPropertyIds] = useState<
    string[]
  >([]);
  const [changeStatusPropertyIds, setChangeStatusPropertyIds] = useState<string[]>(
    [],
  );
  const [salesPricesPropertyIds, setSalesPricesPropertyIds] = useState<string[]>([]);
  const [crmClientNotesPropertyIds, setCrmClientNotesPropertyIds] = useState<
    string[]
  >([]);
  const [renormalizePropertyIds, setRenormalizePropertyIds] = useState<string[]>([]);
  const [deleteCmsImagesPropertyIds, setDeleteCmsImagesPropertyIds] = useState<
    string[]
  >([]);
  const [migrateCmsImagesPropertyIds, setMigrateCmsImagesPropertyIds] = useState<
    string[]
  >([]);
  const role = useAuthStore((state) => state.role);
  const canDelete = role === RoleTypes.SUPER_ADMIN || role === RoleTypes.ADMIN;

  const location = useLocation();
  const {
    status,
    change,
    search,
    trackedAgencyId,
    duplicateGroup,
    pushedToCrm,
    pendingCrmUpdate,
    dateFrom,
    dateTo,
    orderBy,
    orderDirection,
    limit,
    page,
    view,
    activeFilterCount,
    setFilters,
    setView,
    clearFilters,
  } = usePropertiesListFilters();
  const detailLinkState = useMemo<PropertiesListLocationState>(
    () => ({
      returnTo: `${Routes.dashboard.properties.list}${location.search}`,
    }),
    [location.search],
  );
  const [filtersOpen, setFiltersOpen] = useState(() => activeFilterCount > 0);
  const [selectedKeys, setSelectedKeys] = useState<Selection>(new Set());
  const [selectCount, setSelectCount] = useState(10);
  const [deletePropertyId, setDeletePropertyId] = useState<string | null>(null);

  const query = useMemo<UserPropertyListQuery>(
    () => ({
      page,
      limit,
      ...(status !== "all" && { status }),
      ...(change !== "all" && { change }),
      ...(search.trim() && { search: search.trim() }),
      ...(trackedAgencyId !== "all" && { user_tracked_agency_id: trackedAgencyId }),
      ...(duplicateGroup !== "all" && {
        has_duplicate_group: duplicateGroup === "true",
      }),
      ...(pushedToCrm !== "all" && {
        pushed_to_crm: pushedToCrm === "true",
      }),
      ...(pendingCrmUpdate !== "all" && {
        pending_crm_update: pendingCrmUpdate === "true",
      }),
      ...(dateFrom && { date_from: toStartOfDayIso(dateFrom) }),
      ...(dateTo && { date_to: toEndOfDayIso(dateTo) }),
      order_by: orderBy,
      order_direction: orderDirection,
    }),
    [
      page,
      limit,
      status,
      change,
      search,
      trackedAgencyId,
      duplicateGroup,
      pushedToCrm,
      pendingCrmUpdate,
      dateFrom,
      dateTo,
      orderBy,
      orderDirection,
    ],
  );

  const countQuery = useMemo<UserPropertyCountQuery>(() => {
    const { page: _page, limit: _limit, ...filters } = query;
    return filters;
  }, [query]);

  const mapQuery = useMemo<UserPropertyMapQuery>(() => {
    const { page: _page, limit: _limit, ...filters } = query;
    return filters;
  }, [query]);

  const { data, isPending } = useUserProperties(query);
  const { data: countData } = useUserPropertiesCount(countQuery);
  const { data: mapData, isPending: isMapPending } = useUserPropertiesMap(mapQuery, {
    enabled: view === "map",
  });
  const { data: agenciesData } = useTrackableAgencies({ limit: 100 });
  const deleteUserProperty = useDeleteUserProperty();
  const deleteUserProperties = useDeleteUserProperties();
  const dedupeUserPropertyGroups = useDedupeUserPropertyGroups();
  const splitUserProperties = useSplitUserProperties();
  const truncateDescriptions = useTruncateUserPropertyDescriptions();
  const pushToCrm = usePushUserPropertyToCrm();
  const pushSelectedToCrm = usePushUserPropertiesToCrm();
  const removeWatermarks = useRemoveUserPropertiesWatermarkImages();
  const produceContent = useProduceUserPropertyContent();
  const updateStatus = useUpdateUserPropertyStatus();
  const updateSalesPrices = useUpdateUserPropertySalesPrices();
  const syncCrmClientNotes = useSyncUserPropertyCrmClientNotes();
  const renormalize = useRenormalizeUserProperties();
  const bulkDeleteCmsImages = useBulkDeleteUserPropertyIntegrationImages();
  const bulkMigrateCmsImages = useBulkMigrateUserPropertyIntegrationImages();
  const geocodeMissingCoordinates = useGeocodeMissingCoordinates();
  const missingCoordinatesCount = useUserPropertiesMissingCoordinatesCount(
    geocodeModal.isOpen,
  );
  const resolveEstateWebLocations = useResolveEstateWebLocations();

  const properties = data?.data ?? [];
  const pagination = data?.pagination;
  const total = countData?.total;
  const selectedIds = useMemo(() => {
    if (selectedKeys === "all") {
      return new Set(properties.map((property) => property.id));
    }
    return new Set([...selectedKeys].map(String));
  }, [selectedKeys, properties]);
  const selectedCount = selectedIds.size;
  const trackedAgencies = (agenciesData?.data ?? []).filter(
    (agency) => agency.is_tracked && agency.user_tracked_agency_id,
  );
  const filteredAgencyName =
    trackedAgencyId === "all"
      ? null
      : (trackedAgencies.find(
          (agency) => agency.user_tracked_agency_id === trackedAgencyId,
        )?.name ?? null);
  const storedTruncateRules = useMemo(() => {
    const relevantAgencies =
      trackedAgencyId !== "all"
        ? trackedAgencies.filter(
            (agency) => agency.user_tracked_agency_id === trackedAgencyId,
          )
        : trackedAgencies;
    const rules = new Set<string>();
    for (const agency of relevantAgencies) {
      for (const rule of agency.tracking_prefs?.text_truncate_pieces ?? []) {
        rules.add(rule);
      }
    }
    return [...rules];
  }, [trackedAgencies, trackedAgencyId]);

  const dedupePlan = useMemo(
    () => getDuplicateGroupDedupePlan(properties, selectedIds),
    [properties, selectedIds],
  );
  const dedupeDeleteCount = dedupePlan.deleteIds.length;
  const canManageBulk = role === RoleTypes.SUPER_ADMIN || role === RoleTypes.ADMIN;
  const selectedGroupedCount = properties.filter(
    (property) => selectedIds.has(property.id) && property.duplicate_group_id,
  ).length;
  const selectedLinkedCount = properties.filter(
    (property) =>
      selectedIds.has(property.id) && Boolean(property.integration_property_id),
  ).length;

  const openManageSites = (ids: string[]) => {
    setManageSitesPropertyIds(ids);
    manageSitesModal.open();
  };

  const openRemoveWatermarks = (ids: string[]) => {
    setRemoveWatermarkPropertyIds(ids);
    removeWatermarkModal.open();
  };

  const openProduceContent = (ids: string[]) => {
    setProduceContentPropertyIds(ids);
    produceContentModal.open();
  };

  const openChangeStatus = (ids: string[]) => {
    setChangeStatusPropertyIds(ids);
    changeStatusModal.open();
  };

  const openUpdateSalesPrices = (ids: string[]) => {
    setSalesPricesPropertyIds(ids);
    updateSalesPricesConfirm.open();
  };

  const openSyncCrmClientNotes = (ids: string[]) => {
    setCrmClientNotesPropertyIds(ids);
    syncCrmClientNotesConfirm.open();
  };

  const openRenormalize = (ids: string[]) => {
    setRenormalizePropertyIds(ids);
    renormalizeConfirm.open();
  };

  const openDeleteCmsImages = (ids: string[]) => {
    setDeleteCmsImagesPropertyIds(ids);
    deleteCmsImagesConfirm.open();
  };

  const openMigrateCmsImages = (ids: string[]) => {
    setMigrateCmsImagesPropertyIds(ids);
    migrateCmsImagesModal.open();
  };

  const bulkActions = useMemo<TableRowActionEntry[]>(() => {
    const imageItems: TableRowAction[] = [
      {
        id: "remove-watermarks",
        label: "Remove watermarks",
        icon: Sparkles,
        isDisabled: selectedLinkedCount < 1 || removeWatermarks.isPending,
      },
    ];

    if (canManageBulk) {
      imageItems.push({
        id: "migrate-cms-images",
        label: "Migrate CMS images",
        icon: Images,
        isDisabled: selectedLinkedCount < 1 || bulkMigrateCmsImages.isPending,
      });
    }

    imageItems.push({
      id: "delete-cms-images",
      label: "Delete CMS images",
      variant: "danger",
      icon: ImageOff,
      isDisabled: selectedLinkedCount < 1 || bulkDeleteCmsImages.isPending,
    });

    const crmItems: TableRowAction[] = [
      {
        id: "push-to-crm",
        label: "Push to CRM",
        icon: Upload,
        isDisabled: selectedCount < 1 || pushSelectedToCrm.isPending,
      },
      {
        id: "manage-estateweb-sites",
        label: "Manage EstateWeb Sites",
        icon: Globe,
        isDisabled: selectedLinkedCount < 1,
      },
      {
        id: "update-sales-prices",
        label: "Update sales prices on CRM",
        icon: Percent,
        isDisabled: selectedLinkedCount < 1 || updateSalesPrices.isPending,
      },
      {
        id: "sync-crm-client-notes",
        label: "Sync CRM client notes",
        icon: NotebookPen,
        isDisabled: selectedLinkedCount < 1 || syncCrmClientNotes.isPending,
      },
    ];

    if (canManageBulk) {
      crmItems.push(
        {
          id: "check-crm-duplicates",
          label: "Check CRM duplicates",
          icon: CopyCheck,
        },
        {
          id: "manage-crm-sites-by-code",
          label: "Manage CRM sites by code",
          icon: Hash,
        },
      );
    }

    const entries: TableRowActionEntry[] = [
      {
        id: "change-status",
        label: "Change status",
        icon: CircleDot,
        isDisabled: selectedCount < 1 || updateStatus.isPending,
      },
      {
        id: "crm",
        label: "CRM",
        icon: Upload,
        items: crmItems,
      },
      {
        id: "content",
        label: "Content",
        icon: Languages,
        items: [
          {
            id: "produce-content",
            label: "Produce content",
            icon: Languages,
            isDisabled: selectedCount < 1 || produceContent.isPending,
          },
          {
            id: "renormalize",
            label: "Renormalize",
            icon: RefreshCw,
            isDisabled: selectedCount < 1 || renormalize.isPending,
          },
          {
            id: "truncate",
            label: "Truncate text",
            icon: Scissors,
            isDisabled: selectedCount < 1,
          },
        ],
      },
      {
        id: "images",
        label: "Images",
        icon: Images,
        items: imageItems,
      },
    ];

    if (canManageBulk) {
      entries.push({
        id: "geocode-missing-coordinates",
        label: "Find missing coordinates",
        icon: MapPin,
      });
      entries.push({
        id: "resolve-estateweb-locations",
        label: "Resolve EstateWeb locations",
        icon: Compass,
      });

      const duplicateItems: TableRowAction[] = [
        {
          id: "split",
          label: "Split from group",
          icon: Ungroup,
          isDisabled: selectedGroupedCount < 1,
        },
      ];

      if (duplicateGroup === "true") {
        duplicateItems.push({
          id: "dedupe",
          label: "Keep one per group",
          icon: Layers,
          isDisabled: dedupeDeleteCount < 1,
        });
      }

      entries.push({
        id: "duplicates",
        label: "Duplicates",
        icon: Layers,
        items: duplicateItems,
      });

      entries.push({
        id: "delete",
        label: "Delete selected",
        variant: "danger",
        icon: Trash2,
        isDisabled: selectedCount < 1,
      });
    }

    return entries;
  }, [
    canManageBulk,
    dedupeDeleteCount,
    duplicateGroup,
    produceContent.isPending,
    pushSelectedToCrm.isPending,
    removeWatermarks.isPending,
    renormalize.isPending,
    bulkDeleteCmsImages.isPending,
    bulkMigrateCmsImages.isPending,
    selectedCount,
    selectedGroupedCount,
    selectedLinkedCount,
    syncCrmClientNotes.isPending,
    updateSalesPrices.isPending,
    updateStatus.isPending,
  ]);

  const clearSelection = () => setSelectedKeys(new Set());

  const allPageSelected =
    properties.length > 0 && properties.every((property) => selectedIds.has(property.id));
  const somePageSelected =
    properties.some((property) => selectedIds.has(property.id)) && !allPageSelected;

  const togglePropertySelection = (propertyId: string, selected: boolean) => {
    setSelectedKeys((prev) => {
      const next = new Set(
        prev === "all" ? properties.map((property) => property.id) : [...prev].map(String),
      );
      if (selected) next.add(propertyId);
      else next.delete(propertyId);
      return next;
    });
  };

  const toggleSelectAllOnPage = (selected: boolean) => {
    if (selected) {
      setSelectedKeys(new Set(properties.map((property) => property.id)));
      return;
    }
    clearSelection();
  };

  const applyFirstNSelection = (selected: boolean) => {
    const count = Math.min(
      Math.max(1, selectCount),
      properties.length,
    );
    const firstIds = properties.slice(0, count).map((property) => property.id);
    setSelectedKeys((prev) => {
      const next = new Set(
        prev === "all"
          ? properties.map((property) => property.id)
          : [...prev].map(String),
      );
      for (const id of firstIds) {
        if (selected) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const handleBulkAction = (actionId: string) => {
    if (actionId === "change-status") {
      openChangeStatus(Array.from(selectedIds));
      return;
    }
    if (actionId === "push-to-crm") {
      void handleBulkPushToCrm();
      return;
    }
    if (actionId === "manage-estateweb-sites") {
      openManageSites(Array.from(selectedIds));
      return;
    }
    if (actionId === "update-sales-prices") {
      const linkedIds = properties
        .filter(
          (property) =>
            selectedIds.has(property.id) && Boolean(property.integration_property_id),
        )
        .map((property) => property.id);
      openUpdateSalesPrices(linkedIds);
      return;
    }
    if (actionId === "sync-crm-client-notes") {
      const linkedIds = properties
        .filter(
          (property) =>
            selectedIds.has(property.id) && Boolean(property.integration_property_id),
        )
        .map((property) => property.id);
      openSyncCrmClientNotes(linkedIds);
      return;
    }
    if (actionId === "delete-cms-images") {
      const linkedIds = properties
        .filter(
          (property) =>
            selectedIds.has(property.id) && Boolean(property.integration_property_id),
        )
        .map((property) => property.id);
      openDeleteCmsImages(linkedIds);
      return;
    }
    if (actionId === "migrate-cms-images") {
      const linkedIds = properties
        .filter(
          (property) =>
            selectedIds.has(property.id) && Boolean(property.integration_property_id),
        )
        .map((property) => property.id);
      openMigrateCmsImages(linkedIds);
      return;
    }
    if (actionId === "remove-watermarks") {
      openRemoveWatermarks(Array.from(selectedIds));
      return;
    }
    if (actionId === "produce-content") {
      openProduceContent(Array.from(selectedIds));
      return;
    }
    if (actionId === "renormalize") {
      openRenormalize(Array.from(selectedIds));
      return;
    }
    if (actionId === "truncate") {
      truncateConfirm.open();
      return;
    }
    if (actionId === "split") {
      splitConfirm.open();
      return;
    }
    if (actionId === "dedupe") {
      dedupeConfirm.open();
      return;
    }
    if (actionId === "check-crm-duplicates") {
      checkCrmDuplicatesModal.open();
      return;
    }
    if (actionId === "manage-crm-sites-by-code") {
      manageOrphanSitesModal.open();
      return;
    }
    if (actionId === "geocode-missing-coordinates") {
      geocodeModal.open();
      return;
    }
    if (actionId === "resolve-estateweb-locations") {
      resolveEstateWebLocationsModal.open();
      return;
    }
    if (actionId === "delete") {
      bulkDeleteConfirm.open();
    }
  };

  const handleDelete = async () => {
    if (!deletePropertyId) return;
    await deleteUserProperty.mutateAsync(deletePropertyId);
    setSelectedKeys((prev) => {
      if (prev === "all") {
        return new Set(
          properties.map((property) => property.id).filter((id) => id !== deletePropertyId),
        );
      }
      const next = new Set(prev);
      next.delete(deletePropertyId);
      return next;
    });
    setDeletePropertyId(null);
  };

  const handleBulkDelete = async () => {
    await deleteUserProperties.mutateAsync({ ids: Array.from(selectedIds) });
    clearSelection();
  };

  const handleDedupeGroups = async () => {
    await dedupeUserPropertyGroups.mutateAsync({
      ids: Array.from(selectedIds),
    });
    clearSelection();
  };

  const handleSplitFromGroup = async () => {
    await splitUserProperties.mutateAsync({
      ids: Array.from(selectedIds),
    });
    clearSelection();
  };

  const handleTruncateDescriptions = async ({
    texts,
    replacement,
  }: {
    texts: string[];
    replacement?: string;
  }) => {
    await truncateDescriptions.mutateAsync({
      ids: Array.from(selectedIds),
      texts,
      ...(replacement ? { replacement } : {}),
    });
    clearSelection();
  };

  const handleBulkPushToCrm = async () => {
    await pushSelectedToCrm.mutateAsync({ ids: Array.from(selectedIds) });
    clearSelection();
  };

  const handleUpdateSalesPrices = async () => {
    if (salesPricesPropertyIds.length === 0) return;
    await updateSalesPrices.mutateAsync({ ids: salesPricesPropertyIds });
    setSalesPricesPropertyIds([]);
    clearSelection();
  };

  const handleSyncCrmClientNotes = async () => {
    if (crmClientNotesPropertyIds.length === 0) return;
    await syncCrmClientNotes.mutateAsync({ ids: crmClientNotesPropertyIds });
    setCrmClientNotesPropertyIds([]);
    clearSelection();
  };

  const handleRenormalize = async () => {
    if (renormalizePropertyIds.length === 0) return;
    await renormalize.mutateAsync({ ids: renormalizePropertyIds });
    setRenormalizePropertyIds([]);
    clearSelection();
  };

  const handleChangeStatus = async (status: PropertyStatus) => {
    if (changeStatusPropertyIds.length === 0) return;
    await updateStatus.mutateAsync({ ids: changeStatusPropertyIds, status });
    setChangeStatusPropertyIds([]);
    clearSelection();
  };

  const handleDeleteCmsImages = async () => {
    if (deleteCmsImagesPropertyIds.length === 0) return;
    await bulkDeleteCmsImages.mutateAsync({ ids: deleteCmsImagesPropertyIds });
    setDeleteCmsImagesPropertyIds([]);
    clearSelection();
  };

  const handleMigrateCmsImages = async (mode: "from_crm" | "remap_sources") => {
    if (migrateCmsImagesPropertyIds.length === 0) return;
    await bulkMigrateCmsImages.mutateAsync({
      ids: migrateCmsImagesPropertyIds,
      mode,
    });
    setMigrateCmsImagesPropertyIds([]);
    clearSelection();
  };

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <p className="text-2xl font-semibold tracking-tight text-foreground">My Properties</p>
          <p className="text-sm text-muted">
            Your tracked listings
            {total != null && (
              <>
                {" "}
                · {total.toLocaleString()} {total === 1 ? "property" : "properties"}
              </>
            )}
          </p>
        </div>
        <BulkActionsMenu
          label={selectedCount > 0 ? `Actions (${selectedCount})` : "Actions"}
          actions={bulkActions}
          onAction={handleBulkAction}
        />
      </div>

      <Tabs
        className="w-fit"
        selectedKey={view}
        onSelectionChange={(key) => setView(key === "map" ? "map" : "table")}
      >
        <Tabs.ListContainer>
          <Tabs.List aria-label="Property view">
            <Tabs.Tab id="table" className="w-auto gap-1.5 px-3">
              <TableIcon className="size-4" />
              Table
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="map" className="w-auto gap-1.5 px-3">
              <MapIcon className="size-4" />
              Map
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>
      </Tabs>

      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
          <ClearableSearchInput
            placeholder="Search..."
            value={search}
            onValueChange={(next) => {
              setFilters({ search: next });
            }}
            className="w-full min-w-0 sm:flex-1 sm:max-w-md"
          />
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant={filtersOpen || activeFilterCount > 0 ? "secondary" : "ghost"}
              onPress={() => setFiltersOpen((open) => !open)}
              aria-expanded={filtersOpen}
              aria-controls="properties-filters"
            >
              <ListFilter className="size-4" />
              Filters
              {activeFilterCount > 0 ? (
                <Chip size="sm" variant="soft" color="accent">
                  {activeFilterCount}
                </Chip>
              ) : null}
            </Button>
            {activeFilterCount > 0 ? (
              <Button variant="ghost" size="sm" onPress={clearFilters}>
                <X className="size-4" />
                Clear
              </Button>
            ) : null}
          </div>
        </div>

        {filtersOpen ? (
          <div
            id="properties-filters"
            className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-surface p-3 sm:flex-row sm:flex-wrap sm:items-center sm:p-4"
          >
            <Select
              aria-label="Filter by status"
              selectedKey={status}
              onSelectionChange={(key) => {
                setFilters({ status: key as typeof status });
              }}
              className="w-full sm:w-44"
            >
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {PropertyStatusFilterOptions.map((option) => (
                    <ListBox.Item key={option.id} id={option.id}>
                      {option.label}
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
            <Select
              aria-label="Filter by change"
              selectedKey={change}
              onSelectionChange={(key) => {
                setFilters({ change: key as typeof change });
              }}
              className="w-full sm:w-48"
            >
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {PropertyChangeFilterOptions.map((option) => (
                    <ListBox.Item key={option.id} id={option.id}>
                      {option.label}
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
            <Select
              aria-label="Sort by"
              selectedKey={orderBy}
              onSelectionChange={(key) => {
                setFilters({ orderBy: key as OrderByType });
              }}
              className="w-full sm:w-44"
            >
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {PropertySortByOptions.map((option) => (
                    <ListBox.Item key={option.id} id={option.id}>
                      {option.label}
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
            <Select
              aria-label="Sort order"
              selectedKey={orderDirection}
              onSelectionChange={(key) => {
                setFilters({ orderDirection: key as OrderDirectionType });
              }}
              className="w-full sm:w-44"
            >
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {OrderDirectionOptions.map((option) => (
                    <ListBox.Item key={option.id} id={option.id}>
                      {option.label}
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
            <Select
              aria-label="Filter by tracked agency"
              selectedKey={trackedAgencyId}
              onSelectionChange={(key) => {
                setFilters({ trackedAgencyId: key as string | "all" });
              }}
              className="w-full sm:w-56"
            >
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  <ListBox.Item key="all" id="all">
                    All tracked agencies
                  </ListBox.Item>
                  {trackedAgencies.map((agency) => (
                    <ListBox.Item
                      key={agency.user_tracked_agency_id!}
                      id={agency.user_tracked_agency_id!}
                    >
                      {getTrackableAgencyLabel(agency)}
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
            <Select
              aria-label="Filter by duplicate group"
              selectedKey={duplicateGroup}
              onSelectionChange={(key) => {
                setFilters({
                  duplicateGroup: key as PropertiesListBoolFilter,
                });
              }}
              className="w-full sm:w-44"
            >
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {PropertyDuplicateGroupFilterOptions.map((option) => (
                    <ListBox.Item key={option.id} id={option.id}>
                      {option.label}
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
            <Select
              aria-label="Filter by CRM push"
              selectedKey={pushedToCrm}
              onSelectionChange={(key) => {
                setFilters({
                  pushedToCrm: key as PropertiesListBoolFilter,
                });
              }}
              className="w-full sm:w-44"
            >
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {PropertyCrmPushFilterOptions.map((option) => (
                    <ListBox.Item key={option.id} id={option.id}>
                      {option.label}
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
            <Select
              aria-label="Filter by pending CRM update"
              selectedKey={pendingCrmUpdate}
              onSelectionChange={(key) => {
                setFilters({
                  pendingCrmUpdate: key as PropertiesListBoolFilter,
                });
              }}
              className="w-full sm:w-48"
            >
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {PropertyPendingCrmUpdateFilterOptions.map((option) => (
                    <ListBox.Item key={option.id} id={option.id}>
                      {option.label}
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
            <DatePickerField
              aria-label="From date"
              value={dateFrom}
              onChange={(next) => {
                setFilters({ dateFrom: next });
              }}
              className="w-full sm:w-52"
            />
            <DatePickerField
              aria-label="To date"
              value={dateTo}
              onChange={(next) => {
                setFilters({ dateTo: next });
              }}
              className="w-full sm:w-52"
            />
            <Select
              aria-label="Rows per page"
              selectedKey={
                TablePageSizeOptions.find((option) => option.value === limit)?.id ??
                String(limit)
              }
              onSelectionChange={(key) => {
                const option = TablePageSizeOptions.find(
                  (item) => item.id === String(key),
                );
                setFilters({ limit: option?.value ?? 20 });
              }}
              className="w-full sm:w-44"
            >
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {TablePageSizeOptions.map((option) => (
                    <ListBox.Item key={option.id} id={option.id}>
                      {option.label}
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
            <div className="flex min-w-0 flex-wrap items-center gap-2 sm:w-auto">
              <span className="text-sm text-muted">First</span>
              <Input
                type="number"
                min={1}
                max={Math.max(1, properties.length)}
                aria-label="Number of properties from start of page"
                className="w-20"
                value={String(selectCount)}
                onChange={(e) => {
                  const parsed = Number.parseInt(e.target.value, 10);
                  setSelectCount(
                    Number.isFinite(parsed) && parsed >= 1 ? parsed : 1,
                  );
                }}
              />
              <span className="text-sm text-muted">on page</span>
              <Button
                size="sm"
                variant="secondary"
                onPress={() => applyFirstNSelection(true)}
                isDisabled={properties.length === 0}
              >
                Select
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onPress={() => applyFirstNSelection(false)}
                isDisabled={properties.length === 0}
              >
                Deselect
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {view === "map" ? (
        <PropertyClusterMap
          markers={mapData?.data ?? []}
          isLoading={isMapPending}
          getDetailHref={(id) => Routes.dashboard.properties.detail(id)}
        />
      ) : isPending ? (
        <TableSkeleton rows={8} columns={10} />
      ) : properties.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-muted sm:p-10">
          No properties yet. Track an agency to start receiving listings.
        </div>
      ) : (
        <>
          {isMobile ? (
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex items-center gap-2 px-1">
              <Checkbox
                aria-label="Select all properties on this page"
                isSelected={allPageSelected}
                isIndeterminate={somePageSelected}
                onChange={toggleSelectAllOnPage}
              >
                <Checkbox.Content>
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                </Checkbox.Content>
              </Checkbox>
              <span className="text-sm text-muted">Select all on page</span>
            </div>
            {properties.map((property) => {
              const rowActions = buildPropertyRowActions({
                canManageBulk,
                canDelete,
                hasIntegration: Boolean(property.integration_property_id),
                pushPending:
                  pushToCrm.isPending && pushToCrm.variables === property.id,
                producePending: produceContent.isPending,
                renormalizePending: renormalize.isPending,
                updateSalesPricesPending: updateSalesPrices.isPending,
                syncCrmClientNotesPending: syncCrmClientNotes.isPending,
                deleteCmsImagesPending: bulkDeleteCmsImages.isPending,
                migrateCmsImagesPending: bulkMigrateCmsImages.isPending,
                removeWatermarksPending: removeWatermarks.isPending,
              });

              return (
                <PropertyListCard
                  key={property.id}
                  id={property.id}
                  title={property.title}
                  sourceUrl={property.source_url}
                  agencyName={property.source_agency?.name ?? filteredAgencyName}
                  price={property.price}
                  currency={property.currency}
                  status={property.status}
                  pendingCrmUpdate={property.pending_crm_update}
                  integrationPropertyId={property.integration_property_id}
                  duplicateGroupId={property.duplicate_group_id}
                  isSelected={selectedIds.has(property.id)}
                  onSelectionChange={(selected) =>
                    togglePropertySelection(property.id, selected)
                  }
                  detailLinkState={detailLinkState}
                  rowActions={rowActions}
                  onAction={(actionId) => {
                    if (actionId === "push-to-crm") {
                      pushToCrm.mutate(property.id);
                      return;
                    }
                    if (actionId === "produce-content") {
                      openProduceContent([property.id]);
                      return;
                    }
                    if (actionId === "renormalize") {
                      openRenormalize([property.id]);
                      return;
                    }
                    if (actionId === "manage-estateweb-sites") {
                      openManageSites([property.id]);
                      return;
                    }
                    if (actionId === "update-sales-prices") {
                      openUpdateSalesPrices([property.id]);
                      return;
                    }
                    if (actionId === "sync-crm-client-notes") {
                      openSyncCrmClientNotes([property.id]);
                      return;
                    }
                    if (actionId === "delete-cms-images") {
                      openDeleteCmsImages([property.id]);
                      return;
                    }
                    if (actionId === "migrate-cms-images") {
                      openMigrateCmsImages([property.id]);
                      return;
                    }
                    if (actionId === "remove-watermarks") {
                      openRemoveWatermarks([property.id]);
                      return;
                    }
                    if (actionId !== "delete") return;
                    setDeletePropertyId(property.id);
                    deleteConfirm.open();
                  }}
                  isPushPending={
                    pushToCrm.isPending && pushToCrm.variables === property.id
                  }
                  onPushToCrm={() => pushToCrm.mutate(property.id)}
                />
              );
            })}
          </div>
          ) : (
          <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-surface">
            <Table>
              <Table.ScrollContainer>
                <Table.Content
                  aria-label="My properties"
                  selectionMode="multiple"
                  selectedKeys={selectedKeys}
                  onSelectionChange={setSelectedKeys}
                >
                  <Table.Header>
                    <Table.Column className="pr-0">
                      <Checkbox aria-label="Select all properties on this page" slot="selection">
                        <Checkbox.Content>
                          <Checkbox.Control>
                            <Checkbox.Indicator />
                          </Checkbox.Control>
                        </Checkbox.Content>
                      </Checkbox>
                    </Table.Column>
                    <Table.Column isRowHeader>Title</Table.Column>
                    <Table.Column isRowHeader>Property ID</Table.Column>
                    <Table.Column isRowHeader>Agency</Table.Column>
                    <Table.Column isRowHeader>Web price</Table.Column>
                    <Table.Column isRowHeader>First price</Table.Column>
                    <Table.Column isRowHeader>Status</Table.Column>
                    <Table.Column isRowHeader>CRM</Table.Column>
                    <Table.Column isRowHeader>Created</Table.Column>
                    <Table.Column isRowHeader>Updated</Table.Column>
                    <Table.Column isRowHeader>Actions</Table.Column>
                  </Table.Header>
                  <Table.Body>
                    {properties.map((property) => {
                      const isRemoved = property.status === PropertyStatuses.REMOVED;
                      const groupCellClass = cn(
                        property.duplicate_group_id
                          ? getDuplicateGroupRowClasses(property.duplicate_group_id)
                          : undefined,
                        isRemoved && "opacity-60",
                      );
                      const rowActions = buildPropertyRowActions({
                        canManageBulk,
                        canDelete,
                        hasIntegration: Boolean(property.integration_property_id),
                        pushPending:
                          pushToCrm.isPending &&
                          pushToCrm.variables === property.id,
                        producePending: produceContent.isPending,
                        renormalizePending: renormalize.isPending,
                        updateSalesPricesPending: updateSalesPrices.isPending,
                        syncCrmClientNotesPending: syncCrmClientNotes.isPending,
                        deleteCmsImagesPending: bulkDeleteCmsImages.isPending,
                        migrateCmsImagesPending: bulkMigrateCmsImages.isPending,
                        removeWatermarksPending: removeWatermarks.isPending,
                      });

                      return (
                      <Table.Row
                        key={property.id}
                        id={property.id}
                      >
                        <Table.Cell className={cn("pr-0", groupCellClass)}>
                          <Checkbox
                            aria-label={`Select ${property.title}`}
                            slot="selection"
                            variant="secondary"
                          >
                            <Checkbox.Content>
                              <Checkbox.Control>
                                <Checkbox.Indicator />
                              </Checkbox.Control>
                            </Checkbox.Content>
                          </Checkbox>
                        </Table.Cell>
                        <Table.Cell className={groupCellClass}>
                          <div className="flex min-w-0 flex-col gap-1">
                            <div className="flex min-w-0 items-start gap-2">
                              <Link
                                to={Routes.dashboard.properties.detail(property.id)}
                                state={detailLinkState}
                                className={cn(
                                  "min-w-0 font-medium text-foreground hover:text-accent transition-colors",
                                  isRemoved && "line-through",
                                )}
                              >
                                {property.title}
                              </Link>
                              {property.source_url ? (
                                <a
                                  href={property.source_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="mt-0.5 shrink-0 text-muted hover:text-accent"
                                  aria-label="Open source listing"
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <ExternalLink className="size-4" />
                                </a>
                              ) : null}
                            </div>
                            <div className="flex min-w-0 items-center gap-1">
                              <span className="font-mono text-xs text-muted">
                                {getIdPrefixBeforeDash(property.id)}
                              </span>
                              <CopyIconButton
                                value={property.id}
                                ariaLabel={`Copy internal ID ${property.id}`}
                              />
                            </div>
                          </div>
                        </Table.Cell>
                        <Table.Cell className={groupCellClass}>
                          <PropertyTableIdCell
                            internalId={property.internal_id}
                            integrationPropertyId={property.integration_property_id}
                          />
                        </Table.Cell>
                        <Table.Cell className={groupCellClass}>
                          {property.source_agency?.name ?? filteredAgencyName ?? "—"}
                        </Table.Cell>
                        <Table.Cell className={groupCellClass}>
                          {formatPrice(property.price_web, property.currency)}
                        </Table.Cell>
                        <Table.Cell className={groupCellClass}>
                          {formatPrice(property.price, property.currency)}
                        </Table.Cell>
                        <Table.Cell className={groupCellClass}>
                          <PropertyStatusChip status={property.status} />
                        </Table.Cell>
                        <Table.Cell className={groupCellClass}>
                          {property.pending_crm_update ? (
                            <div className="flex items-center gap-2">
                              <Chip size="sm" variant="soft" color="warning">
                                Pending
                              </Chip>
                              <Button
                                size="sm"
                                variant="secondary"
                                isPending={
                                  pushToCrm.isPending && pushToCrm.variables === property.id
                                }
                                onPress={() => pushToCrm.mutate(property.id)}
                              >
                                Update CRM
                              </Button>
                            </div>
                          ) : property.integration_property_id ? (
                            <Chip size="sm" variant="soft" color="success">
                              Synced
                            </Chip>
                          ) : (
                            "—"
                          )}
                        </Table.Cell>
                        <Table.Cell className={groupCellClass}>
                          {formatDateTime(property.created_at)}
                        </Table.Cell>
                        <Table.Cell className={groupCellClass}>
                          {formatDateTime(property.updated_at)}
                        </Table.Cell>
                        <Table.Cell className={groupCellClass}>
                          <TableRowActionsMenu
                            actions={rowActions}
                            onAction={(actionId) => {
                              if (actionId === "push-to-crm") {
                                pushToCrm.mutate(property.id);
                                return;
                              }
                              if (actionId === "produce-content") {
                                openProduceContent([property.id]);
                                return;
                              }
                              if (actionId === "renormalize") {
                                openRenormalize([property.id]);
                                return;
                              }
                              if (actionId === "manage-estateweb-sites") {
                                openManageSites([property.id]);
                                return;
                              }
                              if (actionId === "update-sales-prices") {
                                openUpdateSalesPrices([property.id]);
                                return;
                              }
                              if (actionId === "sync-crm-client-notes") {
                                openSyncCrmClientNotes([property.id]);
                                return;
                              }
                              if (actionId === "delete-cms-images") {
                                openDeleteCmsImages([property.id]);
                                return;
                              }
                              if (actionId === "migrate-cms-images") {
                                openMigrateCmsImages([property.id]);
                                return;
                              }
                              if (actionId === "remove-watermarks") {
                                openRemoveWatermarks([property.id]);
                                return;
                              }
                              if (actionId !== "delete") return;
                              setDeletePropertyId(property.id);
                              deleteConfirm.open();
                            }}
                            ariaLabel={`Actions for ${property.title}`}
                          />
                        </Table.Cell>
                      </Table.Row>
                      );
                    })}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </Table>
          </div>
          )}
        </>
      )}

      {view === "table" && pagination && pagination.total_pages > 1 && (
        <Pagination className="min-w-0 overflow-x-auto">
          <Pagination.Content>
            <Pagination.Item>
              <Pagination.Previous
                isDisabled={!pagination.has_prev}
                onPress={() => setFilters({ page: Math.max(1, page - 1) })}
              >
                Previous
              </Pagination.Previous>
            </Pagination.Item>
            <Pagination.Item>
              <Pagination.Summary>
                Page {pagination.page} of {pagination.total_pages}
              </Pagination.Summary>
            </Pagination.Item>
            <Pagination.Item>
              <Pagination.Next
                isDisabled={!pagination.has_next}
                onPress={() => setFilters({ page: page + 1 })}
              >
                Next
              </Pagination.Next>
            </Pagination.Item>
          </Pagination.Content>
        </Pagination>
      )}

      {canDelete ? (
        <>
          <ConfirmationDialog
            state={deleteConfirm}
            title="Delete this property?"
            description="This cannot be undone."
            confirmLabel="Delete"
            onConfirm={handleDelete}
            isPending={deleteUserProperty.isPending}
          />
          <ConfirmationDialog
            state={bulkDeleteConfirm}
            title="Delete selected properties?"
            description={`This will permanently delete ${selectedCount} properties. This cannot be undone.`}
            confirmLabel="Delete"
            onConfirm={handleBulkDelete}
            isPending={deleteUserProperties.isPending}
          />
          <ConfirmationDialog
            state={dedupeConfirm}
            title="Keep one property per group?"
            description={`This will delete ${dedupeDeleteCount} duplicate ${dedupeDeleteCount === 1 ? "property" : "properties"} and keep one from each selected group.`}
            confirmLabel="Keep one"
            onConfirm={handleDedupeGroups}
            isPending={dedupeUserPropertyGroups.isPending}
          />
          <ConfirmationDialog
            state={splitConfirm}
            title="Split from duplicate group?"
            description={`This will remove ${selectedGroupedCount} ${selectedGroupedCount === 1 ? "property" : "properties"} from their duplicate groups. Other grouped properties stay linked.`}
            confirmLabel="Split"
            onConfirm={handleSplitFromGroup}
            isPending={splitUserProperties.isPending}
          />
        </>
      ) : null}

      <TruncateDescriptionDialog
        state={truncateConfirm}
        propertyCount={selectedCount}
        onConfirm={handleTruncateDescriptions}
        isPending={truncateDescriptions.isPending}
        storedRules={storedTruncateRules}
      />
      <ManageEstateWebSitesModal
        state={manageSitesModal}
        propertyIds={manageSitesPropertyIds}
      />
      {canManageBulk ? (
        <>
          <EstateWebDuplicatePropertiesModal state={checkCrmDuplicatesModal} />
          <EstateWebOrphanSitesModal state={manageOrphanSitesModal} />
        </>
      ) : null}
      <ConfirmationDialog
        state={updateSalesPricesConfirm}
        title="Update sales prices on CRM?"
        description={
          salesPricesPropertyIds.length === 1
            ? "Recalculates price_start from sales settings (when enabled and no source price_start) and pushes prices to EstateWeb CRM."
            : `Recalculates price_start from sales settings (when enabled and no source price_start) and pushes prices to EstateWeb CRM for ${salesPricesPropertyIds.length} properties.`
        }
        confirmLabel="Update prices"
        onConfirm={handleUpdateSalesPrices}
        isPending={updateSalesPrices.isPending}
      />
      <ConfirmationDialog
        state={syncCrmClientNotesConfirm}
        title="Sync CRM client notes?"
        description={
          crmClientNotesPropertyIds.length === 1
            ? "Fetches the tracked agency CRM client last name and pushes it as the EstateWeb property note in the background. Progress shows in Job queue."
            : `Fetches each tracked agency CRM client last name and pushes it as the EstateWeb property note for ${crmClientNotesPropertyIds.length} properties in the background. Progress shows in Job queue.`
        }
        confirmLabel="Sync notes"
        onConfirm={handleSyncCrmClientNotes}
        isPending={syncCrmClientNotes.isPending}
      />
      <ConfirmationDialog
        state={renormalizeConfirm}
        title="Renormalize properties?"
        description={
          renormalizePropertyIds.length === 1
            ? "Runs AI and code normalization again for this property using direct API calls. Progress shows in Job queue."
            : `Runs AI and code normalization again for ${renormalizePropertyIds.length} properties using direct API calls. Progress shows in Job queue.`
        }
        confirmLabel="Renormalize"
        onConfirm={handleRenormalize}
        isPending={renormalize.isPending}
      />
      <GeocodeMissingCoordinatesModal
        state={geocodeModal}
        countQuery={missingCoordinatesCount}
        geocode={geocodeMissingCoordinates}
      />
      <ResolveEstateWebLocationsModal
        state={resolveEstateWebLocationsModal}
        resolve={resolveEstateWebLocations}
        getDetailRoute={(id) => Routes.dashboard.properties.detail(id)}
      />
      <ConfirmationDialog
        state={deleteCmsImagesConfirm}
        title="Delete CMS images?"
        description={
          deleteCmsImagesPropertyIds.length === 1
            ? "Deletes all stored CMS/integration images for this linked property via its CRM adapter. Local listing images stay. Progress shows in Job queue."
            : `Deletes all stored CMS/integration images for ${deleteCmsImagesPropertyIds.length} linked properties via each CRM adapter. Local listing images stay. Progress shows in Job queue.`
        }
        confirmLabel="Delete CMS images"
        onConfirm={handleDeleteCmsImages}
        isPending={bulkDeleteCmsImages.isPending}
      />
      <MigrateIntegrationImagesModal
        state={migrateCmsImagesModal}
        propertyCount={migrateCmsImagesPropertyIds.length}
        onConfirm={handleMigrateCmsImages}
        isPending={bulkMigrateCmsImages.isPending}
      />
      <RemoveWatermarkByCountModal
        state={removeWatermarkModal}
        propertyCount={removeWatermarkPropertyIds.length}
        onConfirm={async ({ imageCount, replaceCrmImages }) => {
          await removeWatermarks.mutateAsync({
            ids: removeWatermarkPropertyIds,
            image_count: imageCount,
            replace_crm_images: replaceCrmImages,
          });
        }}
        isPending={removeWatermarks.isPending}
      />
      <ProduceContentModal
        state={produceContentModal}
        propertyCount={produceContentPropertyIds.length}
        onConfirm={async ({
          runTranslations,
          runAiTitles,
          useAiBatch,
          regenerate,
          pushToCrm,
        }) => {
          await produceContent.mutateAsync({
            ids: produceContentPropertyIds,
            run_translations: runTranslations,
            run_ai_titles: runAiTitles,
            use_ai_batch: useAiBatch,
            regenerate,
            push_to_crm: pushToCrm,
          });
          clearSelection();
        }}
        isPending={produceContent.isPending}
      />
      <ChangePropertyStatusModal
        state={changeStatusModal}
        propertyCount={changeStatusPropertyIds.length}
        onConfirm={handleChangeStatus}
        isPending={updateStatus.isPending}
      />
    </div>
  );
}
