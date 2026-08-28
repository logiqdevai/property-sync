import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  Checkbox,
  Table,
  Select,
  ListBox,
  Input,
  Modal,
  Pagination,
  useOverlayState,
  type Selection,
} from "@heroui/react";
import { Search, Plus, Trash2, ExternalLink } from "lucide-react";
import { Routes } from "@/routes/routes";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { TableRowActionsMenu, type TableRowAction } from "@/components/ui/table-row-actions-menu";
import { useAgencies } from "@/features/agencies/hooks/use-agencies";
import { ScraperForm } from "./components/scraper-form";
import { ScraperStatusChip } from "./components/scraper-status-chip";
import { ScraperHealthChip } from "./components/scraper-health-chip";
import {
  useCreateScraper,
  useDeleteScraper,
  useDeleteScrapers,
  useDuplicateScraper,
  useScrapers,
} from "@/features/scrapers/hooks/use-scrapers";
import { parseOptionalNormalizeLimit } from "@/features/scrapers/validation-schemas/scrapers.schema";
import {
  type ScraperHealth,
  type ScraperListQuery,
  type ScraperStatus,
} from "@/features/scrapers/interfaces/scrapers.interfaces";
import { ScraperStatusFilterOptions } from "@/config/constants/dropdowns/scrapers/scraper-status-filter.options";
import { ScraperHealthFilterOptions } from "@/config/constants/dropdowns/scrapers/scraper-health-filter.options";
import { formatDate } from "@/lib/date";
import { useDebouncedValue } from "./hooks/use-debounced-value";

const SCRAPER_DELETE_ACTIONS: TableRowAction[] = [
  { id: "delete", label: "Delete", variant: "danger", icon: Trash2 },
];

