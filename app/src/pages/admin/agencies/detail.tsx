import { useNavigate, useParams } from "react-router-dom";
import { Chip, Modal, Switch, EmptyState, useOverlayState } from "@heroui/react";
import { ArrowLeft, Users, Wrench, Activity } from "lucide-react";
import { Routes } from "@/routes/routes";
import { DetailSkeleton } from "@/components/ui/detail-skeleton";
import { DetailErrorState } from "@/components/ui/detail-error-state";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { TrackerAdminOptionsPanel } from "@/components/ui/tracker-admin-options-panel";
import { getCrawlIntervalPresetLabel } from "@/config/constants/dropdowns/agencies/crawl-interval-preset.options";
import { AgencyForm } from "./components/agency-form";
import { AgencyCrawlIntervalPanel } from "./components/agency-crawl-interval-panel";
import {
  useAgency,
  useDeleteAgency,
  useUpdateAgency,
  useUpdateAgencyVisibility,
  useUpdateTrackerAdminSettings,
} from "@/features/agencies/hooks/use-agencies";
import {
  toAgencyBlockHandlingPayload,
  type AgencyFormValues,
} from "@/features/agencies/validation-schemas/agencies.schema";
import { CrawlRunStatusChip } from "./components/crawl-run-status-chip";
import { ScraperStatusChip } from "./components/scraper-status-chip";
import { useCrawlRuns } from "@/features/crawl-runs/hooks/use-crawl-runs";
import { useScrapers } from "@/features/scrapers/hooks/use-scrapers";
import { RoleTypes } from "@/features/user/interfaces/user.interface";
import { useAuthStore } from "@/stores/auth";
import { formatDateTime } from "@/lib/date";
import type { UpdateTrackerAdminSettingsPayload } from "@/features/agencies/interfaces/agencies.interfaces";

