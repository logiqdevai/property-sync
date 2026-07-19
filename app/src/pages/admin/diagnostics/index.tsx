import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Table, Select, ListBox, Pagination } from "@heroui/react";
import { Routes } from "@/routes/routes";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { useScrapers } from "@/features/scrapers/hooks/use-scrapers";
import { useDiagnosticsPackages } from "@/features/diagnostics/hooks/use-diagnostics";
import type { DiagnosticsListQuery } from "@/features/diagnostics/interfaces/diagnostics.interfaces";
import { DiagnosticsModeChip } from "./components/diagnostics-mode-chip";
import { formatDateTime } from "@/lib/date";
import { formatDuration } from "@/lib/duration";

function toStartOfDayIso(date: string) {
  return new Date(`${date}T00:00:00.000Z`).toISOString();
}

function toEndOfDayIso(date: string) {
  return new Date(`${date}T23:59:59.999Z`).toISOString();
}

export default function DiagnosticsListPage() {
  const navigate = useNavigate();

  const [scraperId, setScraperId] = useState<string | "all">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const query = useMemo<DiagnosticsListQuery>(
    () => ({
      page,
      limit: 20,
      ...(scraperId !== "all" && { scraper_id: scraperId }),
      ...(dateFrom && { date_from: toStartOfDayIso(dateFrom) }),
      ...(dateTo && { date_to: toEndOfDayIso(dateTo) }),
    }),
    [page, scraperId, dateFrom, dateTo],
  );

  const { data, isPending } = useDiagnosticsPackages(query);
  const { data: scrapersData } = useScrapers({ limit: 100 });

  const packages = data?.data ?? [];
  const pagination = data?.pagination;
  const scrapers = scrapersData?.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-2xl font-semibold tracking-tight text-foreground">Diagnostics</p>
        <p className="text-sm text-muted">
          Failure diagnostics packages (traces, screenshots, HTML, console, HAR, video) collected
          from scrapers running in Trace or Full Debug mode.
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Select
          aria-label="Filter by scraper"
          selectedKey={scraperId}
          onSelectionChange={(key) => {
            setPage(1);
            setScraperId(key as string | "all");
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
                All scrapers
              </ListBox.Item>
              {scrapers.map((scraper) => (
                <ListBox.Item key={scraper.id} id={scraper.id}>
                  {scraper.name}
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
        <TableSkeleton rows={8} columns={6} />
      ) : packages.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-10 text-center text-sm text-muted">
          No diagnostics packages found.
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <Table>
            <Table.ScrollContainer>
              <Table.Content aria-label="Diagnostics packages">
                <Table.Header>
                  <Table.Column isRowHeader>Scraper</Table.Column>
                  <Table.Column>Mode</Table.Column>
                  <Table.Column>Failure reason</Table.Column>
                  <Table.Column>Artifacts</Table.Column>
                  <Table.Column>Started</Table.Column>
                  <Table.Column>Duration</Table.Column>
                </Table.Header>
                <Table.Body>
                  {packages.map((pkg) => (
                    <Table.Row
                      key={pkg.id}
                      id={pkg.id}
                      onAction={() => navigate(Routes.admin.diagnostics.detail(pkg.id))}
                      className="cursor-pointer"
                    >
                      <Table.Cell>
                        <span className="font-medium text-foreground">
                          {pkg.scraper?.name ?? pkg.scraper_id}
                        </span>
                      </Table.Cell>
                      <Table.Cell>
                        <DiagnosticsModeChip mode={pkg.mode} />
                      </Table.Cell>
                      <Table.Cell>
                        <span className="text-sm text-danger">{pkg.failure_reason ?? "—"}</span>
                      </Table.Cell>
                      <Table.Cell>
                        <span className="text-xs text-muted">{pkg.artifacts.length}</span>
                      </Table.Cell>
                      <Table.Cell>{formatDateTime(pkg.started_at)}</Table.Cell>
                      <Table.Cell>{formatDuration(pkg.duration_ms)}</Table.Cell>
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
