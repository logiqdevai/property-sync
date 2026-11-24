import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Copy, Download } from "lucide-react";
import {
  Autocomplete,
  Button,
  ListBox,
  Modal,
  SearchField,
  Select,
  Table,
  useFilter,
  useOverlayState,
} from "@heroui/react";
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
  useEstateWebDuplicatePropertiesForIntegrations,
} from "@/features/estateweb/hooks/use-estateweb";
import { downloadTextFile } from "@/lib/download-text-file";

export type EstateWebDuplicatePropertiesModalState = ReturnType<typeof useOverlayState>;

// Copies the EstateWeb listing ids of the extra copies (everything except the listing
// linked to a saved property) -- the ones to delete in "Manage EstateWeb properties".
const CRM_EXTRA_COPY_IDS = "crm_extra_copy_ids";

const CopyIdFieldOptions = [
  { id: "user_property_id", label: "User property IDs" },
  { id: "internal_id", label: "Internal IDs" },
  { id: "property_id", label: "Property IDs" },
  { id: CRM_EXTRA_COPY_IDS, label: "EstateWeb IDs to delete (extra copies)" },
] as const;

type CopyIdField = (typeof CopyIdFieldOptions)[number]["id"];
type ListingCopyField = Exclude<CopyIdField, typeof CRM_EXTRA_COPY_IDS>;

function integrationLabel(integration: { userEmail: string; email: string | null }) {
  return integration.email ? `${integration.userEmail} (${integration.email})` : integration.userEmail;
}

function sanitizeFilenamePart(value: string) {
  return value.replace(/[^a-z0-9.\-_]+/gi, "-");
}

function getCopyFieldValue(
  listing: EstateWebDuplicatePropertyListing,
  field: ListingCopyField,
): string | null {
  return listing[field];
}

