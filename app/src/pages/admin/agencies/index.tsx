import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Table,
  Chip,
  Select,
  ListBox,
  Input,
  Modal,
  Pagination,
  useOverlayState,
} from "@heroui/react";
import { Archive, Ban, CheckCircle, Plus, Search } from "lucide-react";
import { Routes } from "@/routes/routes";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  TableRowActionsMenu,
  type TableRowAction,
} from "@/components/ui/table-row-actions-menu";
import { AgencyForm } from "./components/agency-form";
import { AgencyStatusChip } from "./components/agency-status-chip";
import { useAgencies, useCreateAgency, useUpdateAgencyStatus } from "@/features/agencies/hooks/use-agencies";
import {
  AgencyStatuses,
  type AgencyListQuery,
  type AgencyStatus,
  type SourceAgency,
} from "@/features/agencies/interfaces/agencies.interfaces";
import { AgencyStatusFilterOptions } from "@/config/constants/dropdowns/agency-status-filter.options";
import { formatDate } from "@/lib/date";
import { useDebouncedValue } from "./hooks/use-debounced-value";

function getAgencyActions(agency: SourceAgency): TableRowAction[] {
  const actions: TableRowAction[] = [];

  if (agency.status !== AgencyStatuses.ACTIVE) {
    actions.push({ id: "activate", label: "Activate", icon: CheckCircle });
  }

  if (agency.status === AgencyStatuses.ACTIVE) {
    actions.push({ id: "disable", label: "Disable", icon: Ban });
  }

  if (agency.status !== AgencyStatuses.ARCHIVED) {
    actions.push({ id: "archive", label: "Archive", variant: "danger", icon: Archive });
  }

  return actions;
}

export default function AgenciesListPage() {
  const navigate = useNavigate();
  const createModal = useOverlayState();
  const archiveConfirm = useOverlayState();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<AgencyStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [archiveAgencyId, setArchiveAgencyId] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(search, 300);

  const query = useMemo<AgencyListQuery>(
    () => ({
      page,
      limit: 20,
      ...(debouncedSearch && { search: debouncedSearch }),
      ...(status !== "all" && { status }),
    }),
    [page, debouncedSearch, status],
  );

  const { data, isPending } = useAgencies(query);
  const createAgency = useCreateAgency();
  const updateStatus = useUpdateAgencyStatus();

  const agencies = data?.data ?? [];
  const pagination = data?.pagination;

  const handleAgencyAction = (agencyId: string, actionId: string) => {
    if (actionId === "activate") {
      updateStatus.mutate({ id: agencyId, status: AgencyStatuses.ACTIVE });
      return;
    }

    if (actionId === "disable") {
      updateStatus.mutate({ id: agencyId, status: AgencyStatuses.DISABLED });
      return;
    }

    if (actionId === "archive") {
      setArchiveAgencyId(agencyId);
      archiveConfirm.open();
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-2xl font-semibold tracking-tight text-foreground">Agencies</p>
          <p className="text-sm text-muted">Source websites scraped for property listings.</p>
        </div>
        <ActionButtonWithPending onPress={createModal.open} idleLeading={<Plus className="h-4 w-4" />}>
          New agency
        </ActionButtonWithPending>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative max-w-sm w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            placeholder="Search by name or URL"
            className="pl-9"
            fullWidth
          />
        </div>

        <Select
          aria-label="Filter by status"
          selectedKey={status}
          onSelectionChange={(key) => {
            setPage(1);
            setStatus(key as AgencyStatus | "all");
          }}
          className="w-44"
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {AgencyStatusFilterOptions.map((option) => (
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
      ) : agencies.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-10 text-center text-sm text-muted">
          No agencies found.
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <Table>
            <Table.ScrollContainer>
              <Table.Content aria-label="Agencies">
                <Table.Header>
                  <Table.Column isRowHeader>Name</Table.Column>
                  <Table.Column>Status</Table.Column>
                  <Table.Column>Visibility</Table.Column>
                  <Table.Column>Location</Table.Column>
                  <Table.Column>Last success</Table.Column>
                  <Table.Column>Last failure</Table.Column>
                  <Table.Column>Actions</Table.Column>
                </Table.Header>
                <Table.Body>
                  {agencies.map((agency) => (
                    <Table.Row
                      key={agency.id}
                      id={agency.id}
                      onAction={() => navigate(Routes.admin.agencies.detail(agency.id))}
                      className="cursor-pointer"
                    >
                      <Table.Cell>
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">{agency.name}</span>
                          <span className="text-xs text-muted truncate max-w-xs">{agency.base_url}</span>
                        </div>
                      </Table.Cell>
                      <Table.Cell>
                        <AgencyStatusChip status={agency.status} />
                      </Table.Cell>
                      <Table.Cell>
                        <div className="flex gap-1.5">
                          <Chip color={agency.is_visible ? "success" : "default"} size="sm" variant="soft">
                            <Chip.Label>{agency.is_visible ? "Visible" : "Hidden"}</Chip.Label>
                          </Chip>
                          <Chip color={agency.is_enabled ? "success" : "default"} size="sm" variant="soft">
                            <Chip.Label>{agency.is_enabled ? "Enabled" : "Disabled"}</Chip.Label>
                          </Chip>
                        </div>
                      </Table.Cell>
                      <Table.Cell>
                        {[agency.city, agency.country].filter(Boolean).join(", ") || "—"}
                      </Table.Cell>
                      <Table.Cell>{formatDate(agency.last_success_at)}</Table.Cell>
                      <Table.Cell>{formatDate(agency.last_failure_at)}</Table.Cell>
                      <Table.Cell>
                        <TableRowActionsMenu
                          actions={getAgencyActions(agency)}
                          onAction={(actionId) => handleAgencyAction(agency.id, actionId)}
                          ariaLabel={`Actions for ${agency.name}`}
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
        state={archiveConfirm}
        title="Archive this agency?"
        description="Archived agencies are hidden from active operations."
        confirmLabel="Archive"
        isPending={updateStatus.isPending}
        onConfirm={() => {
          if (!archiveAgencyId) return;
          updateStatus.mutate(
            { id: archiveAgencyId, status: AgencyStatuses.ARCHIVED },
            {
              onSuccess: () => setArchiveAgencyId(null),
            },
          );
        }}
      />

      <Modal state={createModal}>
        <Modal.Backdrop isDismissable>
          <Modal.Container>
            <Modal.Dialog>
              <Modal.Header>
                <Modal.Heading>New agency</Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                <AgencyForm
                  submitLabel="Create"
                  isPending={createAgency.isPending}
                  onCancel={createModal.close}
                  onSubmit={(values) =>
                    createAgency.mutate(values, {
                      onSuccess: () => createModal.close(),
                    })
                  }
                />
              </Modal.Body>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </div>
  );
}
