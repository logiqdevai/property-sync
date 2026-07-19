import { Button, Modal, Table, useOverlayState } from "@heroui/react";
import type { CmsSyncRun } from "@/features/cms-sync-runs/interfaces/cms-sync-runs.interfaces";
import { getFailedCmsSyncOperations } from "@/features/cms-sync-runs/utils/parse-cms-sync-failures";

export type CmsSyncRunFailuresModalState = ReturnType<typeof useOverlayState>;

interface CmsSyncRunFailuresModalProps {
  state: CmsSyncRunFailuresModalState;
  run: CmsSyncRun | null;
}

export function CmsSyncRunFailuresModal({ state, run }: CmsSyncRunFailuresModalProps) {
  if (!run) return null;

  const failures = getFailedCmsSyncOperations(run.response);
  const agencyName = run.crawl_run?.source_agency?.name;

  return (
    <Modal state={state}>
      <Modal.Backdrop isDismissable>
        <Modal.Container>
          <Modal.Dialog className="max-w-3xl">
            <Modal.Header>
              <Modal.Heading>
                {agencyName ? `${agencyName} — failed properties` : "Failed properties"}
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <div className="flex flex-col gap-4">
                {run.error_message ? (
                  <p className="text-sm text-danger whitespace-pre-wrap break-words">
                    {run.error_message}
                  </p>
                ) : null}

                {failures.length === 0 ? (
                  <p className="text-sm text-muted">No failure details stored for this run.</p>
                ) : (
                  <div className="rounded-xl border border-border overflow-hidden max-h-96">
                    <Table>
                      <Table.ScrollContainer>
                        <Table.Content aria-label="Failed property insertions">
                          <Table.Header>
                            <Table.Column isRowHeader>Title</Table.Column>
                            <Table.Column>Operation</Table.Column>
                            <Table.Column>Reason</Table.Column>
                          </Table.Header>
                          <Table.Body>
                            {failures.map((failure) => (
                              <Table.Row
                                key={`${failure.user_property_id}-${failure.operation}`}
                                id={`${failure.user_property_id}-${failure.operation}`}
                              >
                                <Table.Cell>
                                  <span className="text-sm text-foreground">
                                    {failure.property_title || failure.user_property_id}
                                  </span>
                                </Table.Cell>
                                <Table.Cell>
                                  <span className="font-mono text-sm text-foreground">
                                    {failure.operation}
                                  </span>
                                </Table.Cell>
                                <Table.Cell>
                                  <span className="text-sm text-danger whitespace-pre-wrap break-words">
                                    {failure.error ?? "Unknown error"}
                                  </span>
                                </Table.Cell>
                              </Table.Row>
                            ))}
                          </Table.Body>
                        </Table.Content>
                      </Table.ScrollContainer>
                    </Table>
                  </div>
                )}
              </div>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" onPress={state.close}>
                Close
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
