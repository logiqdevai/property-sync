import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Accordion,
  Input,
  Label,
  Pagination,
  Select,
  ListBox,
  Switch,
  useOverlayState,
} from "@heroui/react";
import { Search } from "lucide-react";
import { RoleGate } from "@/components/providers/role-gate";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { useUpdateTrackerAdminSettings } from "@/features/agencies/hooks/use-agencies";
import { RoleTypes } from "@/features/user/interfaces/user.interface";
import { useAuthStore } from "@/stores/auth";
import { TrackedAgencyIntegrationLink } from "@/pages/dashboard/components/tracked-agency-integration-link";
import {
  useTrackableAgencies,
  useTrackAgency,
  useUntrackAgency,
  useUpdateAgencyTracking,
} from "@/features/user-tracked-agencies/hooks/use-user-tracked-agencies";
import {
  AiProviders,
  type AiProvider,
  type AgencyListQuery,
  type TrackAgencyPayload,
  type TrackableAgency,
} from "@/features/user-tracked-agencies/interfaces/user-tracked-agencies.interfaces";
import type { UpdateTrackerAdminSettingsPayload } from "@/features/agencies/interfaces/agencies.interfaces";
import { AiProviderFormOptions } from "@/config/constants/dropdowns/ai-provider-form.options";
import { Routes } from "@/routes/routes";

