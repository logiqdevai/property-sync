import type {
  AgencyListQuery,
  TrackAgencyPayload,
  TrackableAgency,
} from "@/features/user-tracked-agencies/interfaces/user-tracked-agencies.interfaces";
import { AppConfig } from "@/config/constants/app-config";
import { RoleTypes } from "@/features/user/interfaces/user.interface";
import { RoleGate } from "@/components/providers/role-gate";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { TrackerAdminOptionsPanel } from "@/components/ui/tracker-admin-options-panel";
import {
  useTrackableAgencies,
  useTrackAgency,
  useUntrackAgency,
  useUpdateAgencyTracking,
} from "@/features/user-tracked-agencies/hooks/use-user-tracked-agencies";
import { TrackedAgencyIntegrationLink } from "@/pages/dashboard/components/tracked-agency-integration-link";
import { useMemo, useState } from "react";
import {
  EmptyState,
  Input,
  Pagination,
  Switch,
  useOverlayState,
} from "@heroui/react";
import { BellOff, ExternalLink, Search } from "lucide-react";

function AgencyCard({
  agency,
  onUntrackRequest,
}: {
  agency: TrackableAgency;
  onUntrackRequest: (agency: TrackableAgency) => void;
}) {
  const trackAgency = useTrackAgency();
  const updateTracking = useUpdateAgencyTracking();
  const prefs = agency.tracking_prefs;
  const isAgencyDisabled = !agency.is_enabled;
  const isPending = trackAgency.isPending || updateTracking.isPending;
  const isControlsDisabled = isAgencyDisabled || isPending;

  const savePrefs = (payload: TrackAgencyPayload) => {
    if (!agency.is_tracked || isAgencyDisabled) return;
    updateTracking.mutate({ agencyId: agency.id, payload });
  };

  const handleTrackToggle = (next: boolean) => {
    if (isAgencyDisabled) return;
    if (next) {
      trackAgency.mutate({
        agencyId: agency.id,
        payload: {},
      });
      return;
    }
    onUntrackRequest(agency);
  };

  return (
    <article className="rounded-xl border border-border bg-surface p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-foreground truncate">{agency.name}</h2>
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="text-sm text-muted truncate">
              {[agency.city, agency.country].filter(Boolean).join(", ") || agency.base_url}
            </p>
            <a
              href={agency.base_url}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-muted hover:text-accent"
              aria-label={`Open ${agency.name} website`}
            >
              <ExternalLink className="size-4" />
            </a>
          </div>
        </div>
        <Switch
          isSelected={agency.is_tracked}
          isDisabled={isControlsDisabled}
          onChange={handleTrackToggle}
        >
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          <Switch.Content>{agency.is_tracked ? "Tracking" : "Track"}</Switch.Content>
        </Switch>
      </div>

      {isAgencyDisabled ? (
        <p className="text-sm text-muted">
          This agency is not currently available for connecting
        </p>
      ) : null}

      {!isAgencyDisabled && !agency.is_tracked ? (
        <div className="border-t border-border pt-4">
          <EmptyState>
            <BellOff className="h-5 w-5 text-muted" />
            <p className="text-sm text-muted mt-2">
              Turn on Track to choose which listing changes you want to follow.
            </p>
          </EmptyState>
        </div>
      ) : null}

      {agency.is_tracked && prefs ? (
        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm text-foreground">New listings</span>
              <span className="text-xs text-muted">Properties newly published by this agency.</span>
            </div>
            <Switch
              isSelected={prefs.track_new_listings}
              isDisabled={isControlsDisabled}
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
              isDisabled={isControlsDisabled}
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
              isDisabled={isControlsDisabled}
              onChange={(isSelected) => savePrefs({ track_removed_listings: isSelected })}
              aria-label="Removed listings"
            >
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm text-foreground">Auto-update CRM</span>
              <span className="text-xs text-muted">
                Push listing changes to your CRM automatically. When off, update from the Properties page.
              </span>
            </div>
            <Switch
              isSelected={prefs.auto_update_to_crm ?? true}
              isDisabled={isControlsDisabled}
              onChange={(isSelected) => savePrefs({ auto_update_to_crm: isSelected })}
              aria-label="Auto-update CRM"
            >
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch>
          </div>

          {AppConfig.tracked_agency_admin_options_visible ? (
            <TrackerAdminOptionsPanel
              accordionId={`${agency.id}-admin-options`}
              values={{
                use_ai_batching: prefs.use_ai_batching,
                concurrent_insertions: prefs.concurrent_insertions ?? 1,
                insertion_interval_minutes: prefs.insertion_interval_minutes ?? 5,
                max_properties: prefs.max_properties ?? null,
                text_truncate_pieces: prefs.text_truncate_pieces ?? [],
              }}
              disabled={isControlsDisabled}
              onPrefsChange={savePrefs}
              onAdminSettingsChange={savePrefs}
            />
          ) : (
            <RoleGate roles={[RoleTypes.ADMIN]}>
              <TrackerAdminOptionsPanel
                accordionId={`${agency.id}-admin-options`}
                values={{
                  use_ai_batching: prefs.use_ai_batching,
                  concurrent_insertions: prefs.concurrent_insertions ?? 1,
                  insertion_interval_minutes: prefs.insertion_interval_minutes ?? 5,
                  max_properties: prefs.max_properties ?? null,
                  text_truncate_pieces: prefs.text_truncate_pieces ?? [],
                }}
                disabled={isControlsDisabled}
                onPrefsChange={savePrefs}
                onAdminSettingsChange={savePrefs}
              />
            </RoleGate>
          )}

          <TrackedAgencyIntegrationLink
            agencyId={agency.id}
            linkedIntegrationId={prefs.user_integration_id}
            disabled={isControlsDisabled}
          />
        </div>
      ) : null}
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
