import {
  CostOperationTypes,
  type CostOperationType,
} from "@/features/cost-logs/interfaces/cost-logs.interfaces";

export const CostOperationTypeFilterOptions: { id: CostOperationType | "all"; label: string }[] = [
  { id: "all", label: "All operations" },
  { id: CostOperationTypes.NORMALIZATION, label: "Normalization" },
  { id: CostOperationTypes.TITLE_GENERATION, label: "Title generation" },
  { id: CostOperationTypes.TRANSLATION, label: "Translation" },
  { id: CostOperationTypes.DEWATERMARK, label: "Dewatermark" },
  { id: CostOperationTypes.OTHER, label: "Other" },
];
