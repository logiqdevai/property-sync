import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, RotateCcw, Trash2 } from "lucide-react";
import {
  Button,
  Checkbox,
  Table,
  Select,
  ListBox,
  Pagination,
  useOverlayState,
  type Selection,
} from "@heroui/react";
import { Routes } from "@/routes/routes";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { TableRowActionsMenu, type TableRowAction } from "@/components/ui/table-row-actions-menu";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { JobStatusChip } from "./components/job-status-chip";
import { useDeleteJob, useDeleteJobs, useJobs, useRetryJob } from "@/features/jobs/hooks/use-jobs";
import {
  JobStatuses,
  type JobLogListQuery,
  type JobStatus,
} from "@/features/jobs/interfaces/jobs.interfaces";
import { JobStatusFilterOptions } from "@/config/constants/dropdowns/jobs/job-status-filter.options";
import { JobQueueFilterOptions } from "@/config/constants/dropdowns/jobs/job-queue-filter.options";
import { formatDateTime } from "@/lib/date";
import { formatDuration } from "@/lib/duration";

function toStartOfDayIso(date: string) {
  return new Date(`${date}T00:00:00.000Z`).toISOString();
}

function toEndOfDayIso(date: string) {
  return new Date(`${date}T23:59:59.999Z`).toISOString();
}

function getJobActions(job: { id: string; status: JobStatus }): TableRowAction[] {
  const actions: TableRowAction[] = [{ id: "details", label: "Details", icon: Eye }];

  if (job.status === JobStatuses.FAILED) {
    actions.push({
      id: "retry",
      label: "Retry",
      icon: RotateCcw,
    });
  }

  actions.push({ id: "delete", label: "Delete", variant: "danger", icon: Trash2 });

  return actions;
}

