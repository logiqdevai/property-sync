import {
  CmsSyncOperationTypes,
  type CmsSyncOperationType,
} from "@/features/cms-sync-runs/interfaces/cms-sync-runs.interfaces";

export const CmsSyncOperationFormOptions: {
  id: CmsSyncOperationType;
  label: string;
}[] = [
  { id: CmsSyncOperationTypes.CREATE, label: "Created" },
  { id: CmsSyncOperationTypes.UPDATE, label: "Updated" },
  { id: CmsSyncOperationTypes.REMOVE, label: "Removed" },
];

export function getCmsSyncOperationLabel(
  operation: CmsSyncOperationType | string,
  options?: { skipped_push?: boolean },
): string {
  if (options?.skipped_push) return "Linked";
  return (
    CmsSyncOperationFormOptions.find((option) => option.id === operation)
      ?.label ?? operation
  );
}