// The listing linked to a saved property is the keeper; every other listing sharing the
// code is an extra copy. A group with no linked listing has no safe keeper to pick, so it
// returns null and is left out rather than risking deleting every copy.
function getExtraCopyIds(group: EstateWebDuplicatePropertyGroup): string[] | null {
  if (!group.listings.some((listing) => listing.user_property_id)) return null;
  return group.listings
    .filter((listing) => !listing.user_property_id)
    .map((listing) => String(listing.id));
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

// A duplicate group tagged with the integration (EstateWeb account) it was found in:
// the same code or EstateWeb id can legitimately appear in two different accounts.
type IntegrationDuplicateGroup = EstateWebDuplicatePropertyGroup & {
  integrationId: string;
};

type DuplicateTableRow = EstateWebDuplicatePropertyListing & {
  code: string;
  groupCount: number;
  isFirstInGroup: boolean;
  group: IntegrationDuplicateGroup;
};

export function EstateWebDuplicatePropertiesModal({
  state,
}: {
  state: EstateWebDuplicatePropertiesModalState;
}) {
  const queryClient = useQueryClient();
  const mergeProperties = useMergeProperties();
  const mergeGroupConfirm = useOverlayState();
  const { contains } = useFilter({ sensitivity: "base" });
  // draftIds = what is ticked in the picker; checkedIds = what the results below are for
  // (empty = still on the picker step).
  const [draftIds, setDraftIds] = useState<string[]>([]);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [copyIdField, setCopyIdField] = useState<CopyIdField>("user_property_id");
  const [pendingMergeGroup, setPendingMergeGroup] =
    useState<IntegrationDuplicateGroup | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!state.isOpen) {
      setDraftIds([]);
      setCheckedIds([]);
      setCopyIdField("user_property_id");
      setPendingMergeGroup(null);
      setCopyFeedback(null);
    }
  }, [state.isOpen]);

  const { data: integrations, isPending: integrationsPending } = useEstateWebAdminIntegrations(
    state.isOpen,
  );
  const hasSelection = checkedIds.length > 0;
  const isMultiIntegration = checkedIds.length > 1;
  const duplicateQueries = useEstateWebDuplicatePropertiesForIntegrations(
    checkedIds,
    state.isOpen && hasSelection,
  );
  const duplicatesPending = duplicateQueries.some((query) => query.isPending);
  const failedQuery = duplicateQueries.find((query) => query.isError);
  const isError = Boolean(failedQuery);
  const error = failedQuery?.error;

  const checkedIntegrations = useMemo(
    () =>
      checkedIds.map(
        (id) => integrations?.find((integration) => integration.id === id) ?? null,
      ),
    [checkedIds, integrations],
  );

  // useQueries returns a new array every render, so key the memo on the data itself.
  const duplicatesKey = duplicateQueries.map((query) => query.dataUpdatedAt).join(",");
  const groups = useMemo<IntegrationDuplicateGroup[]>(
    () =>
      duplicateQueries.flatMap((query, index) =>
        (query.data ?? []).map((group) => ({ ...group, integrationId: checkedIds[index] })),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [duplicatesKey, checkedIds],
  );

  const integrationNameById = useMemo(
    () =>
      new Map(
        (integrations ?? []).map((integration) => [integration.id, integrationLabel(integration)]),
      ),
    [integrations],
  );

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

  const extraCopies = useMemo(() => {
    const ids: string[] = [];
    let skippedGroups = 0;
    for (const group of groups) {
      const groupIds = getExtraCopyIds(group);
      if (groupIds === null) {
        skippedGroups += 1;
        continue;
      }
      ids.push(...groupIds);
    }
    return { ids: [...new Set(ids)], skippedGroups };
  }, [groups]);

  // EstateWeb ids only mean something inside one account, and the result is pasted into a
  // single account's bulk delete tool, so that option exists only for a single integration.
  const copyFieldOptions = isMultiIntegration
    ? CopyIdFieldOptions.filter((option) => option.id !== CRM_EXTRA_COPY_IDS)
    : CopyIdFieldOptions;
  const activeCopyIdField: CopyIdField =
    isMultiIntegration && copyIdField === CRM_EXTRA_COPY_IDS ? "user_property_id" : copyIdField;
  const isCopyingExtraCopies = activeCopyIdField === CRM_EXTRA_COPY_IDS;

  const copyValues = useMemo(() => {
    if (activeCopyIdField === CRM_EXTRA_COPY_IDS) return extraCopies.ids;
    const values = rows
      .map((row) => getCopyFieldValue(row, activeCopyIdField))
      .filter((value): value is string => Boolean(value));
    return [...new Set(values)];
  }, [rows, activeCopyIdField, extraCopies]);

  const handleDownload = () => {
    const lines = rows.map((row) => {
      const url = getCrmPropertyAppUrl(String(row.id)) ?? String(row.id);
      const account = isMultiIntegration
        ? `   Account: ${integrationNameById.get(row.group.integrationId) ?? row.group.integrationId}`
        : "";
      return `${url}   Κωδικός: ${row.code}${account}`;
    });
    const integrationPart = isMultiIntegration
      ? `${checkedIds.length}-integrations`
      : sanitizeFilenamePart(checkedIntegrations[0]?.userEmail ?? checkedIds[0]);
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
      // Extra-copy ids are pasted into the bulk delete tool, which takes a comma-separated
      // list; the other fields keep one value per line.
      await navigator.clipboard.writeText(copyValues.join(isCopyingExtraCopies ? "," : "\n"));
      setCopyFeedback(`Copied ${copyValues.length} ${CopyIdFieldOptions.find((option) => option.id === activeCopyIdField)?.label.toLowerCase() ?? "IDs"}.`);
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

  const requestMergeGroup = (group: IntegrationDuplicateGroup) => {
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
                        Pick one or more EstateWeb connections to check for listings pushed there
                        more than once.
                      </p>
                      <Autocomplete
                        aria-label="Select EstateWeb integrations"
                        placeholder={integrationsPending ? "Loading…" : "Select integrations…"}
                        selectionMode="multiple"
                        value={draftIds}
                        onChange={(keys) => setDraftIds(keys.map(String))}
                        onClear={() => setDraftIds([])}
                        isDisabled={integrationsPending}
                        fullWidth
                      >
                        <Autocomplete.Trigger>
                          <Autocomplete.Value />
                          <Autocomplete.ClearButton />
                          <Autocomplete.Indicator />
                        </Autocomplete.Trigger>
                        <Autocomplete.Popover>
                          <Autocomplete.Filter filter={contains}>
                            <SearchField autoFocus name="integration-search" variant="secondary">
                              <SearchField.Group>
                                <SearchField.SearchIcon />
                                <SearchField.Input placeholder="Search by email…" />
                                <SearchField.ClearButton />
                              </SearchField.Group>
                            </SearchField>
                            <ListBox
                              renderEmptyState={() => (
                                <p className="px-3 py-2 text-sm text-muted">
                                  No integrations found.
                                </p>
                              )}
                            >
                              {(integrations ?? []).map((integration) => (
                                <ListBox.Item
                                  key={integration.id}
                                  id={integration.id}
                                  textValue={integrationLabel(integration)}
                                >
                                  {integrationLabel(integration)}
                                  <ListBox.ItemIndicator />
                                </ListBox.Item>
                              ))}
                            </ListBox>
                          </Autocomplete.Filter>
                        </Autocomplete.Popover>
                      </Autocomplete>
                      <div className="flex justify-end">
                        <Button
                          variant="primary"
                          onPress={() => setCheckedIds(draftIds)}
                          isDisabled={draftIds.length === 0}
                        >
                          {draftIds.length > 1
                            ? `Check ${draftIds.length} integrations`
                            : "Check duplicates"}
                        </Button>
                      </div>
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
                            onPress={() => setCheckedIds([])}
                          >
                            <ArrowLeft className="size-4" />
                          </Button>
                          <p className="min-w-0 truncate text-sm text-muted">
                            {isMultiIntegration
                              ? `${checkedIds.length} integrations`
                              : checkedIntegrations[0]
                                ? integrationLabel(checkedIntegrations[0])
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
                              selectedKey={activeCopyIdField}
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
                                  {copyFieldOptions.map((option) => (
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

                          {isCopyingExtraCopies ? (
                            <p className="text-sm text-muted">
                              {extraCopies.ids.length} extra{" "}
                              {extraCopies.ids.length === 1 ? "copy" : "copies"} to delete (the
                              listing linked to a saved property is always kept).
                              {extraCopies.skippedGroups > 0
                                ? ` ${extraCopies.skippedGroups} ${
                                    extraCopies.skippedGroups === 1 ? "code" : "codes"
                                  } skipped: no listing is linked to a saved property, so there is no safe copy to keep.`
                                : ""}
                            </p>
                          ) : null}

                          {copyFeedback ? (
                            <p className="text-sm text-muted">{copyFeedback}</p>
                          ) : null}

                          {/* overflow-auto, not overflow-hidden: with hidden, everything below the
                              first ~6 rows was clipped and unreachable (46 rows, 6 visible). */}
                          <div className="min-w-0 max-h-96 overflow-auto rounded-xl border border-border">
                            <Table>
                              <Table.ScrollContainer>
                                <Table.Content
                                  aria-label="Duplicate EstateWeb properties"
                                  className="min-w-max"
                                >
                                  <Table.Header>
                                    {isMultiIntegration ? (
                                      <Table.Column isRowHeader>Integration</Table.Column>
                                    ) : null}
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
                                          key={`${row.group.integrationId}-${row.code}-${row.id}`}
                                          id={`${row.group.integrationId}-${row.code}-${row.id}`}
                                        >
                                          {isMultiIntegration ? (
                                            <Table.Cell className="max-w-48">
                                              <span className="block truncate text-xs text-muted">
                                                {integrationNameById.get(row.group.integrationId) ??
                                                  row.group.integrationId}
                                              </span>
                                            </Table.Cell>
                                          ) : null}
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
