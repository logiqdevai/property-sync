import type {
  CmsSyncOperationResult,
  CmsSyncRunResponse,
} from "@/features/cms-sync-runs/interfaces/cms-sync-runs.interfaces";

export function getFailedCmsSyncOperations(
  response: CmsSyncRunResponse | null | undefined,
): CmsSyncOperationResult[] {
  if (!response?.operation_results || !Array.isArray(response.operation_results)) {
    return [];
  }

  return response.operation_results.filter((op) => op && op.success === false);
}
