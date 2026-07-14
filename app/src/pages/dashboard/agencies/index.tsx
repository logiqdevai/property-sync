import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Input,
  Pagination,
  Select,
  ListBox,
  Switch,
  useOverlayState,
} from "@heroui/react";
import { Search } from "lucide-react";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { TableSkeleton } from "@/components/ui/table-skeleton";
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

const aiProviderOptions: { id: AiProvider; label: string }[] = [
  { id: AiProviders.OPENAI, label: "OpenAI" },
  { id: AiProviders.ANTHROPIC, label: "Anthropic" },
  { id: AiProviders.GEMINI, label: "Gemini" },
];

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
  const isPending = trackAgency.isPending || updateTracking.isPending;

  const savePrefs = (payload: TrackAgencyPayload) => {
    if (!agency.is_tracked) return;
    updateTracking.mutate({ agencyId: agency.id, payload });
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
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={prefs.track_new_listings}
              disabled={isPending}
              onChange={(e) => savePrefs({ track_new_listings: e.target.checked })}
            />
            New listings
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={prefs.track_updated_listings}
              disabled={isPending}
              onChange={(e) => savePrefs({ track_updated_listings: e.target.checked })}
            />
            Updated listings
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={prefs.track_removed_listings}
              disabled={isPending}
              onChange={(e) => savePrefs({ track_removed_listings: e.target.checked })}
            />
            Removed listings
          </label>

          <Switch
            isSelected={prefs.use_ai_batching}
            isDisabled={isPending}
            onChange={(isSelected) => savePrefs({ use_ai_batching: isSelected })}
          >
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
            <Switch.Content>Use AI batching (lower cost, slower updates)</Switch.Content>
          </Switch>

          <Select
            selectedKey={prefs.ai_provider}
            isDisabled={isPending}
            onSelectionChange={(key) => savePrefs({ ai_provider: key as AiProvider })}
            className="w-full"
          >
            <Select.Trigger>
              <Select.Value />
            </Select.Trigger>
            <Select.Popover>
              <ListBox items={aiProviderOptions}>
                {(item) => (
                  <ListBox.Item key={item.id} id={item.id} textValue={item.label}>
                    {item.label}
                  </ListBox.Item>
                )}
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

          <p className="text-xs text-muted">
            Batching applies on scheduled crawls when batching is enabled and provider is OpenAI.
            Connect your AI key on{" "}
            <Link to="/integrations" className="text-accent hover:underline">
              Integrations
            </Link>{" "}
            before tracking.
          </p>
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
