import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Table, Select, ListBox, Input, Modal, Pagination, useOverlayState } from "@heroui/react";
import { Search, Plus } from "lucide-react";
import { Routes } from "@/routes/routes";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { useAgencies } from "@/features/agencies/hooks/use-agencies";
import { ScraperForm } from "@/features/scrapers/components/scraper-form";
import { ScraperStatusChip } from "@/features/scrapers/components/scraper-status-chip";
import { ScraperHealthChip } from "@/features/scrapers/components/scraper-health-chip";
import { useCreateScraper, useScrapers } from "@/features/scrapers/hooks/use-scrapers";
import {
  ScraperHealths,
  ScraperStatuses,
  type ScraperHealth,
  type ScraperListQuery,
  type ScraperStatus,
} from "@/features/scrapers/interfaces/scrapers.interfaces";
import { formatDate } from "@/lib/date";
import { useDebouncedValue } from "./hooks/use-debounced-value";

const statusFilterOptions: { id: ScraperStatus | "all"; label: string }[] = [
  { id: "all", label: "All statuses" },
  { id: ScraperStatuses.ACTIVE, label: "Active" },
  { id: ScraperStatuses.TESTING, label: "Testing" },
  { id: ScraperStatuses.INACTIVE, label: "Inactive" },
  { id: ScraperStatuses.DEPRECATED, label: "Deprecated" },
  { id: ScraperStatuses.BROKEN, label: "Broken" },
];

const healthFilterOptions: { id: ScraperHealth | "all"; label: string }[] = [
  { id: "all", label: "All health" },
  { id: ScraperHealths.EXCELLENT, label: "Excellent" },
  { id: ScraperHealths.GOOD, label: "Good" },
  { id: ScraperHealths.WARNING, label: "Warning" },
  { id: ScraperHealths.CRITICAL, label: "Critical" },
  { id: ScraperHealths.BROKEN, label: "Broken" },
];

export default function ScrapersListPage() {
  const navigate = useNavigate();
  const createModal = useOverlayState();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ScraperStatus | "all">("all");
  const [health, setHealth] = useState<ScraperHealth | "all">("all");
  const [agencyId, setAgencyId] = useState<string | "all">("all");
  const [page, setPage] = useState(1);
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

  const scrapers = data?.data ?? [];
  const pagination = data?.pagination;
  const agencies = agenciesData?.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-2xl font-semibold tracking-tight text-foreground">Scrapers</p>
          <p className="text-sm text-muted">Version-controlled listing scrapers per agency.</p>
        </div>
        <ActionButtonWithPending onPress={createModal.open} idleLeading={<Plus className="h-4 w-4" />}>
          New scraper
        </ActionButtonWithPending>
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
              {statusFilterOptions.map((option) => (
                <ListBox.Item key={option.id} id={option.id}>
                  {option.label}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>

        <Select
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
              {healthFilterOptions.map((option) => (
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
      ) : scrapers.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-10 text-center text-sm text-muted">
          No scrapers found.
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <Table>
            <Table.ScrollContainer>
              <Table.Content aria-label="Scrapers">
                <Table.Header>
                  <Table.Column isRowHeader>Name</Table.Column>
                  <Table.Column>Agency</Table.Column>
                  <Table.Column>Status</Table.Column>
                  <Table.Column>Health</Table.Column>
                  <Table.Column>Success rate</Table.Column>
                  <Table.Column>Last success</Table.Column>
                  <Table.Column>Last failure</Table.Column>
                </Table.Header>
                <Table.Body>
                  {scrapers.map((scraper) => (
                    <Table.Row
                      key={scraper.id}
                      id={scraper.id}
                      onAction={() => navigate(Routes.admin.scrapers.detail(scraper.id))}
                      className="cursor-pointer"
                    >
                      <Table.Cell>
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">{scraper.name}</span>
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
              <Modal.Heading>New scraper</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <ScraperForm
                submitLabel="Create"
                isPending={createScraper.isPending}
                onCancel={createModal.close}
                onSubmit={(values) =>
                  createScraper.mutate(
                    { source_agency_id: values.source_agency_id, name: values.name, config: JSON.parse(values.config) },
                    { onSuccess: () => createModal.close() },
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
