import {
  BulkAgencyTrackingActions,
  type AgencyListQuery,
  type TrackAgencyPayload,
  type TrackableAgency,
} from "@/features/user-tracked-agencies/interfaces/user-tracked-agencies.interfaces";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { TablePageSizeOptions } from "@/config/constants/dropdowns/shared/table-page-size.options";
import {
  useBulkAgencyTracking,
  useTrackableAgencies,
  useUntrackAgency,
  useUpdateAgencyTracking,
} from "@/features/user-tracked-agencies/hooks/use-user-tracked-agencies";
import {
  AgencyListCard,
  PrefSwitch,
  useAgencyTrackingControls,
} from "./components/agency-list-card";
import { AgencyPublishingSettingsModal } from "./components/agency-publishing-settings-modal";
import {
  AgencyTrackingColumnHeader,
  getAgencyTrackingTogglePayload,
  getAgencyTrackingToggleValue,
  type AgencyTrackingToggleColumnId,
} from "./components/agency-tracking-column-header";
import { WatermarkSettingsModal } from "./components/watermark-settings-modal";
import {
  BulkInsertionSettingsModal,
  type BulkInsertionSettingsPayload,
} from "./components/bulk-insertion-settings-modal";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMemo, useState } from "react";
import {
  Button,
  Dropdown,
  Input,
  Label,
  ListBox,
  Pagination,
  Select,
  Table,
  useOverlayState,
} from "@heroui/react";
import { ChevronDown, ExternalLink, Search, Settings, SlidersHorizontal } from "lucide-react";

function AgencyRow({
  agency,
  rowNumber,
  onUntrackRequest,
  onOpenWatermarkSettings,
  onOpenPublishingSettings,
}: {
  agency: TrackableAgency;
  rowNumber: number;
  onUntrackRequest: (agency: TrackableAgency) => void;
  onOpenWatermarkSettings: (agency: TrackableAgency) => void;
  onOpenPublishingSettings: (agency: TrackableAgency) => void;
}) {
  const {
    prefs,
    location,
    locationTitle,
    isAgencyDisabled,
    isControlsDisabled,
    prefsDisabled,
    savePrefs,
    handleTrackToggle,
  } = useAgencyTrackingControls(agency, onUntrackRequest);

  return (
    <Table.Row id={agency.id}>
      <Table.Cell>
        <span className="tabular-nums text-muted">{rowNumber}</span>
      </Table.Cell>
      <Table.Cell>
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-medium text-foreground">
              {agency.name}
            </span>
            <a
              href={agency.base_url}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-muted hover:text-accent"
              aria-label={`Open ${agency.name} website`}
            >
              <ExternalLink className="size-3.5" />
            </a>
          </div>
          <span
            className="block max-w-xs truncate text-xs text-muted"
            title={locationTitle}
          >
            {location}
          </span>
          {isAgencyDisabled ? (
            <span className="text-xs text-muted">Unavailable</span>
          ) : null}
        </div>
      </Table.Cell>
      <Table.Cell>
        <PrefSwitch
          isSelected={agency.is_tracked}
          isDisabled={isControlsDisabled}
          onChange={handleTrackToggle}
          aria-label={agency.is_tracked ? "Tracking" : "Track"}
        />
      </Table.Cell>
      <Table.Cell>
        <PrefSwitch
          isSelected={prefs?.track_new_listings ?? false}
          isDisabled={prefsDisabled}
          onChange={(isSelected) =>
            savePrefs({ track_new_listings: isSelected })
          }
          aria-label="New listings"
        />
      </Table.Cell>
      <Table.Cell>
        <PrefSwitch
          isSelected={prefs?.track_updated_listings ?? false}
          isDisabled={prefsDisabled}
          onChange={(isSelected) =>
            savePrefs({ track_updated_listings: isSelected })
          }
          aria-label="Updated listings"
        />
      </Table.Cell>
      <Table.Cell>
        <PrefSwitch
          isSelected={prefs?.track_removed_listings ?? false}
          isDisabled={prefsDisabled}
          onChange={(isSelected) =>
            savePrefs({ track_removed_listings: isSelected })
          }
          aria-label="Removed listings"
        />
      </Table.Cell>
      <Table.Cell>
        <PrefSwitch
          isSelected={prefs?.auto_update_to_crm ?? true}
          isDisabled={prefsDisabled}
          onChange={(isSelected) =>
            savePrefs({ auto_update_to_crm: isSelected })
          }
          aria-label="Auto-update CRM"
        />
      </Table.Cell>
      <Table.Cell>
        <PrefSwitch
          isSelected={prefs?.cms_update_on_hash_only ?? false}
          isDisabled={prefsDisabled}
          onChange={(isSelected) =>
            savePrefs({ cms_update_on_hash_only: isSelected })
          }
          aria-label="Push CRM updates only when listing content changes"
        />
      </Table.Cell>
      <Table.Cell>
        <div className="flex items-center gap-1.5">
          <PrefSwitch
            isSelected={prefs?.remove_watermark ?? false}
            isDisabled={prefsDisabled}
            onChange={(isSelected) =>
              savePrefs({
                remove_watermark: isSelected,
                ...(isSelected
                  ? {}
                  : { watermark_manual_selection: false }),
              })
            }
            aria-label="Remove watermark"
          />
          {prefs?.remove_watermark ? (
            <Button
              size="sm"
              variant="secondary"
              isIconOnly
              isDisabled={prefsDisabled}
              aria-label="Watermark settings"
              onPress={() => onOpenWatermarkSettings(agency)}
            >
              <Settings className="size-3.5" />
            </Button>
          ) : null}
        </div>
      </Table.Cell>
      <Table.Cell>
        <Button
          size="sm"
          variant="secondary"
          isDisabled={prefsDisabled}
          onPress={() => onOpenPublishingSettings(agency)}
        >
          Settings
        </Button>
      </Table.Cell>
    </Table.Row>
  );
}

