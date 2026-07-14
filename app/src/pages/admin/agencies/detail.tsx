import { useNavigate, useParams } from "react-router-dom";
import { Modal, Switch, EmptyState, useOverlayState } from "@heroui/react";
import { ArrowLeft, Users, Wrench, Activity } from "lucide-react";
import { Routes } from "@/routes/routes";
import { DetailSkeleton } from "@/components/ui/detail-skeleton";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { AgencyForm } from "./components/agency-form";
import { AgencyStatusChip } from "./components/agency-status-chip";
import {
  useAgency,
  useDeleteAgency,
  useUpdateAgency,
  useUpdateAgencyVisibility,
} from "@/features/agencies/hooks/use-agencies";
import { CrawlRunStatusChip } from "./components/crawl-run-status-chip";
import { useCrawlRuns } from "@/features/crawl-runs/hooks/use-crawl-runs";
import { formatDateTime } from "@/lib/date";

export default function AgencyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const editModal = useOverlayState();
  const deleteConfirm = useOverlayState();

  const { data: agency, isPending } = useAgency(id!);
  const { data: crawlRunsData } = useCrawlRuns({ agency_id: id!, limit: 5 });
  const updateAgency = useUpdateAgency();
  const updateVisibility = useUpdateAgencyVisibility();
  const deleteAgency = useDeleteAgency();

  const crawlRuns = crawlRunsData?.data ?? [];

  if (isPending || !agency) {
    return <DetailSkeleton fieldCount={6} showSubTable />;
  }

  const dependentCount = (agency._count?.scrapers ?? 0) + (agency._count?.crawl_runs ?? 0);
  const canDelete = dependentCount === 0;

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
          <AgencyStatusChip status={agency.status} />
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
                Has {dependentCount} dependent record{dependentCount === 1 ? "" : "s"} — archive instead
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
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface p-6">
          <p className="mb-3 text-sm font-medium text-foreground">Tracked users</p>
          <EmptyState>
            <Users className="h-6 w-6 text-muted" />
            <p className="text-sm text-muted mt-2">Coming in a later phase</p>
          </EmptyState>
        </div>
        <div className="rounded-xl border border-border bg-surface p-6">
          <p className="mb-3 text-sm font-medium text-foreground">Scrapers</p>
          <EmptyState>
            <Wrench className="h-6 w-6 text-muted" />
            <p className="text-sm text-muted mt-2">Coming in a later phase</p>
          </EmptyState>
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
        <Modal.Backdrop isDismissable>
          <Modal.Container>
            <Modal.Dialog>
              <Modal.Header>
                <Modal.Heading>Edit agency</Modal.Heading>
              </Modal.Header>
              <Modal.Body>
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
                  }}
                  onSubmit={(values) =>
                    updateAgency.mutate(
                      { id: agency.id, payload: values },
                      { onSuccess: () => editModal.close() },
                    )
                  }
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
