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
import { Ban, CheckCircle, Eye, EyeOff, Plus, Search, Trash2 } from "lucide-react";
import { Routes } from "@/routes/routes";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  TableRowActionsMenu,
  type TableRowAction,
} from "@/components/ui/table-row-actions-menu";
import { AgencyForm } from "./components/agency-form";
import {
  useAgencies,
  useCreateAgency,
  useDeleteAgency,
  useUpdateAgencyVisibility,
} from "@/features/agencies/hooks/use-agencies";
import { toAgencyBlockHandlingPayload } from "@/features/agencies/validation-schemas/agencies.schema";
import type { AgencyListQuery, SourceAgency } from "@/features/agencies/interfaces/agencies.interfaces";
import {
  AgencyVisibilityFilterOptions,
  agencyVisibilityFilterToQuery,
  type AgencyVisibilityFilter,
} from "@/config/constants/dropdowns/agencies/agency-visibility-filter.options";
import { formatDate } from "@/lib/date";
import { useDebouncedValue } from "./hooks/use-debounced-value";

function getAgencyActions(agency: SourceAgency): TableRowAction[] {
  const actions: TableRowAction[] = [];
  const dependentCount = (agency._count?.scrapers ?? 0) + (agency._count?.crawl_runs ?? 0);

  if (!agency.is_visible) {
    actions.push({ id: "show", label: "Show", icon: Eye });
  } else {
    actions.push({ id: "hide", label: "Hide", variant: "danger", icon: EyeOff });
  }

  if (agency.is_visible && !agency.is_enabled) {
    actions.push({ id: "enable", label: "Enable tracking", icon: CheckCircle });
  }

  if (agency.is_enabled) {
    actions.push({ id: "disable", label: "Disable tracking", icon: Ban });
  }

  actions.push({
    id: "delete",
    label: "Delete",
    variant: "danger",
    icon: Trash2,
    isDisabled: dependentCount > 0,
  });

  return actions;
}

export default function AgenciesListPage() {
  const navigate = useNavigate();
  const createModal = useOverlayState();
  const deleteConfirm = useOverlayState();

  const [search, setSearch] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState<AgencyVisibilityFilter>("all");
  const [page, setPage] = useState(1);
  const [deleteAgencyId, setDeleteAgencyId] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(search, 300);

  const query = useMemo<AgencyListQuery>(
    () => ({
      page,
      limit: 20,
      ...(debouncedSearch && { search: debouncedSearch }),
      ...agencyVisibilityFilterToQuery(visibilityFilter),
    }),
    [page, debouncedSearch, visibilityFilter],
  );

  const { data, isPending } = useAgencies(query);
  const createAgency = useCreateAgency();
  const updateVisibility = useUpdateAgencyVisibility();
  const deleteAgency = useDeleteAgency();

  const agencies = data?.data ?? [];
  const pagination = data?.pagination;

  const handleAgencyAction = (agency: SourceAgency, actionId: string) => {
    if (actionId === "show") {
      updateVisibility.mutate({
        id: agency.id,
        payload: { is_visible: true, is_enabled: agency.is_enabled },
      });
      return;
    }

    if (actionId === "hide") {
      updateVisibility.mutate({
        id: agency.id,
        payload: { is_visible: false, is_enabled: false },
      });
      return;
    }

    if (actionId === "enable") {
      updateVisibility.mutate({
        id: agency.id,
        payload: { is_visible: true, is_enabled: true },
      });
      return;
    }

    if (actionId === "disable") {
      updateVisibility.mutate({
        id: agency.id,
        payload: { is_visible: agency.is_visible, is_enabled: false },
      });
      return;
    }

    if (actionId === "delete") {
      setDeleteAgencyId(agency.id);
      deleteConfirm.open();
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
          aria-label="Filter by visibility"
          selectedKey={visibilityFilter}
          onSelectionChange={(key) => {
            setPage(1);
            setVisibilityFilter(key as AgencyVisibilityFilter);
          }}
          className="w-52"
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {AgencyVisibilityFilterOptions.map((option) => (
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
                  <Table.Column>#</Table.Column>
                  <Table.Column isRowHeader>Name</Table.Column>
                  <Table.Column>Visibility</Table.Column>
                  <Table.Column>Location</Table.Column>
                  <Table.Column>Last success</Table.Column>
                  <Table.Column>Last failure</Table.Column>
                  <Table.Column>Actions</Table.Column>
                </Table.Header>
                <Table.Body>
                  {agencies.map((agency, index) => (
                    <Table.Row
                      key={agency.id}
                      id={agency.id}
                      onAction={() => navigate(Routes.admin.agencies.detail(agency.id))}
                      className="cursor-pointer"
                    >
                      <Table.Cell>
                        <span className="tabular-nums text-muted">
                          {(page - 1) * 20 + index + 1}
                        </span>
                      </Table.Cell>
                      <Table.Cell>
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">{agency.name}</span>
                          <span className="text-xs text-muted truncate max-w-xs">{agency.base_url}</span>
                        </div>
                      </Table.Cell>
                      <Table.Cell>
                        <div className="flex gap-1.5">
                          <Chip color={agency.is_visible ? "success" : "default"} size="sm" variant="soft">
                            <Chip.Label>{agency.is_visible ? "Visible" : "Hidden"}</Chip.Label>
                          </Chip>
                          <Chip color={agency.is_enabled ? "success" : "default"} size="sm" variant="soft">
                            <Chip.Label>{agency.is_enabled ? "Trackable" : "Not trackable"}</Chip.Label>
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
                          onAction={(actionId) => handleAgencyAction(agency, actionId)}
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
        state={deleteConfirm}
        title="Delete this agency?"
        description="This cannot be undone."
        confirmLabel="Delete"
        isPending={deleteAgency.isPending}
        onConfirm={() => {
          if (!deleteAgencyId) return;
          deleteAgency.mutate(deleteAgencyId, {
            onSuccess: () => setDeleteAgencyId(null),
          });
        }}
      />

      <Modal state={createModal}>
        <Modal.Backdrop isDismissable>
          <Modal.Container size="lg">
            <Modal.Dialog>
              <Modal.Header>
                <Modal.Heading>New agency</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="max-h-[70vh] overflow-y-auto">
                <AgencyForm
                  submitLabel="Create"
                  isPending={createAgency.isPending}
                  onCancel={createModal.close}
                  onSubmit={(values) => {
                    const blockHandling = toAgencyBlockHandlingPayload(values);
                    createAgency.mutate(
                      {
                        name: values.name,
                        base_url: values.base_url,
                        country: values.country,
                        city: values.city,
                        notes: values.notes,
                        content_language: values.content_language,
                        crawl_interval: values.crawl_interval,
                        ...(blockHandling.block_handling_wait_timeout_ms != null && {
                          block_handling_wait_timeout_ms:
                            blockHandling.block_handling_wait_timeout_ms,
                        }),
                        ...(blockHandling.block_handling_min_ready_body_length !=
                          null && {
                          block_handling_min_ready_body_length:
                            blockHandling.block_handling_min_ready_body_length,
                        }),
                        ...(blockHandling.block_rules.length > 0 && {
                          block_rules: blockHandling.block_rules,
                        }),
                      },
                      { onSuccess: () => createModal.close() },
                    );
                  }}
                />
              </Modal.Body>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </div>
  );
}