export default function AgencyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const editModal = useOverlayState();
  const deleteConfirm = useOverlayState();
  const role = useAuthStore((state) => state.role);
  const canEditTrackerSettings =
    role === RoleTypes.ADMIN || role === RoleTypes.SUPER_ADMIN;

  const { data: agency, isPending, isError, error } = useAgency(id!);
  const { data: crawlRunsData } = useCrawlRuns({ agency_id: id!, limit: 5 });
  const { data: scrapersData } = useScrapers({ source_agency_id: id!, limit: 5 });
  const updateAgency = useUpdateAgency();
  const updateVisibility = useUpdateAgencyVisibility();
  const deleteAgency = useDeleteAgency();
  const updateTrackerAdminSettings = useUpdateTrackerAdminSettings();

  const crawlRuns = crawlRunsData?.data ?? [];
  const scrapers = scrapersData?.data ?? [];

  if (isPending) {
    return <DetailSkeleton fieldCount={6} showSubTable />;
  }

  if (isError || !agency) {
    return (
      <DetailErrorState
        title="Agency not found"
        description={
          error instanceof Error
            ? error.message
            : "This agency could not be found."
        }
        backHref={Routes.admin.agencies.list}
        backLabel="← Back to agencies"
      />
    );
  }

  const trackedUsers = agency.user_tracked_agencies ?? [];

  const dependentCount = (agency._count?.scrapers ?? 0) + (agency._count?.crawl_runs ?? 0);
  const canDelete = dependentCount === 0;

  const saveTrackerSettings = (userId: string, payload: UpdateTrackerAdminSettingsPayload) => {
    updateTrackerAdminSettings.mutate({ agencyId: agency.id, userId, payload });
  };

  return (
    <div className="flex flex-col gap-6">
      <button
        onClick={() => navigate(Routes.admin.agencies.list)}
        className="flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to agencies
      </button>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-2xl font-semibold tracking-tight text-foreground">{agency.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <ActionButtonWithPending variant="secondary" onPress={editModal.open}>
            Edit
          </ActionButtonWithPending>
          <div className="flex flex-col items-end gap-1">
            <ActionButtonWithPending
              variant="danger"
              isDisabled={!canDelete}
              onPress={deleteConfirm.open}
            >
              Delete
            </ActionButtonWithPending>
            {!canDelete && (
              <span className="text-xs text-muted">
                Has {dependentCount} dependent record{dependentCount === 1 ? "" : "s"} — remove them before deleting
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 rounded-xl border border-border bg-surface p-6">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Website</span>
          <a
            href={agency.base_url}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-accent hover:underline truncate"
          >
            {agency.base_url}
          </a>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Location</span>
          <span className="text-sm text-foreground">
            {[agency.city, agency.country].filter(Boolean).join(", ") || "—"}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Last success</span>
          <span className="text-sm text-foreground">{formatDateTime(agency.last_success_at)}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Last failure</span>
          <span className="text-sm text-foreground">{formatDateTime(agency.last_failure_at)}</span>
          {agency.last_error_message && (
            <span className="text-xs text-danger">{agency.last_error_message}</span>
          )}
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Crawl interval</span>
          <span className="text-sm text-foreground">
            {getCrawlIntervalPresetLabel(agency.crawl_interval)}
          </span>
          <span className="font-mono text-xs text-muted">{agency.crawl_interval}</span>
        </div>
        {agency.notes && (
          <div className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">Notes</span>
            <span className="text-sm text-foreground">{agency.notes}</span>
          </div>
        )}

        <div className="flex items-center gap-6 sm:col-span-2 pt-2 border-t border-border">
          <Switch
            isSelected={agency.is_visible}
            onChange={(isSelected) =>
              updateVisibility.mutate({
                id: agency.id,
                payload: { is_visible: isSelected, is_enabled: agency.is_enabled },
              })
            }
          >
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
            <Switch.Content>Visible</Switch.Content>
          </Switch>

          <Switch
            isSelected={agency.is_enabled}
            onChange={(isSelected) =>
              updateVisibility.mutate({
                id: agency.id,
                payload: { is_visible: agency.is_visible, is_enabled: isSelected },
              })
            }
          >
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
            <Switch.Content>Trackable by users</Switch.Content>
          </Switch>

          <Switch
            isSelected={agency.use_ai_batching}
            isDisabled={updateAgency.isPending}
            onChange={(isSelected) =>
              updateAgency.mutate({
                id: agency.id,
                payload: { use_ai_batching: isSelected },
              })
            }
          >
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
            <Switch.Content>Use AI batching</Switch.Content>
          </Switch>
        </div>
      </div>

      <AgencyCrawlIntervalPanel
        crawlInterval={agency.crawl_interval}
        isPending={updateAgency.isPending}
        onSave={(crawl_interval) =>
          updateAgency.mutate({ id: agency.id, payload: { crawl_interval } })
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface p-6">
          <p className="mb-3 text-sm font-medium text-foreground">Tracked users</p>
          {trackedUsers.length === 0 ? (
            <EmptyState>
              <Users className="h-6 w-6 text-muted" />
              <p className="text-sm text-muted mt-2">No users track this agency yet</p>
            </EmptyState>
          ) : (
            <div className="flex flex-col gap-2">
              {trackedUsers.map((tracker) => (
                <div
                  key={tracker.id}
                  className="flex flex-col gap-2 rounded-lg border border-border p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <button
                      onClick={() => navigate(Routes.admin.users.detail(tracker.user.id))}
                      className="text-sm text-accent hover:underline truncate text-left"
                    >
                      {tracker.user.email}
                    </button>
                    <Chip size="sm" variant="soft" color={tracker.enabled ? "success" : "default"}>
                      {tracker.enabled ? "Enabled" : "Disabled"}
                    </Chip>
                  </div>
                  {canEditTrackerSettings ? (
                    <TrackerAdminOptionsPanel
                      accordionId={`${tracker.id}-admin-options`}
                      values={{
                        concurrent_insertions: tracker.concurrent_insertions,
                        insertion_interval_seconds: tracker.insertion_interval_seconds,
                        max_properties: tracker.max_properties ?? null,
                        text_truncate_pieces: tracker.text_truncate_pieces ?? [],
                      }}
                      disabled={updateTrackerAdminSettings.isPending}
                      onAdminSettingsChange={(payload) =>
                        saveTrackerSettings(tracker.user_id, payload)
                      }
                    />
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-xl border border-border bg-surface p-6">
          <p className="mb-3 text-sm font-medium text-foreground">Scrapers</p>
          {scrapers.length === 0 ? (
            <EmptyState>
              <Wrench className="h-6 w-6 text-muted" />
              <p className="text-sm text-muted mt-2">No scrapers for this agency</p>
            </EmptyState>
          ) : (
            <div className="flex flex-col gap-2">
              {scrapers.map((scraper) => (
                <button
                  key={scraper.id}
                  onClick={() => navigate(Routes.admin.scrapers.detail(scraper.id))}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-left hover:border-accent/50 transition-colors"
                >
                  <span className="text-xs text-muted truncate">{scraper.name}</span>
                  <ScraperStatusChip status={scraper.status} />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-xl border border-border bg-surface p-6">
          <p className="mb-3 text-sm font-medium text-foreground">Recent crawl runs</p>
          {crawlRuns.length === 0 ? (
            <EmptyState>
              <Activity className="h-6 w-6 text-muted" />
              <p className="text-sm text-muted mt-2">No crawl runs yet for this agency</p>
            </EmptyState>
          ) : (
            <div className="flex flex-col gap-2">
              {crawlRuns.map((run) => (
                <button
                  key={run.id}
                  onClick={() => navigate(Routes.admin.crawlRuns.detail(run.id))}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-left hover:border-accent/50 transition-colors"
                >
                  <span className="text-xs text-muted truncate">
                    {run.scraper?.name ?? formatDateTime(run.created_at)}
                  </span>
                  <CrawlRunStatusChip status={run.status} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal state={editModal}>
        <Modal.Backdrop isDismissable={!updateAgency.isPending}>
          <Modal.Container size="lg">
            <Modal.Dialog>
              <Modal.Header>
                <Modal.Heading>Edit agency</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="max-h-[70vh] overflow-y-auto">
                <AgencyForm
                  submitLabel="Save"
                  isPending={updateAgency.isPending}
                  onCancel={editModal.close}
                  defaultValues={{
                    name: agency.name,
                    base_url: agency.base_url,
                    country: agency.country ?? "",
                    city: agency.city ?? "",
                    notes: agency.notes ?? "",
                    content_language:
                      (agency.content_language as AgencyFormValues["content_language"]) ??
                      "EL",
                    crawl_interval: agency.crawl_interval,
                    block_handling_wait_timeout_ms:
                      agency.block_handling_wait_timeout_ms ?? undefined,
                    block_handling_min_ready_body_length:
                      agency.block_handling_min_ready_body_length ?? undefined,
                    block_rules: agency.block_rules ?? [],
                  }}
                  onSubmit={(values) => {
                    updateAgency.mutate(
                      {
                        id: agency.id,
                        payload: {
                          name: values.name,
                          base_url: values.base_url,
                          country: values.country,
                          city: values.city,
                          notes: values.notes,
                          content_language: values.content_language,
                          crawl_interval: values.crawl_interval,
                          ...toAgencyBlockHandlingPayload(values),
                        },
                      },
                      { onSuccess: () => editModal.close() },
                    );
                  }}
                />
              </Modal.Body>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <ConfirmationDialog
        state={deleteConfirm}
        title="Delete this agency?"
        description="This cannot be undone."
        confirmLabel="Delete"
        isPending={deleteAgency.isPending}
        onConfirm={() =>
          deleteAgency.mutate(agency.id, {
            onSuccess: () => navigate(Routes.admin.agencies.list),
          })
        }
      />
    </div>
  );
}
