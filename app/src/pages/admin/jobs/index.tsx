import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Table, Select, ListBox, Pagination } from "@heroui/react";
import { Routes } from "@/routes/routes";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { JobStatusChip } from "@/features/jobs/components/job-status-chip";
import { useJobs, useRetryJob } from "@/features/jobs/hooks/use-jobs";
import {
  JobStatuses,
  type JobLogListQuery,
  type JobStatus,
} from "@/features/jobs/interfaces/jobs.interfaces";

const statusFilterOptions: { id: JobStatus | "all"; label: string }[] = [
  { id: "all", label: "All statuses" },
  { id: JobStatuses.WAITING, label: "Waiting" },
  { id: JobStatuses.ACTIVE, label: "Active" },
  { id: JobStatuses.COMPLETED, label: "Completed" },
  { id: JobStatuses.FAILED, label: "Failed" },
  { id: JobStatuses.DELAYED, label: "Delayed" },
  { id: JobStatuses.STALLED, label: "Stalled" },
];

const queueFilterOptions = [
  { id: "all", label: "All queues" },
  { id: "crawl", label: "crawl" },
  { id: "generation", label: "generation" },
];

function formatDuration(ms: number | null) {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function JobsListPage() {
  const navigate = useNavigate();

  const [status, setStatus] = useState<JobStatus | "all">("all");
  const [queueName, setQueueName] = useState<string>("all");
  const [page, setPage] = useState(1);

  const query = useMemo<JobLogListQuery>(
    () => ({
      page,
      limit: 20,
      ...(status !== "all" && { status }),
      ...(queueName !== "all" && { queue_name: queueName }),
    }),
    [page, status, queueName],
  );

  const { data, isPending } = useJobs(query);
  const retryJob = useRetryJob();

  const jobs = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-2xl font-semibold tracking-tight text-foreground">Job queue</p>
        <p className="text-sm text-muted">Background job execution logs from BullMQ workers.</p>
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
              {statusFilterOptions.map((option) => (
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
              {queueFilterOptions.map((option) => (
                <ListBox.Item key={option.id} id={option.id}>
                  {option.label}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      </div>

      {isPending ? (
        <TableSkeleton rows={8} columns={7} />
      ) : jobs.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-10 text-center text-sm text-muted">
          No jobs found.
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <Table>
            <Table.ScrollContainer>
              <Table.Content aria-label="Jobs">
                <Table.Header>
                  <Table.Column isRowHeader>Queue</Table.Column>
                  <Table.Column>Job</Table.Column>
                  <Table.Column>Status</Table.Column>
                  <Table.Column>Attempts</Table.Column>
                  <Table.Column>Duration</Table.Column>
                  <Table.Column>Crawl run</Table.Column>
                  <Table.Column>Actions</Table.Column>
                </Table.Header>
                <Table.Body>
                  {jobs.map((job) => (
                    <Table.Row key={job.id} id={job.id}>
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
                        <div className="flex items-center gap-2">
                          <button
                            className="text-sm text-accent hover:underline"
                            onClick={() => navigate(Routes.admin.jobs.detail(job.id))}
                          >
                            Details
                          </button>
                          {job.status === JobStatuses.FAILED && (
                            <ActionButtonWithPending
                              variant="secondary"
                              isPending={retryJob.isPending}
                              isDisabled={retryJob.isPending}
                              onPress={() => retryJob.mutate(job.id)}
                            >
                              Retry
                            </ActionButtonWithPending>
                          )}
                        </div>
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
    </div>
  );
}