function AgencyCard({
  agency,
  onUntrackRequest,
}: {
  agency: TrackableAgency;
  onUntrackRequest: (agency: TrackableAgency) => void;
}) {
  const trackAgency = useTrackAgency();
  const updateTracking = useUpdateAgencyTracking();
  const updateTrackerAdminSettings = useUpdateTrackerAdminSettings();
  const userId = useAuthStore((state) => state.user_uuid);
  const prefs = agency.tracking_prefs;
  const isPending =
    trackAgency.isPending || updateTracking.isPending || updateTrackerAdminSettings.isPending;

  const savePrefs = (payload: TrackAgencyPayload) => {
    if (!agency.is_tracked) return;
    updateTracking.mutate({ agencyId: agency.id, payload });
  };

  const saveAdminSettings = (payload: UpdateTrackerAdminSettingsPayload) => {
    if (!agency.is_tracked || !userId) return;
    updateTrackerAdminSettings.mutate({ agencyId: agency.id, userId, payload });
  };

  const handleTrackToggle = (next: boolean) => {
    if (!agency.is_enabled) return;
    if (next) {
      trackAgency.mutate({
        agencyId: agency.id,
        payload: {
          ai_provider: AiProviders.OPENAI,
        },
      });
      return;
    }
    onUntrackRequest(agency);
  };

  return (
    <article className="rounded-xl border border-border bg-surface p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-foreground truncate">{agency.name}</h2>
          <p className="text-sm text-muted truncate">
            {[agency.city, agency.country].filter(Boolean).join(", ") || agency.base_url}
          </p>
        </div>
        <Switch
          isSelected={agency.is_tracked}
          isDisabled={!agency.is_enabled || isPending}
          onChange={handleTrackToggle}
        >
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          <Switch.Content>{agency.is_tracked ? "Tracking" : "Track"}</Switch.Content>
        </Switch>
      </div>

      {!agency.is_enabled && (
        <p className="text-sm text-muted">Not available for tracking</p>
      )}

      {agency.is_tracked && prefs && (
        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm text-foreground">New listings</span>
              <span className="text-xs text-muted">Properties newly published by this agency.</span>
            </div>
            <Switch
              isSelected={prefs.track_new_listings}
              isDisabled={isPending}
              onChange={(isSelected) => savePrefs({ track_new_listings: isSelected })}
              aria-label="New listings"
            >
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm text-foreground">Updated listings</span>
              <span className="text-xs text-muted">Changes to price, status, or listing details.</span>
            </div>
            <Switch
              isSelected={prefs.track_updated_listings}
              isDisabled={isPending}
              onChange={(isSelected) => savePrefs({ track_updated_listings: isSelected })}
              aria-label="Updated listings"
            >
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm text-foreground">Removed listings</span>
              <span className="text-xs text-muted">Listings taken off the market or no longer available.</span>
            </div>
            <Switch
              isSelected={prefs.track_removed_listings}
              isDisabled={isPending}
              onChange={(isSelected) => savePrefs({ track_removed_listings: isSelected })}
              aria-label="Removed listings"
            >
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch>
          </div>

          <RoleGate roles={[RoleTypes.ADMIN]}>
            <Accordion defaultExpandedKeys={[]} hideSeparator>
              <Accordion.Item id="admin-options">
                <Accordion.Heading>
                  <Accordion.Trigger className="text-sm font-medium text-foreground">
                    Admin options
                    <Accordion.Indicator />
                  </Accordion.Trigger>
                </Accordion.Heading>
                <Accordion.Panel>
                  <Accordion.Body>
                    <div
                      className="flex flex-col gap-3 pt-1"
                      key={`${agency.id}-admin-${prefs.crawl_interval}-${prefs.concurrent_insertions}-${prefs.insertion_interval_minutes}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="text-sm text-foreground">Use AI batching</span>
                          <span className="text-xs text-muted">
                            Lower cost, slower updates on scheduled crawls.
                          </span>
                        </div>
                        <Switch
                          isSelected={prefs.use_ai_batching}
                          isDisabled={isPending}
                          onChange={(isSelected) => savePrefs({ use_ai_batching: isSelected })}
                          aria-label="Use AI batching"
                        >
                          <Switch.Control>
                            <Switch.Thumb />
                          </Switch.Control>
                        </Switch>
                      </div>

                      <Select
                        selectedKey={prefs.ai_provider}
                        isDisabled={isPending}
                        onSelectionChange={(key) => savePrefs({ ai_provider: key as AiProvider })}
                        className="w-full"
                      >
                        <Label>AI provider</Label>
                        <Select.Trigger>
                          <Select.Value />
                          <Select.Indicator />
                        </Select.Trigger>
                        <Select.Popover>
                          <ListBox>
                            {AiProviderFormOptions.map((option) => (
                              <ListBox.Item key={option.id} id={option.id}>
                                {option.label}
                              </ListBox.Item>
                            ))}
                          </ListBox>
                        </Select.Popover>
                      </Select>

                      <label className="flex flex-col gap-1 text-sm">
                        <span className="text-muted">AI model (optional)</span>
                        <input
                          className="rounded-lg border border-border bg-background px-3 py-2"
                          value={prefs.ai_model ?? ""}
                          disabled={isPending}
                          onChange={(e) => savePrefs({ ai_model: e.target.value || null })}
                        />
                      </label>

                      <label className="flex flex-col gap-1 text-sm">
                        <span className="text-muted">Crawl interval (cron)</span>
                        <input
                          className="rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs"
                          defaultValue={prefs.crawl_interval ?? ""}
                          disabled={isPending}
                          onBlur={(e) => {
                            const value = e.target.value.trim();
                            if (value && value !== prefs.crawl_interval) {
                              saveAdminSettings({ crawl_interval: value });
                            }
                          }}
                        />
                      </label>

                      <label className="flex flex-col gap-1 text-sm">
                        <span className="text-muted">Concurrent insertions</span>
                        <input
                          type="number"
                          min={1}
                          className="rounded-lg border border-border bg-background px-3 py-2"
                          defaultValue={prefs.concurrent_insertions ?? 1}
                          disabled={isPending}
                          onBlur={(e) => {
                            const value = Number.parseInt(e.target.value, 10);
                            if (
                              Number.isFinite(value) &&
                              value >= 1 &&
                              value !== prefs.concurrent_insertions
                            ) {
                              saveAdminSettings({ concurrent_insertions: value });
                            }
                          }}
                        />
                      </label>

                      <label className="flex flex-col gap-1 text-sm">
                        <span className="text-muted">Insertion interval (minutes)</span>
                        <input
                          type="number"
                          min={1}
                          className="rounded-lg border border-border bg-background px-3 py-2"
                          defaultValue={prefs.insertion_interval_minutes ?? 5}
                          disabled={isPending}
                          onBlur={(e) => {
                            const value = Number.parseInt(e.target.value, 10);
                            if (
                              Number.isFinite(value) &&
                              value >= 1 &&
                              value !== prefs.insertion_interval_minutes
                            ) {
                              saveAdminSettings({ insertion_interval_minutes: value });
                            }
                          }}
                        />
                      </label>

                      <p className="text-xs text-muted">
                        Batching applies on scheduled crawls when batching is enabled and provider is
                        OpenAI. Connect your AI key on{" "}
                        <Link
                          to={Routes.dashboard.integrations}
                          className="text-accent hover:underline"
                        >
                          Integrations
                        </Link>{" "}
                        before tracking.
                      </p>
                    </div>
                  </Accordion.Body>
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
          </RoleGate>

          <TrackedAgencyIntegrationLink
            agencyId={agency.id}
            linkedIntegrationId={prefs.user_integration_id}
            disabled={isPending}
          />
        </div>
      )}
    </article>
  );
}

export default function DashboardAgenciesPage() {
  const untrackConfirm = useOverlayState();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pendingUntrack, setPendingUntrack] = useState<TrackableAgency | null>(null);
  const debouncedSearch = useMemo(() => search, [search]);

  const query = useMemo<AgencyListQuery>(
    () => ({
      page,
      limit: 12,
      ...(debouncedSearch.trim() && { search: debouncedSearch.trim() }),
    }),
    [page, debouncedSearch],
  );

  const { data, isPending } = useTrackableAgencies(query);
  const untrackAgency = useUntrackAgency();

  const agencies = data?.data ?? [];
  const pagination = data?.pagination;

  const handleUntrack = async () => {
    if (!pendingUntrack) return;
    await untrackAgency.mutateAsync(pendingUntrack.id);
    setPendingUntrack(null);
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-2xl font-semibold tracking-tight text-foreground">Agencies</p>
        <p className="text-sm text-muted">
          Browse agencies and choose what changes you want to follow.
        </p>
      </div>

      <div className="relative max-w-sm w-full">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
          placeholder="Search agencies…"
          className="pl-9"
        />
      </div>

      {isPending ? (
        <TableSkeleton rows={6} columns={1} />
      ) : agencies.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-10 text-center text-sm text-muted">
          No agencies found.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {agencies.map((agency) => (
            <AgencyCard
              key={agency.id}
              agency={agency}
              onUntrackRequest={(item) => {
                setPendingUntrack(item);
                untrackConfirm.open();
              }}
            />
          ))}
        </div>
      )}

      {pagination && pagination.total_pages > 1 && (
        <Pagination>
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
    </div>
  );
}
