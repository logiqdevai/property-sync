import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Copy, Download } from "lucide-react";
import { Button, ListBox, Modal, Select, Table, useOverlayState } from "@heroui/react";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { CopyIconButton } from "@/components/ui/copy-icon-button";
import { getCrmPropertyAppUrl } from "@/config/constants/crm-app-urls";
import { useMergeProperties } from "@/features/properties/hooks/use-properties";
import type {
  EstateWebDuplicatePropertyGroup,
  EstateWebDuplicatePropertyListing,
} from "@/features/estateweb/interfaces/estateweb.interfaces";
import {
  useEstateWebAdminIntegrations,
  useEstateWebDuplicateProperties,
} from "@/features/estateweb/hooks/use-estateweb";
import { downloadTextFile } from "@/lib/download-text-file";

export type EstateWebDuplicatePropertiesModalState = ReturnType<typeof useOverlayState>;

const NONE_SELECTED = "";

const CopyIdFieldOptions = [
  { id: "user_property_id", label: "User property IDs" },
  { id: "internal_id", label: "Internal IDs" },
  { id: "property_id", label: "Property IDs" },
] as const;

type CopyIdField = (typeof CopyIdFieldOptions)[number]["id"];

function integrationLabel(integration: { userEmail: string; email: string | null }) {
  return integration.email ? `${integration.userEmail} (${integration.email})` : integration.userEmail;
}

function sanitizeFilenamePart(value: string) {
  return value.replace(/[^a-z0-9.\-_]+/gi, "-");
}

function getCopyFieldValue(
  listing: EstateWebDuplicatePropertyListing,
  field: CopyIdField,
): string | null {
  return listing[field];
}

