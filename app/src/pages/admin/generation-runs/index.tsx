import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Table, Select, ListBox, Modal, Pagination, useOverlayState } from "@heroui/react";
import { Plus } from "lucide-react";
import { Routes } from "@/routes/routes";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { useAgencies } from "@/features/agencies/hooks/use-agencies";
import { CreateGenerationRunForm } from "@/features/scraper-generation/components/create-generation-run-form";
import { GenerationRunStatusChip } from "@/features/scraper-generation/components/generation-run-status-chip";
import { GenerationRunTriggerChip } from "@/features/scraper-generation/components/generation-run-trigger-chip";
import {
  useCreateGenerationRun,
  useGenerationRuns,
} from "@/features/scraper-generation/hooks/use-scraper-generation";
import {
  GenerationRunStatuses,
  GenerationTriggers,
  type GenerationRunListQuery,
  type GenerationRunStatus,
  type GenerationTrigger,
} from "@/features/scraper-generation/interfaces/scraper-generation.interfaces";
import { formatDateTime } from "@/lib/date";

const statusFilterOptions: { id: GenerationRunStatus | "all"; label: string }[] = [
  { id: "all", label: "All statuses" },
  { id: GenerationRunStatuses.QUEUED, label: "Queued" },
  { id: GenerationRunStatuses.RUNNING, label: "Running" },
  { id: GenerationRunStatuses.AWAITING_REVIEW, label: "Awaiting review" },
  { id: GenerationRunStatuses.SUCCESS, label: "Success" },
  { id: GenerationRunStatuses.FAILED, label: "Failed" },
  { id: GenerationRunStatuses.CANCELLED, label: "Cancelled" },
];

const triggerFilterOptions: { id: GenerationTrigger | "all"; label: string }[] = [
  { id: "all", label: "All triggers" },
  { id: GenerationTriggers.MANUAL, label: "Manual" },
  { id: GenerationTriggers.SELF_HEAL, label: "Self-heal" },
  { id: GenerationTriggers.SCHEDULED, label: "Scheduled" },
];

export default function GenerationRunsListPage() {
  const navigate = useNavigate();
  const createModal = useOverlayState();

  const [status, setStatus] = useState<GenerationRunStatus | "all">("all");
  const [trigger, setTrigger] = useState<GenerationTrigger | "all">("all");
  const [agencyId, setAgencyId] = useState<string | "all">("all");
  const [page, setPage] = useState(1);

  const query = useMemo<GenerationRunListQuery>(
    () => ({
      page,
      limit: 20,
      ...(status !== "all" && { status }),
      ...(trigger !== "all" && { trigger }),
      ...(agencyId !== "all" && { source_agency_id: agencyId }),
    }),
    [page, status, trigger, agencyId],
  );

  const { data, isPending } = useGenerationRuns(query);
  const { data: agenciesData } = useAgencies({ limit: 100 });
  const createGenerationRun = useCreateGenerationRun();

  const runs = data?.data ?? [];
  const pagination = data?.pagination;
  const agencies = agenciesData?.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-2xl font-semibold tracking-tight text-foreground">Generation runs</p>
          <p className="text-sm text-muted">AI computer-use sessions that generate or fix scrapers.</p>
        </div>
        <ActionButtonWithPending onPress={createModal.open} idleLeading={<Plus className="h-4 w-4" />}>
          New generation run
        </ActionButtonWithPending>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Select
          selectedKey={status}
          onSelectionChange={(key) => {
            setPage(1);
            setStatus(key as GenerationRunStatus | "all");
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
          selectedKey={trigger}
          onSelectionChange={(key) => {
            setPage(1);
            setTrigger(key as GenerationTrigger | "all");
          }}
          className="w-40"
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {triggerFilterOptions.map((option) => (
                <ListBox.Item key={option.id} id={option.id}>
                  {option.label}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>

        <Select
          selectedKey={agencyId}
          onSelectionChange={(key) => {
            setPage(1);
            setAgencyId(key as string | "all");
          }}
          className="w-48"
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              <ListBox.Item key="all" id="all">
                All agencies
              </ListBox.Item>
              {agencies.map((agency) => (
                <ListBox.Item key={agency.id} id={agency.id}>
                  {agency.name}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      </div>

      {isPending ? (
        <TableSkeleton rows={8} columns={6} />
      ) : runs.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-10 text-center text-sm text-muted">
          No generation runs found.
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <Table>
            <Table.ScrollContainer>
              <Table.Content aria-label="Generation runs">
                <Table.Header>
                  <Table.Column isRowHeader>Agency</Table.Column>
                  <Table.Column>Scraper</Table.Column>
                  <Table.Column>Trigger</Table.Column>
                  <Table.Column>Status</Table.Column>
                  <Table.Column>Created</Table.Column>
                  <Table.Column>Finished</Table.Column>
                </Table.Header>
                <Table.Body>
                  {runs.map((run) => (
                    <Table.Row
                      key={run.id}
                      id={run.id}
                      onAction={() => navigate(Routes.admin.generationRuns.detail(run.id))}
                      className="cursor-pointer"
                    >
                      <Table.Cell>
                        <span className="font-medium text-foreground">
                          {run.source_agency?.name ?? "—"}
                        </span>
                      </Table.Cell>
                      <Table.Cell>{run.scraper?.name ?? "—"}</Table.Cell>
                      <Table.Cell>
                        <GenerationRunTriggerChip trigger={run.trigger} />
                      </Table.Cell>
                      <Table.Cell>
                        <GenerationRunStatusChip status={run.status} />
                      </Table.Cell>
                      <Table.Cell>{formatDateTime(run.created_at)}</Table.Cell>
                      <Table.Cell>{formatDateTime(run.finished_at)}</Table.Cell>
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

      <Modal state={createModal}>
        <Modal.Backdrop isDismissable />
        <Modal.Container>
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading>New generation run</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <CreateGenerationRunForm
                isPending={createGenerationRun.isPending}
                onCancel={createModal.close}
                onSubmit={(values) =>
                  createGenerationRun.mutate(
                    {
                      source_agency_id: values.source_agency_id,
                      scraper_id: values.scraper_id || undefined,
                      prompt: values.prompt || undefined,
                    },
                    {
                      onSuccess: (run) => {
                        createModal.close();
                        navigate(Routes.admin.generationRuns.detail(run.id));
                      },
                    },
                  )
                }
              />
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal>
    </div>
  );
}