export default function JobsListPage() {
  const navigate = useNavigate();
  const deleteConfirm = useOverlayState();
  const bulkDeleteConfirm = useOverlayState();

  const [status, setStatus] = useState<JobStatus | "all">("all");
  const [queueName, setQueueName] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [selectedKeys, setSelectedKeys] = useState<Selection>(new Set());
  const [deleteJobId, setDeleteJobId] = useState<string | null>(null);

  const query = useMemo<JobLogListQuery>(
    () => ({
      page,
      limit: 20,
      ...(status !== "all" && { status }),
      ...(queueName !== "all" && { queue_name: queueName }),
      ...(dateFrom && { date_from: toStartOfDayIso(dateFrom) }),
      ...(dateTo && { date_to: toEndOfDayIso(dateTo) }),
    }),
    [page, status, queueName, dateFrom, dateTo],
  );

  const { data, isPending } = useJobs(query);
  const retryJob = useRetryJob();
  const deleteJob = useDeleteJob();
  const deleteJobs = useDeleteJobs();

  const jobs = data?.data ?? [];
  const pagination = data?.pagination;
  const selectedIds = useMemo(() => {
    if (selectedKeys === "all") {
      return new Set(jobs.map((job) => job.id));
    }
    return new Set([...selectedKeys].map(String));
  }, [selectedKeys, jobs]);
  const selectedCount = selectedIds.size;

  const clearSelection = () => setSelectedKeys(new Set());

  const handleJobAction = (jobId: string, actionId: string) => {
    if (actionId === "details") {
      navigate(Routes.admin.jobs.detail(jobId));
      return;
    }

    if (actionId === "retry") {
      retryJob.mutate(jobId);
      return;
    }

    if (actionId === "delete") {
      setDeleteJobId(jobId);
      deleteConfirm.open();
    }
  };

  const handleDelete = async () => {
    if (!deleteJobId) return;
    await deleteJob.mutateAsync(deleteJobId);
    setSelectedKeys((prev) => {
      if (prev === "all") {
        return new Set(jobs.map((job) => job.id).filter((id) => id !== deleteJobId));
      }
      const next = new Set(prev);
      next.delete(deleteJobId);
      return next;
    });
    setDeleteJobId(null);
  };

  const handleBulkDelete = async () => {
    await deleteJobs.mutateAsync({ job_ids: Array.from(selectedIds) });
    clearSelection();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-2xl font-semibold tracking-tight text-foreground">Job queue</p>
          <p className="text-sm text-muted">Background job execution logs from BullMQ workers.</p>
        </div>
        <Button
          variant="danger"
          isDisabled={selectedCount < 1}
          onPress={bulkDeleteConfirm.open}
        >
          Delete selected ({selectedCount})
        </Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Select
          aria-label="Filter by status"
          selectedKey={status}
          onSelectionChange={(key) => {
            setPage(1);
            setStatus(key as JobStatus | "all");
          }}
          className="w-44"
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {JobStatusFilterOptions.map((option) => (
                <ListBox.Item key={option.id} id={option.id}>
                  {option.label}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>

        <Select
          aria-label="Filter by queue"
          selectedKey={queueName}
          onSelectionChange={(key) => {
            setPage(1);
            setQueueName(key as string);
          }}
          className="w-40"
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {JobQueueFilterOptions.map((option) => (
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
            setPage(1);
            setDateFrom(next);
          }}
        />
        <DatePickerField
          aria-label="To date"
          value={dateTo}
          onChange={(next) => {
            setPage(1);
            setDateTo(next);
          }}
        />
      </div>

      {isPending ? (
        <TableSkeleton rows={8} columns={8} />
      ) : jobs.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-10 text-center text-sm text-muted">
          No jobs found.
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <Table>
            <Table.ScrollContainer>
              <Table.Content
                aria-label="Jobs"
                selectionMode="multiple"
                selectedKeys={selectedKeys}
                onSelectionChange={setSelectedKeys}
              >
                <Table.Header>
                  <Table.Column className="pr-0">
                    <Checkbox aria-label="Select all jobs on this page" slot="selection">
                      <Checkbox.Content>
                        <Checkbox.Control>
                          <Checkbox.Indicator />
                        </Checkbox.Control>
                      </Checkbox.Content>
                    </Checkbox>
                  </Table.Column>
                  <Table.Column isRowHeader>Queue</Table.Column>
                  <Table.Column>Job</Table.Column>
                  <Table.Column>Status</Table.Column>
                  <Table.Column>Attempts</Table.Column>
                  <Table.Column>Duration</Table.Column>
                  <Table.Column>Created</Table.Column>
                  <Table.Column>Crawl run</Table.Column>
                  <Table.Column>Actions</Table.Column>
                </Table.Header>
                <Table.Body>
                  {jobs.map((job) => (
                    <Table.Row key={job.id} id={job.id}>
                      <Table.Cell className="pr-0">
                        <Checkbox
                          aria-label={`Select job ${job.id}`}
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
                      <Table.Cell>{job.queue_name}</Table.Cell>
                      <Table.Cell>{job.job_name ?? "—"}</Table.Cell>
                      <Table.Cell>
                        <JobStatusChip status={job.status} />
                      </Table.Cell>
                      <Table.Cell>
                        {job.attempt}
                        {job.max_attempts !== null ? ` / ${job.max_attempts}` : ""}
                      </Table.Cell>
                      <Table.Cell>{formatDuration(job.duration_ms)}</Table.Cell>
                      <Table.Cell>{formatDateTime(job.created_at)}</Table.Cell>
                      <Table.Cell>
                        {job.crawl_run_id ? (
                          <button
                            className="text-sm text-accent hover:underline"
                            onClick={() =>
                              navigate(Routes.admin.crawlRuns.detail(job.crawl_run_id!))
                            }
                          >
                            View run
                          </button>
                        ) : (
                          "—"
                        )}
                      </Table.Cell>
                      <Table.Cell>
                        <TableRowActionsMenu
                          actions={getJobActions(job).map((action) =>
                            action.id === "retry"
                              ? { ...action, isDisabled: retryJob.isPending }
                              : action,
                          )}
                          onAction={(actionId) => handleJobAction(job.id, actionId)}
                          ariaLabel={`Actions for job ${job.id}`}
                        />
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table>
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
        state={deleteConfirm}
        title="Delete this job?"
        description="This will permanently delete the job log. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        isPending={deleteJob.isPending}
      />

      <ConfirmationDialog
        state={bulkDeleteConfirm}
        title="Delete selected jobs?"
        description={`This will permanently delete ${selectedCount} job logs. This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleBulkDelete}
        isPending={deleteJobs.isPending}
      />
    </div>
  );
}