function getGroupPropertyIds(group: EstateWebDuplicatePropertyGroup): string[] {
  return [
    ...new Set(
      group.listings
        .map((listing) => listing.canonical_property_id)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
}

function canMergeGroup(group: EstateWebDuplicatePropertyGroup): boolean {
  return getGroupPropertyIds(group).length >= 2;
}

type DuplicateTableRow = EstateWebDuplicatePropertyListing & {
  code: string;
  groupCount: number;
  isFirstInGroup: boolean;
  group: EstateWebDuplicatePropertyGroup;
};

export function EstateWebDuplicatePropertiesModal({
  state,
}: {
  state: EstateWebDuplicatePropertiesModalState;
}) {
  const queryClient = useQueryClient();
  const mergeProperties = useMergeProperties();
  const mergeGroupConfirm = useOverlayState();
  const [selectedIntegrationId, setSelectedIntegrationId] = useState<string>(NONE_SELECTED);
  const [copyIdField, setCopyIdField] = useState<CopyIdField>("user_property_id");
  const [pendingMergeGroup, setPendingMergeGroup] =
    useState<EstateWebDuplicatePropertyGroup | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!state.isOpen) {
      setSelectedIntegrationId(NONE_SELECTED);
      setCopyIdField("user_property_id");
      setPendingMergeGroup(null);
      setCopyFeedback(null);
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

  const groups = duplicates ?? [];

  const stats = useMemo(() => {
    const groupCount = groups.length;
    const listingCount = groups.reduce((sum, group) => sum + group.count, 0);
    const extraCopies = groups.reduce((sum, group) => sum + group.count - 1, 0);
    const mergeableGroups = groups.filter(canMergeGroup).length;
    return { groupCount, listingCount, extraCopies, mergeableGroups };
  }, [groups]);

  const rows = useMemo<DuplicateTableRow[]>(
    () =>
      groups.flatMap((group) =>
        group.listings.map((listing, index) => ({
          ...listing,
          code: group.code,
          groupCount: group.count,
          isFirstInGroup: index === 0,
          group,
        })),
      ),
    [groups],
  );

  const copyValues = useMemo(() => {
    const values = rows
      .map((row) => getCopyFieldValue(row, copyIdField))
      .filter((value): value is string => Boolean(value));
    return [...new Set(values)];
  }, [rows, copyIdField]);

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

  const handleCopyIds = async () => {
    if (copyValues.length === 0) {
      setCopyFeedback("No IDs to copy for this field.");
      return;
    }

    try {
      await navigator.clipboard.writeText(copyValues.join("\n"));
      setCopyFeedback(`Copied ${copyValues.length} ${CopyIdFieldOptions.find((option) => option.id === copyIdField)?.label.toLowerCase() ?? "IDs"}.`);
    } catch {
      setCopyFeedback("Could not copy to clipboard.");
    }
  };

  const invalidateAfterMerge = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["properties"] }),
      queryClient.invalidateQueries({ queryKey: ["userProperties"] }),
      queryClient.invalidateQueries({ queryKey: ["estateweb", "admin", "duplicates"] }),
    ]);
  };

  const handleMergeGroup = async () => {
    if (!pendingMergeGroup) return;
    const propertyIds = getGroupPropertyIds(pendingMergeGroup);
    if (propertyIds.length < 2) return;

    await mergeProperties.mutateAsync({ property_ids: propertyIds });
    await invalidateAfterMerge();
    setPendingMergeGroup(null);
  };

  const requestMergeGroup = (group: EstateWebDuplicatePropertyGroup) => {
    setPendingMergeGroup(group);
    mergeGroupConfirm.open();
  };

  return (
    <>
      <Modal state={state}>
        <Modal.Backdrop isDismissable={!mergeProperties.isPending}>
          <Modal.Container>
            <Modal.Dialog className="w-full max-w-5xl min-w-0">
              <Modal.Header>
                <Modal.Heading>Check CRM duplicates</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="min-w-0">
                <div className="flex min-w-0 flex-col gap-4">
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
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            isIconOnly
                            aria-label="Change integration"
                            onPress={() => setSelectedIntegrationId(NONE_SELECTED)}
                          >
                            <ArrowLeft className="size-4" />
                          </Button>
                          <p className="min-w-0 truncate text-sm text-muted">
                            {selectedIntegration
                              ? integrationLabel(selectedIntegration)
                              : "Selected integration"}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onPress={handleDownload}
                          isDisabled={rows.length === 0}
                        >
                          <Download className="size-4" />
                          Download .txt
                        </Button>
                      </div>

                      {duplicatesPending ? (
                        <p className="text-sm text-muted">Checking EstateWeb for duplicates…</p>
                      ) : isError ? (
                        <p className="text-sm text-danger">
                          {error instanceof Error
                            ? error.message
                            : "Failed to check for duplicates."}
                        </p>
                      ) : rows.length === 0 ? (
                        <p className="text-sm text-muted">No duplicate properties found.</p>
                      ) : (
                        <>
                          <div className="rounded-xl border border-border bg-surface-secondary px-4 py-3 text-sm text-foreground">
                            <p>
                              {stats.groupCount} duplicate{" "}
                              {stats.groupCount === 1 ? "code" : "codes"} · {stats.listingCount}{" "}
                              listings · {stats.extraCopies} extra{" "}
                              {stats.extraCopies === 1 ? "copy" : "copies"}
                            </p>
                            {stats.mergeableGroups > 0 ? (
                              <p className="mt-1 text-muted">
                                {stats.mergeableGroups}{" "}
                                {stats.mergeableGroups === 1 ? "group" : "groups"} can be marked
                                together in Property Sync.
                              </p>
                            ) : null}
                          </div>

                          <div className="flex flex-wrap items-end gap-2">
                            <Select
                              aria-label="ID field to copy"
                              selectedKey={copyIdField}
                              onSelectionChange={(key) => {
                                setCopyIdField(key as CopyIdField);
                                setCopyFeedback(null);
                              }}
                              className="min-w-52"
                            >
                              <Select.Trigger>
                                <Select.Value />
                                <Select.Indicator />
                              </Select.Trigger>
                              <Select.Popover>
                                <ListBox>
                                  {CopyIdFieldOptions.map((option) => (
                                    <ListBox.Item key={option.id} id={option.id}>
                                      {option.label}
                                    </ListBox.Item>
                                  ))}
                                </ListBox>
                              </Select.Popover>
                            </Select>
                            <Button
                              size="sm"
                              variant="secondary"
                              onPress={handleCopyIds}
                              isDisabled={copyValues.length === 0}
                            >
                              <Copy className="size-4" />
                              Copy IDs
                            </Button>
                          </div>

                          {copyFeedback ? (
                            <p className="text-sm text-muted">{copyFeedback}</p>
                          ) : null}

                          <div className="min-w-0 max-h-96 overflow-hidden rounded-xl border border-border">
                            <Table>
                              <Table.ScrollContainer>
                                <Table.Content
                                  aria-label="Duplicate EstateWeb properties"
                                  className="min-w-max"
                                >
                                  <Table.Header>
                                    <Table.Column isRowHeader>Κωδικός</Table.Column>
                                    <Table.Column>Count</Table.Column>
                                    <Table.Column>EstateWeb property</Table.Column>
                                    <Table.Column>User property ID</Table.Column>
                                    <Table.Column>Internal ID</Table.Column>
                                    <Table.Column>Property ID</Table.Column>
                                    <Table.Column>Actions</Table.Column>
                                  </Table.Header>
                                  <Table.Body>
                                    {rows.map((row) => {
                                      const url = getCrmPropertyAppUrl(String(row.id));
                                      return (
                                        <Table.Row
                                          key={`${row.code}-${row.id}`}
                                          id={`${row.code}-${row.id}`}
                                        >
                                          <Table.Cell>
                                            <span className="font-mono text-sm text-foreground">
                                              {row.code}
                                            </span>
                                          </Table.Cell>
                                          <Table.Cell>
                                            {row.isFirstInGroup ? (
                                              <span className="tabular-nums text-sm text-muted">
                                                {row.groupCount}
                                              </span>
                                            ) : (
                                              <span className="text-muted">—</span>
                                            )}
                                          </Table.Cell>
                                          <Table.Cell className="max-w-48">
                                            {url ? (
                                              <a
                                                href={url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="font-mono text-sm text-accent hover:underline"
                                              >
                                                {row.id}
                                              </a>
                                            ) : (
                                              <span className="font-mono text-sm text-foreground">
                                                {row.id}
                                              </span>
                                            )}
                                          </Table.Cell>
                                          <Table.Cell className="max-w-40">
                                            {row.user_property_id ? (
                                              <div className="flex min-w-0 items-center gap-1">
                                                <span className="truncate font-mono text-xs text-foreground">
                                                  {row.user_property_id}
                                                </span>
                                                <CopyIconButton
                                                  value={row.user_property_id}
                                                  ariaLabel={`Copy user property ID ${row.user_property_id}`}
                                                />
                                              </div>
                                            ) : (
                                              <span className="text-sm text-muted">—</span>
                                            )}
                                          </Table.Cell>
                                          <Table.Cell className="max-w-36">
                                            {row.internal_id ? (
                                              <div className="flex min-w-0 items-center gap-1">
                                                <span className="truncate font-mono text-xs text-foreground">
                                                  {row.internal_id}
                                                </span>
                                                <CopyIconButton
                                                  value={row.internal_id}
                                                  ariaLabel={`Copy internal ID ${row.internal_id}`}
                                                />
                                              </div>
                                            ) : (
                                              <span className="text-sm text-muted">—</span>
                                            )}
                                          </Table.Cell>
                                          <Table.Cell className="max-w-40">
                                            {row.property_id ? (
                                              <div className="flex min-w-0 items-center gap-1">
                                                <span className="truncate font-mono text-xs text-foreground">
                                                  {row.property_id}
                                                </span>
                                                <CopyIconButton
                                                  value={row.property_id}
                                                  ariaLabel={`Copy property ID ${row.property_id}`}
                                                />
                                              </div>
                                            ) : (
                                              <span className="text-sm text-muted">—</span>
                                            )}
                                          </Table.Cell>
                                          <Table.Cell className="whitespace-nowrap">
                                            {row.isFirstInGroup ? (
                                              <Button
                                                size="sm"
                                                variant="secondary"
                                                onPress={() => requestMergeGroup(row.group)}
                                                isDisabled={
                                                  !canMergeGroup(row.group) ||
                                                  mergeProperties.isPending
                                                }
                                              >
                                                Mark group
                                              </Button>
                                            ) : null}
                                          </Table.Cell>
                                        </Table.Row>
                                      );
                                    })}
                                  </Table.Body>
                                </Table.Content>
                              </Table.ScrollContainer>
                            </Table>
                          </div>
                        </>
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

      <ConfirmationDialog
        state={mergeGroupConfirm}
        title="Mark duplicate group?"
        description={
          pendingMergeGroup
            ? `This will link ${getGroupPropertyIds(pendingMergeGroup).length} saved properties that share code "${pendingMergeGroup.code}" into one duplicate group.`
            : "This will link the selected saved properties into one duplicate group."
        }
        confirmLabel="Mark group"
        onConfirm={handleMergeGroup}
        isPending={mergeProperties.isPending}
      />
    </>
  );
}
