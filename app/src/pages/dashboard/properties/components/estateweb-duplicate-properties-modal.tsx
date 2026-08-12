import { useEffect, useState } from "react";
import { ArrowLeft, Download } from "lucide-react";
import { Button, ListBox, Modal, Select, Table, useOverlayState } from "@heroui/react";
import { getCrmPropertyAppUrl } from "@/config/constants/crm-app-urls";
import { downloadTextFile } from "@/lib/download-text-file";
import {
  useEstateWebAdminIntegrations,
  useEstateWebDuplicateProperties,
} from "@/features/estateweb/hooks/use-estateweb";

export type EstateWebDuplicatePropertiesModalState = ReturnType<typeof useOverlayState>;

const NONE_SELECTED = "";

function integrationLabel(integration: { userEmail: string; email: string | null }) {
  return integration.email ? `${integration.userEmail} (${integration.email})` : integration.userEmail;
}

function sanitizeFilenamePart(value: string) {
  return value.replace(/[^a-z0-9.\-_]+/gi, "-");
}

export function EstateWebDuplicatePropertiesModal({
  state,
}: {
  state: EstateWebDuplicatePropertiesModalState;
}) {
  const [selectedIntegrationId, setSelectedIntegrationId] = useState<string>(NONE_SELECTED);

  useEffect(() => {
    if (!state.isOpen) {
      setSelectedIntegrationId(NONE_SELECTED);
    }
  }, [state.isOpen]);

  const { data: integrations, isPending: integrationsPending } = useEstateWebAdminIntegrations(
    state.isOpen,
  );
  const hasSelection = selectedIntegrationId !== NONE_SELECTED;
  const {
    data: duplicates,
    isPending: duplicatesPending,
    isError,
    error,
  } = useEstateWebDuplicateProperties(
    hasSelection ? selectedIntegrationId : null,
    state.isOpen && hasSelection,
  );

  const selectedIntegration =
    integrations?.find((integration) => integration.id === selectedIntegrationId) ?? null;

  const rows = (duplicates ?? []).flatMap((group) =>
    group.listings.map((listing) => ({ code: group.code, id: listing.id })),
  );

  const handleDownload = () => {
    const lines = rows.map((row) => {
      const url = getCrmPropertyAppUrl(String(row.id)) ?? String(row.id);
      return `${url}   Κωδικός: ${row.code}`;
    });
    const integrationPart = sanitizeFilenamePart(
      selectedIntegration?.userEmail ?? selectedIntegrationId,
    );
    const datePart = new Date().toISOString().slice(0, 10);
    downloadTextFile(
      `estateweb-duplicates-${integrationPart}-${datePart}.txt`,
      lines.join("\n"),
    );
  };

  return (
    <Modal state={state}>
      <Modal.Backdrop isDismissable>
        <Modal.Container>
          <Modal.Dialog className="max-w-2xl">
            <Modal.Header>
              <Modal.Heading>Check CRM duplicates</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <div className="flex flex-col gap-4">
                {!hasSelection ? (
                  <>
                    <p className="text-sm text-muted">
                      Pick an EstateWeb connection to check for listings pushed there more than
                      once.
                    </p>
                    <Select
                      aria-label="Select EstateWeb integration"
                      selectedKey={selectedIntegrationId}
                      onSelectionChange={(key) => setSelectedIntegrationId(String(key))}
                      isDisabled={integrationsPending}
                    >
                      <Select.Trigger>
                        <Select.Value />
                        <Select.Indicator />
                      </Select.Trigger>
                      <Select.Popover>
                        <ListBox>
                          <ListBox.Item key={NONE_SELECTED} id={NONE_SELECTED}>
                            {integrationsPending ? "Loading…" : "Select an integration…"}
                          </ListBox.Item>
                          {(integrations ?? []).map((integration) => (
                            <ListBox.Item key={integration.id} id={integration.id}>
                              {integrationLabel(integration)}
                            </ListBox.Item>
                          ))}
                        </ListBox>
                      </Select.Popover>
                    </Select>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm text-muted">
                        {selectedIntegration ? integrationLabel(selectedIntegration) : "Selected integration"}
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onPress={handleDownload}
                          isDisabled={rows.length === 0}
                        >
                          <Download className="size-4" />
                          Download .txt
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onPress={() => setSelectedIntegrationId(NONE_SELECTED)}
                        >
                          <ArrowLeft className="size-4" />
                          Change integration
                        </Button>
                      </div>
                    </div>

                    {duplicatesPending ? (
                      <p className="text-sm text-muted">Checking EstateWeb for duplicates…</p>
                    ) : isError ? (
                      <p className="text-sm text-danger">
                        {error instanceof Error ? error.message : "Failed to check for duplicates."}
                      </p>
                    ) : rows.length === 0 ? (
                      <p className="text-sm text-muted">No duplicate properties found.</p>
                    ) : (
                      <div className="rounded-xl border border-border overflow-y-auto max-h-96">
                        <Table>
                          <Table.ScrollContainer>
                            <Table.Content aria-label="Duplicate EstateWeb properties">
                              <Table.Header>
                                <Table.Column isRowHeader>EstateWeb property</Table.Column>
                                <Table.Column>Κωδικός</Table.Column>
                              </Table.Header>
                              <Table.Body>
                                {rows.map((row) => {
                                  const url = getCrmPropertyAppUrl(String(row.id));
                                  return (
                                    <Table.Row key={row.id} id={String(row.id)}>
                                      <Table.Cell>
                                        {url ? (
                                          <a
                                            href={url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="font-mono text-sm text-accent hover:underline break-all"
                                          >
                                            {url}
                                          </a>
                                        ) : (
                                          <span className="font-mono text-sm text-foreground">
                                            {row.id}
                                          </span>
                                        )}
                                      </Table.Cell>
                                      <Table.Cell>
                                        <span className="text-sm text-foreground">{row.code}</span>
                                      </Table.Cell>
                                    </Table.Row>
                                  );
                                })}
                              </Table.Body>
                            </Table.Content>
                          </Table.ScrollContainer>
                        </Table>
                      </div>
                    )}
                  </>
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
