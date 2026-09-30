import { useState } from "react";
import { Modal, Tabs, useOverlayState } from "@heroui/react";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { useAgenciesScheduleOverview } from "@/features/agencies/hooks/use-agencies";
import { AgencyScheduleRow } from "./agency-schedule-row";
import { AgencyScheduleVisual } from "./agency-schedule-visual";

type ScheduleModalTab = "agencies" | "visual";

export function ScheduleOverviewModal({ state }: { state: ReturnType<typeof useOverlayState> }) {
  const [tab, setTab] = useState<ScheduleModalTab>("agencies");
  const { data, isPending } = useAgenciesScheduleOverview({ enabled: state.isOpen });
  const agencies = data ?? [];

  return (
    <Modal state={state}>
      <Modal.Backdrop isDismissable>
        <Modal.Container size="lg">
          <Modal.Dialog>
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
                  <p className="text-xs text-muted mb-3">
                    Tracked properties currently fed by each agency, and its crawl schedule.
                  </p>
                  {isPending ? (
                    <TableSkeleton rows={6} columns={3} />
                  ) : agencies.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted">
                      No agencies found.
                    </div>
                  ) : (
                    <div className="rounded-lg border border-border overflow-hidden">
                      {agencies.map((agency) => (
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