export default function DashboardAgenciesPage() {
  const isMobile = useIsMobile();
  const untrackConfirm = useOverlayState();
  const bulkUntrackConfirm = useOverlayState();
  const watermarkModal = useOverlayState();
  const publishingModal = useOverlayState();
  const bulkInsertionSettingsModal = useOverlayState();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [pendingUntrack, setPendingUntrack] = useState<TrackableAgency | null>(
    null,
  );
  const [pendingBulkUntrackIds, setPendingBulkUntrackIds] = useState<string[]>(
    [],
  );
  const [settingsAgency, setSettingsAgency] = useState<TrackableAgency | null>(
    null,
  );
  const debouncedSearch = useMemo(() => search, [search]);

  const query = useMemo<AgencyListQuery>(
    () => ({
      page: limit === 0 ? 1 : page,
      limit,
      ...(debouncedSearch.trim() && { search: debouncedSearch.trim() }),
    }),
    [page, limit, debouncedSearch],
  );

  const { data, isPending } = useTrackableAgencies(query);
  const untrackAgency = useUntrackAgency();
  const updateTracking = useUpdateAgencyTracking();
  const bulkTracking = useBulkAgencyTracking();

  const allTrackedAgenciesQuery = useTrackableAgencies(
    { page: 1, limit: 0 },
    { enabled: bulkInsertionSettingsModal.isOpen },
  );
  const allTrackedAgencyIds = (allTrackedAgenciesQuery.data?.data ?? [])
    .filter((agency) => agency.is_tracked && agency.is_enabled)
    .map((agency) => agency.id);

  const agencies = data?.data ?? [];
  const pagination = data?.pagination;

  const activeSettingsAgency =
    agencies.find((agency) => agency.id === settingsAgency?.id) ??
    settingsAgency;

  const handleUntrack = async () => {
    if (!pendingUntrack) return;
    await untrackAgency.mutateAsync(pendingUntrack.id);
    setPendingUntrack(null);
  };

  const handleBulkUntrack = async () => {
    if (pendingBulkUntrackIds.length === 0) return;
    await bulkTracking.mutateAsync({
      agency_ids: pendingBulkUntrackIds,
      action: BulkAgencyTrackingActions.UNTRACK,
    });
    setPendingBulkUntrackIds([]);
  };

  const enabledAgencies = agencies.filter((agency) => agency.is_enabled);
  const trackedAgencies = enabledAgencies.filter((agency) => agency.is_tracked);
  const isColumnTogglePending = bulkTracking.isPending;

  const getColumnToggle = (columnId: AgencyTrackingToggleColumnId) => {
    const eligible =
      columnId === "track" ? enabledAgencies : trackedAgencies;
    const isSelected =
      eligible.length > 0 &&
      eligible.every((agency) =>
        getAgencyTrackingToggleValue(agency, columnId),
      );

    return {
      isSelected,
      isDisabled: eligible.length === 0 || isColumnTogglePending,
      onChange: (next: boolean) => {
        if (columnId === "track") {
          const agencyIds = enabledAgencies
            .filter((agency) => agency.is_tracked !== next)
            .map((agency) => agency.id);
          if (agencyIds.length === 0) return;
          if (!next) {
            setPendingBulkUntrackIds(agencyIds);
            bulkUntrackConfirm.open();
            return;
          }
          bulkTracking.mutate({
            agency_ids: agencyIds,
            action: BulkAgencyTrackingActions.TRACK,
          });
          return;
        }

        const agencyIds = trackedAgencies
          .filter(
            (agency) =>
              getAgencyTrackingToggleValue(agency, columnId) !== next,
          )
          .map((agency) => agency.id);
        if (agencyIds.length === 0) return;
        bulkTracking.mutate({
          agency_ids: agencyIds,
          action: BulkAgencyTrackingActions.UPDATE,
          ...getAgencyTrackingTogglePayload(columnId, next),
        });
      },
    };
  };

  const saveSettingsPrefs = (payload: TrackAgencyPayload) => {
    if (!activeSettingsAgency?.is_tracked || !activeSettingsAgency.is_enabled) {
      return;
    }
    updateTracking.mutate({
      agencyId: activeSettingsAgency.id,
      payload,
    });
  };

  const handleBulkInsertionSettingsSave = async (
    payload: BulkInsertionSettingsPayload,
  ) => {
    if (allTrackedAgencyIds.length === 0) return;
    await bulkTracking.mutateAsync({
      agency_ids: allTrackedAgencyIds,
      action: BulkAgencyTrackingActions.UPDATE,
      concurrent_insertions: payload.concurrent_insertions,
      insertion_interval_seconds: payload.insertion_interval_seconds,
    });
  };

  const openWatermarkSettings = (item: TrackableAgency) => {
    setSettingsAgency(item);
    watermarkModal.open();
  };

  const openPublishingSettings = (item: TrackableAgency) => {
    setSettingsAgency(item);
    publishingModal.open();
  };

  const requestUntrack = (item: TrackableAgency) => {
    setPendingUntrack(item);
    untrackConfirm.open();
  };

  return (
    <div className="flex w-full min-w-0 max-w-full flex-col gap-6">
      <div className="min-w-0">
        <p className="text-2xl font-semibold tracking-tight text-foreground">
          Agencies
        </p>
        <p className="text-sm text-muted">
          Browse agencies and choose what changes you want to follow.
        </p>
      </div>

      <div className="flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full min-w-0 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            placeholder="Search agencies…"
            className="pl-9"
            fullWidth
          />
        </div>
        <Select
          aria-label="Rows per page"
          selectedKey={
            TablePageSizeOptions.find((option) => option.value === limit)?.id ??
            String(limit)
          }
          onSelectionChange={(key) => {
            setPage(1);
            const option = TablePageSizeOptions.find(
              (item) => item.id === String(key),
            );
            setLimit(option?.value ?? 20);
          }}
          className="w-full shrink-0 sm:w-44"
        >
          <Select.Trigger className="w-full">
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
        <Dropdown>
          <Button variant="secondary" className="shrink-0">
            Actions
            <ChevronDown className="size-3.5" />
          </Button>
          <Dropdown.Popover>
            <Dropdown.Menu
              onAction={(key) => {
                if (key === "bulk-insertion-settings") {
                  bulkInsertionSettingsModal.open();
                }
              }}
            >
              <Dropdown.Item
                id="bulk-insertion-settings"
                textValue="Bulk insertion settings"
              >
                <div className="flex w-full items-center gap-2">
                  <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-muted" />
                  <Label>Bulk insertion settings</Label>
                </div>
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      </div>

      {isPending ? (
        <TableSkeleton
          rows={isMobile ? 6 : 8}
          columns={isMobile ? 4 : 10}
        />
      ) : null}

      {!isPending && agencies.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-muted sm:p-10">
          No agencies found.
        </div>
      ) : null}

      {!isPending && agencies.length > 0 ? (
        isMobile ? (
          <div className="flex min-w-0 flex-col gap-3">
            {agencies.map((agency, index) => (
              <AgencyListCard
                key={agency.id}
                agency={agency}
                rowNumber={limit === 0 ? index + 1 : (page - 1) * limit + index + 1}
                onUntrackRequest={requestUntrack}
                onOpenWatermarkSettings={openWatermarkSettings}
                onOpenPublishingSettings={openPublishingSettings}
              />
            ))}
          </div>
        ) : (
          <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-surface">
            <Table>
              <Table.ScrollContainer>
                <Table.Content aria-label="Agencies">
                  <Table.Header>
                    <Table.Column>#</Table.Column>
                    <Table.Column isRowHeader>
                      <AgencyTrackingColumnHeader columnId="agency" />
                    </Table.Column>
                    <Table.Column>
                      <AgencyTrackingColumnHeader
                        columnId="track"
                        toggle={getColumnToggle("track")}
                      />
                    </Table.Column>
                    <Table.Column>
                      <AgencyTrackingColumnHeader
                        columnId="new"
                        toggle={getColumnToggle("new")}
                      />
                    </Table.Column>
                    <Table.Column>
                      <AgencyTrackingColumnHeader
                        columnId="updated"
                        toggle={getColumnToggle("updated")}
                      />
                    </Table.Column>
                    <Table.Column>
                      <AgencyTrackingColumnHeader
                        columnId="removed"
                        toggle={getColumnToggle("removed")}
                      />
                    </Table.Column>
                    <Table.Column>
                      <AgencyTrackingColumnHeader
                        columnId="auto_crm"
                        toggle={getColumnToggle("auto_crm")}
                      />
                    </Table.Column>
                    <Table.Column>
                      <AgencyTrackingColumnHeader
                        columnId="content_changes_only"
                        toggle={getColumnToggle("content_changes_only")}
                      />
                    </Table.Column>
                    <Table.Column>
                      <AgencyTrackingColumnHeader columnId="watermark" />
                    </Table.Column>
                    <Table.Column>
                      <AgencyTrackingColumnHeader columnId="publishing" />
                    </Table.Column>
                  </Table.Header>
                  <Table.Body>
                    {agencies.map((agency, index) => (
                      <AgencyRow
                        key={agency.id}
                        agency={agency}
                        rowNumber={
                          limit === 0 ? index + 1 : (page - 1) * limit + index + 1
                        }
                        onUntrackRequest={requestUntrack}
                        onOpenWatermarkSettings={openWatermarkSettings}
                        onOpenPublishingSettings={openPublishingSettings}
                      />
                    ))}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </Table>
          </div>
        )
      ) : null}

      {pagination && pagination.total_pages > 1 && (
        <Pagination className="min-w-0 overflow-x-auto">
          <Pagination.Content>
            <Pagination.Item>
              <Pagination.Previous
                isDisabled={!pagination.has_prev}
                onPress={() => setPage((p) => Math.max(1, p - 1))}
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
                onPress={() => setPage((p) => p + 1)}
              >
                Next
              </Pagination.Next>
            </Pagination.Item>
          </Pagination.Content>
        </Pagination>
      )}

      <ConfirmationDialog
        state={untrackConfirm}
        title="Stop tracking this agency?"
        description="You will no longer receive property updates from this agency."
        confirmLabel="Untrack"
        onConfirm={handleUntrack}
        isPending={untrackAgency.isPending}
      />

      <ConfirmationDialog
        state={bulkUntrackConfirm}
        title="Stop tracking these agencies?"
        description={`You will no longer receive property updates from ${pendingBulkUntrackIds.length} ${pendingBulkUntrackIds.length === 1 ? "agency" : "agencies"}.`}
        confirmLabel="Untrack"
        onConfirm={handleBulkUntrack}
        isPending={bulkTracking.isPending}
      />

      {activeSettingsAgency?.tracking_prefs ? (
        <WatermarkSettingsModal
          state={watermarkModal}
          agencyId={activeSettingsAgency.id}
          agencyName={activeSettingsAgency.name}
          disabled={
            !activeSettingsAgency.is_enabled || updateTracking.isPending
          }
          watermarkManualSelection={
            activeSettingsAgency.tracking_prefs.watermark_manual_selection ??
            false
          }
          watermarkImageCount={
            activeSettingsAgency.tracking_prefs.watermark_image_count ?? 1
          }
          onSave={saveSettingsPrefs}
        />
      ) : null}

      <AgencyPublishingSettingsModal
        state={publishingModal}
        agency={
          activeSettingsAgency?.is_tracked ? activeSettingsAgency : null
        }
        prefs={activeSettingsAgency?.tracking_prefs}
        disabled={
          !activeSettingsAgency?.is_enabled || updateTracking.isPending
        }
        onAdminSettingsChange={saveSettingsPrefs}
      />

      <BulkInsertionSettingsModal
        state={bulkInsertionSettingsModal}
        agencyCount={allTrackedAgencyIds.length}
        isLoadingCount={allTrackedAgenciesQuery.isPending}
        isPending={bulkTracking.isPending}
        onConfirm={handleBulkInsertionSettingsSave}
      />
    </div>
  );
}
