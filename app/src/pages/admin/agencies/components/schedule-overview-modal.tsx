import { useMemo, useState } from "react";
import { Button, Modal, Tabs, useOverlayState } from "@heroui/react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { useAgenciesScheduleOverview } from "@/features/agencies/hooks/use-agencies";
import type { AgencyScheduleOverviewItem } from "@/features/agencies/interfaces/agencies.interfaces";
import { AgencyScheduleRow } from "./agency-schedule-row";
import { AgencyScheduleVisual } from "./agency-schedule-visual";

type ScheduleModalTab = "agencies" | "visual";
type PropertyCountSort = "desc" | "asc" | null;

// Stable reference so useMemo below doesn't see a "new" array (and recompute)
// on every render while the query has no data yet.
const EMPTY_AGENCIES: AgencyScheduleOverviewItem[] = [];

// none -> most properties first -> fewest first -> back to the server's own
// (alphabetical) order, so clicking through always returns to a known state.
function nextPropertyCountSort(current: PropertyCountSort): PropertyCountSort {
  if (current === null) return "desc";
  if (current === "desc") return "asc";
  return null;
}

export function ScheduleOverviewModal({ state }: { state: ReturnType<typeof useOverlayState> }) {
  const [tab, setTab] = useState<ScheduleModalTab>("agencies");
  const [propertyCountSort, setPropertyCountSort] = useState<PropertyCountSort>(null);
  const { data, isPending } = useAgenciesScheduleOverview({ enabled: state.isOpen });
  const agencies = data ?? EMPTY_AGENCIES;

  const sortedAgencies = useMemo(() => {
    if (!propertyCountSort) return agencies;
    const direction = propertyCountSort === "asc" ? 1 : -1;
    return [...agencies].sort(
      (a, b) => (a.user_properties_count - b.user_properties_count) * direction,
    );
  }, [agencies, propertyCountSort]);

  return (
    <Modal state={state}>
      <Modal.Backdrop isDismissable>
        <Modal.Container size="lg">
          <Modal.Dialog className="max-w-5xl">
            <Modal.Header>
              <Modal.Heading>Scraper schedules</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="max-h-[75vh] overflow-y-auto">
              <Tabs
                selectedKey={tab}
                onSelectionChange={(key) => setTab(key as ScheduleModalTab)}
              >
                <Tabs.ListContainer>
                  <Tabs.List aria-label="Schedule overview">
                    <Tabs.Tab id="agencies">
                      Agencies
                      <Tabs.Indicator />
                    </Tabs.Tab>
                    <Tabs.Tab id="visual">
                      Visual schedule
                      <Tabs.Indicator />
                    </Tabs.Tab>
                  </Tabs.List>
                </Tabs.ListContainer>

                <Tabs.Panel id="agencies" className="pt-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <p className="text-xs text-muted">
                      Tracked properties currently fed by each agency, and its crawl schedule.
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "shrink-0 gap-1.5 px-2",
                        propertyCountSort && "text-accent",
                      )}
                      aria-label={
                        propertyCountSort === "desc"
                          ? "Sorted by tracked properties, most first — click to sort fewest first"
                          : propertyCountSort === "asc"
                            ? "Sorted by tracked properties, fewest first — click to clear sort"
                            : "Sort by tracked properties"
                      }
                      onPress={() => setPropertyCountSort(nextPropertyCountSort)}
                    >
                      {propertyCountSort === "desc" ? (
                        <ArrowDown className="size-3.5" />
                      ) : propertyCountSort === "asc" ? (
                        <ArrowUp className="size-3.5" />
                      ) : (
                        <ArrowUpDown className="size-3.5" />
                      )}
                      Tracked properties
                    </Button>
                  </div>
                  {isPending ? (
                    <TableSkeleton rows={6} columns={3} />
                  ) : sortedAgencies.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted">
                      No agencies found.
                    </div>
                  ) : (
                    <div className="rounded-lg border border-border overflow-hidden">
                      {sortedAgencies.map((agency) => (
                        <AgencyScheduleRow key={agency.id} agency={agency} />
                      ))}
                    </div>
                  )}
                </Tabs.Panel>

                <Tabs.Panel id="visual" className="pt-4">
                  {isPending ? (
                    <TableSkeleton rows={6} columns={3} />
                  ) : (
                    <AgencyScheduleVisual agencies={agencies} />
                  )}
                </Tabs.Panel>
              </Tabs>
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