export default function ScrapersListPage() {
  const navigate = useNavigate();
  const createModal = useOverlayState();
  const deleteConfirm = useOverlayState();
  const bulkDeleteConfirm = useOverlayState();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ScraperStatus | "all">("all");
  const [health, setHealth] = useState<ScraperHealth | "all">("all");
  const [agencyId, setAgencyId] = useState<string | "all">("all");
  const [page, setPage] = useState(1);
  const [selectedKeys, setSelectedKeys] = useState<Selection>(new Set());
  const [deleteScraperId, setDeleteScraperId] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(search, 300);

  const query = useMemo<ScraperListQuery>(
    () => ({
      page,
      limit: 20,
      ...(debouncedSearch && { search: debouncedSearch }),
      ...(status !== "all" && { status }),
      ...(health !== "all" && { health }),
      ...(agencyId !== "all" && { source_agency_id: agencyId }),
    }),
    [page, debouncedSearch, status, health, agencyId],
  );

  const { data, isPending } = useScrapers(query);
  const { data: agenciesData } = useAgencies({ limit: 100 });
  const createScraper = useCreateScraper();
  const duplicateScraper = useDuplicateScraper();
  const deleteScraper = useDeleteScraper();
  const deleteScrapers = useDeleteScrapers();

  const scrapers = data?.data ?? [];
  const pagination = data?.pagination;
  const agencies = agenciesData?.data ?? [];
  const selectedIds = useMemo(() => {
    if (selectedKeys === "all") {
      return new Set(scrapers.map((scraper) => scraper.id));
    }
    return new Set([...selectedKeys].map(String));
  }, [selectedKeys, scrapers]);
  const selectedCount = selectedIds.size;

  const clearSelection = () => setSelectedKeys(new Set());

  const handleDelete = async () => {
    if (!deleteScraperId) return;
    await deleteScraper.mutateAsync(deleteScraperId);
    setSelectedKeys((prev) => {
      if (prev === "all") {
        return new Set(scrapers.map((scraper) => scraper.id).filter((id) => id !== deleteScraperId));
      }
      const next = new Set(prev);
      next.delete(deleteScraperId);
      return next;
    });
    setDeleteScraperId(null);
  };

  const handleBulkDelete = async () => {
    await deleteScrapers.mutateAsync({ scraper_ids: Array.from(selectedIds) });
    clearSelection();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-2xl font-semibold tracking-tight text-foreground">Scrapers</p>
          <p className="text-sm text-muted">Version-controlled listing scrapers per agency.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="danger"
            isDisabled={selectedCount < 1}
            onPress={bulkDeleteConfirm.open}
          >
            Delete selected ({selectedCount})
          </Button>
          <ActionButtonWithPending onPress={createModal.open} idleLeading={<Plus className="h-4 w-4" />}>
            New scraper
          </ActionButtonWithPending>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative max-w-sm w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            placeholder="Search by name"
            className="pl-9"
            fullWidth
          />
        </div>

        <Select
          aria-label="Filter by status"
          selectedKey={status}
          onSelectionChange={(key) => {
            setPage(1);
            setStatus(key as ScraperStatus | "all");
          }}
          className="w-40"
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {ScraperStatusFilterOptions.map((option) => (
                <ListBox.Item key={option.id} id={option.id}>
                  {option.label}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>

        <Select
          aria-label="Filter by health"
          selectedKey={health}
          onSelectionChange={(key) => {
            setPage(1);
            setHealth(key as ScraperHealth | "all");
          }}
          className="w-40"
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {ScraperHealthFilterOptions.map((option) => (
                <ListBox.Item key={option.id} id={option.id}>
                  {option.label}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>

        <Select
          aria-label="Filter by agency"
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
      ) : scrapers.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-10 text-center text-sm text-muted">
          No scrapers found.
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <Table>
            <Table.ScrollContainer>
              <Table.Content
                aria-label="Scrapers"
                selectionMode="multiple"
                selectedKeys={selectedKeys}
                onSelectionChange={setSelectedKeys}
              >
                <Table.Header>
                  <Table.Column className="pr-0">
                    <Checkbox aria-label="Select all scrapers on this page" slot="selection">
                      <Checkbox.Content>
                        <Checkbox.Control>
                          <Checkbox.Indicator />
                        </Checkbox.Control>
                      </Checkbox.Content>
                    </Checkbox>
                  </Table.Column>
                  <Table.Column isRowHeader>Name</Table.Column>
                  <Table.Column>Agency</Table.Column>
                  <Table.Column>Status</Table.Column>
                  <Table.Column>Health</Table.Column>
                  <Table.Column>Success rate</Table.Column>
                  <Table.Column>Last success</Table.Column>
                  <Table.Column>Last failure</Table.Column>
                  <Table.Column>Actions</Table.Column>
                </Table.Header>
                <Table.Body>
                  {scrapers.map((scraper) => (
                    <Table.Row
                      key={scraper.id}
                      id={scraper.id}
                      onAction={() => navigate(Routes.admin.scrapers.detail(scraper.id))}
                      className="cursor-pointer"
                    >
                      <Table.Cell className="pr-0">
                        <Checkbox
                          aria-label={`Select scraper ${scraper.name}`}
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
                      <Table.Cell>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-foreground">{scraper.name}</span>
                            {scraper.source_agency?.base_url ? (
                              <a
                                href={scraper.source_agency.base_url}
                                target="_blank"
                                rel="noreferrer"
                                aria-label={`Open ${scraper.source_agency.name} website in a new tab`}
                                className="shrink-0 text-muted hover:text-accent"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ExternalLink className="size-3.5" />
                              </a>
                            ) : null}
                          </div>
                          <span className="text-xs text-muted">v{scraper.version_count}</span>
                        </div>
                      </Table.Cell>
                      <Table.Cell>
                        <button
                          className="text-sm text-accent hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(Routes.admin.agencies.detail(scraper.source_agency_id));
                          }}
                        >
                          {scraper.source_agency?.name ?? "—"}
                        </button>
                      </Table.Cell>
                      <Table.Cell>
                        <ScraperStatusChip status={scraper.status} />
                      </Table.Cell>
                      <Table.Cell>
                        <ScraperHealthChip health={scraper.health} />
                      </Table.Cell>
                      <Table.Cell>
                        {scraper.success_rate !== null ? `${scraper.success_rate}%` : "—"}
                      </Table.Cell>
                      <Table.Cell>{formatDate(scraper.last_success_at)}</Table.Cell>
                      <Table.Cell>{formatDate(scraper.last_failure_at)}</Table.Cell>
                      <Table.Cell>
                        <TableRowActionsMenu
                          actions={SCRAPER_DELETE_ACTIONS}
                          onAction={(actionId) => {
                            if (actionId !== "delete") return;
                            setDeleteScraperId(scraper.id);
                            deleteConfirm.open();
                          }}
                          ariaLabel={`Actions for scraper ${scraper.name}`}
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

      <Modal state={createModal}>
        <Modal.Backdrop isDismissable>
          <Modal.Container>
            <Modal.Dialog>
              <Modal.Header>
                <Modal.Heading>New scraper</Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                <ScraperForm
                  submitLabel="Create"
                  isPending={createScraper.isPending || duplicateScraper.isPending}
                  onCancel={createModal.close}
                  onSubmit={(values) => {
                    if (values.duplicate_from_scraper_id) {
                      duplicateScraper.mutate(
                        {
                          id: values.duplicate_from_scraper_id,
                          payload: { source_agency_id: values.source_agency_id },
                        },
                        {
                          onSuccess: (created) => {
                            createModal.close();
                            navigate(Routes.admin.scrapers.detail(created.id));
                          },
                        },
                      );
                      return;
                    }

                    const normalizeLimit = parseOptionalNormalizeLimit(values.normalize_limit ?? "");
                    createScraper.mutate(
                      {
                        source_agency_id: values.source_agency_id,
                        // Validated non-empty by createScraperFormSchema when not duplicating.
                        name: values.name ?? "",
                        ...(normalizeLimit !== undefined && { normalize_limit: normalizeLimit }),
                      },
                      {
                        onSuccess: (created) => {
                          createModal.close();
                          navigate(Routes.admin.scrapers.detail(created.id));
                        },
                      },
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
        title="Delete this scraper?"
        description="This will permanently delete the scraper and its versions. Scrapers with active crawl runs cannot be deleted. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        isPending={deleteScraper.isPending}
      />

      <ConfirmationDialog
        state={bulkDeleteConfirm}
        title="Delete selected scrapers?"
        description={`This will permanently delete ${selectedCount} scrapers. Scrapers with active crawl runs cannot be deleted. This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleBulkDelete}
        isPending={deleteScrapers.isPending}
      />
    </div>
  );
}
