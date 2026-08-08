export type AgencyTrackingColumnId =
  | "agency"
  | "track"
  | "new"
  | "updated"
  | "removed"
  | "auto_crm"
  | "content_changes_only"
  | "watermark"
  | "publishing";

export const AgencyTrackingColumnDescriptionOptions: {
  id: AgencyTrackingColumnId;
  label: string;
  description: string;
}[] = [
  {
    id: "agency",
    label: "Agency",
    description: "Source website whose listings you can follow.",
  },
  {
    id: "track",
    label: "Track",
    description: "Turn tracking on or off for this agency.",
  },
  {
    id: "new",
    label: "New",
    description: "Create listings in your CRM when new ones appear.",
  },
  {
    id: "updated",
    label: "Updated",
    description: "Handle changes when an existing listing is modified.",
  },
  {
    id: "removed",
    label: "Removed",
    description: "Handle listings that disappear from the agency site.",
  },
  {
    id: "auto_crm",
    label: "Auto CRM",
    description: "Push updates to CMS automatically.",
  },
  {
    id: "content_changes_only",
    label: "Content changes only",
    description:
      "Only push CRM updates when title, price, or URL actually change.",
  },
  {
    id: "watermark",
    label: "Watermark",
    description: "Remove watermarks from listing photos before publishing.",
  },
  {
    id: "publishing",
    label: "Publishing",
    description: "Configure AI titles and content publishing for this agency.",
  },
];

export function getAgencyTrackingColumnLabel(
  id: AgencyTrackingColumnId,
): string {
  return (
    AgencyTrackingColumnDescriptionOptions.find((option) => option.id === id)
      ?.label ?? id
  );
}

export function getAgencyTrackingColumnDescription(
  id: AgencyTrackingColumnId,
): string {
  return (
    AgencyTrackingColumnDescriptionOptions.find((option) => option.id === id)
      ?.description ?? ""
  );
}
