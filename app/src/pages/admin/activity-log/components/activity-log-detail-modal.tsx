import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button, Modal, useOverlayState } from "@heroui/react";
import { ChangesTable } from "@/components/ui/changes-table";
import { CopyIconButton } from "@/components/ui/copy-icon-button";
import { useActivityLog } from "@/features/activity-logs/hooks/use-activity-logs";
import { formatDateTime } from "@/lib/date";
import { Routes } from "@/routes/routes";
import {
  ActivityOperationChip,
  ActivityOutcomeChip,
  ImpersonatedChip,
} from "./activity-badges";

export type ActivityLogDetailModalState = ReturnType<typeof useOverlayState>;

interface ActivityLogDetailModalProps {
  state: ActivityLogDetailModalState;
  logId: string | null;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <div className="text-sm text-foreground break-words">{children}</div>
    </div>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  if (typeof value === "object" && Object.keys(value as object).length === 0) return null;

  return (
    <details className="group rounded-lg border border-border">
      <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-muted hover:text-foreground">
        {label}
      </summary>
      <pre className="max-h-72 overflow-auto border-t border-border bg-surface-secondary p-3 text-xs text-muted whitespace-pre-wrap break-words font-mono leading-relaxed">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

export function ActivityLogDetailModal({ state, logId }: ActivityLogDetailModalProps) {
  const { data: log, isPending, isError } = useActivityLog(state.isOpen ? logId : null);

  return (
    <Modal state={state}>
      <Modal.Backdrop isDismissable>
        <Modal.Container>
          <Modal.Dialog className="max-w-4xl">
            <Modal.Header>
              <Modal.Heading>
                <span className="font-mono text-base">{log?.action ?? "Activity"}</span>
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <div className="flex max-h-[70vh] flex-col gap-5 overflow-y-auto pr-1">
                {isPending && <p className="text-sm text-muted">Loading…</p>}
                {isError && <p className="text-sm text-danger">Could not load this activity entry.</p>}

                {log && (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <ActivityOutcomeChip outcome={log.outcome} statusCode={log.status_code} />
                      {log.is_impersonated && <ImpersonatedChip />}
                      <span className="font-mono text-xs text-muted">
                        {log.method} {log.path}
                      </span>
                    </div>

                    {log.error_message && (
                      <div className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger break-words">
                        {log.error_message}
                      </div>
                    )}

                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      <Field label="When">{formatDateTime(log.created_at)}</Field>
                      <Field label={log.is_impersonated ? "Acting admin" : "Actor"}>
                        {log.actor_email ?? log.actor_id ?? "Anonymous"}
                        {log.actor_role && <span className="text-muted"> · {log.actor_role}</span>}
                      </Field>
                      {log.is_impersonated && (
                        <Field label="Impersonated account">
                          <span className="font-mono text-xs">{log.effective_user_id}</span>
                        </Field>
                      )}
                      <Field label="Duration">{log.duration_ms !== null ? `${log.duration_ms} ms` : "—"}</Field>
                      <Field label="Page">
                        <span className="font-mono text-xs">{log.client_route ?? "—"}</span>
                      </Field>
                      <Field label="Session">
                        <span className="font-mono text-xs">{log.client_session_id ?? "—"}</span>
                      </Field>
                      <Field label="Request id">
                        <span className="font-mono text-xs">{log.request_id ?? "—"}</span>
                      </Field>
                      <Field label="IP">{log.ip ?? "—"}</Field>
                      <Field label="User agent">
                        <span className="text-xs">{log.user_agent ?? "—"}</span>
                      </Field>
                      {log.job_log_id && (
                        <Field label="Background job">
                          <Link
                            to={Routes.admin.jobs.detail(log.job_log_id)}
                            className="font-mono text-xs text-accent hover:underline"
                          >
                            {log.job_log_id}
                          </Link>
                        </Field>
                      )}
                    </div>

                    <div className="flex flex-col gap-3">
                      <p className="text-sm font-semibold text-foreground">
                        Changes{" "}
                        <span className="font-normal text-muted">
                          ({log.affected_count.toLocaleString()} affected
                          {log.snapshots_truncated ? `, first ${log.changes.length} recorded` : ""})
                        </span>
                      </p>
                      {log.changes.length === 0 ? (
                        <p className="text-sm text-muted">
                          No entity snapshots were recorded for this action.
                        </p>
                      ) : (
                        log.changes.map((change) => (
                          <div
                            key={change.id}
                            className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <ActivityOperationChip operation={change.operation} />
                              <span className="text-sm font-medium text-foreground">
                                {change.entity_type}
                              </span>
                              <span className="font-mono text-xs text-muted">{change.entity_id}</span>
                              <CopyIconButton value={change.entity_id} ariaLabel="Copy id" />
                            </div>
                            <ChangesTable
                              changes={change.changes}
                              before={change.before}
                              after={change.after}
                            />
                          </div>
                        ))
                      )}
                    </div>

                    <div className="flex flex-col gap-2">
                      <JsonBlock label="Request body (sensitive fields redacted)" value={log.request_body} />
                      <JsonBlock label="Query parameters" value={log.request_query} />
                    </div>
                  </>
                )}
              </div>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" onPress={state.close}>
                Close
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
