import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Label, ListBox, Select, Skeleton } from "@heroui/react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import {
  useLinkIntegration,
  useTrackableAgencies,
} from "@/features/user-tracked-agencies/hooks/use-user-tracked-agencies";
import { getTrackableAgencyLabel } from "@/features/user-tracked-agencies/utils/integration-link.utils";
import { Routes } from "@/routes/routes";
import { CmsIntegrationDescription } from "./cms-integration-description";

type ConnectionAgencyLinkFormProps = {
  connectionId: string;
  disabled?: boolean;
  showDescription?: boolean;
  onLinked?: () => void;
};

export function ConnectionAgencyLinkForm({
  connectionId,
  disabled = false,
  showDescription = true,
  onLinked,
}: ConnectionAgencyLinkFormProps) {
  const { data, isPending: agenciesPending } = useTrackableAgencies({ page: 1, limit: 100 });
  const linkIntegration = useLinkIntegration();
  const [selectedAgencyId, setSelectedAgencyId] = useState<string | null>(null);

  const linkableAgencies = useMemo(
    () =>
      (data?.data ?? []).filter(
        (agency) =>
          agency.is_enabled &&
          agency.is_tracked &&
          !agency.tracking_prefs?.user_integration_id,
      ),
    [data?.data],
  );

  const agencyOptions = linkableAgencies.map((agency) => ({
    id: agency.id,
    label: getTrackableAgencyLabel(agency),
  }));

  const isPending = agenciesPending || linkIntegration.isPending;

  const handleLink = () => {
    if (!selectedAgencyId) {
      return;
    }

    linkIntegration.mutate(
      {
        agencyId: selectedAgencyId,
        payload: { user_integration_id: connectionId },
      },
      {
        onSuccess: () => {
          onLinked?.();
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {showDescription ? <CmsIntegrationDescription context="connection" /> : null}

      {agenciesPending ? (
        <Skeleton className="h-10 w-full rounded-lg" />
      ) : linkableAgencies.length === 0 ? (
        <p className="text-sm text-muted">
          Track an agency on{" "}
          <Link to={Routes.dashboard.agencies} className="text-accent hover:underline">
            Agencies
          </Link>{" "}
          before linking this connection.
        </p>
      ) : (
        <>
          <Select
            selectedKey={selectedAgencyId ?? undefined}
            isDisabled={disabled || isPending}
            onSelectionChange={(key) => setSelectedAgencyId(String(key))}
            className="w-full"
          >
            <Label>Tracked agency</Label>
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {agencyOptions.map((option) => (
                  <ListBox.Item key={option.id} id={option.id}>
                    {option.label}
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>

          <div className="flex items-center justify-between gap-2">
            <Link
              to={Routes.dashboard.agencies}
              className="text-xs text-accent hover:underline"
            >
              Manage agencies
            </Link>
            <ActionButtonWithPending
              size="sm"
              onPress={handleLink}
              isDisabled={disabled || isPending || !selectedAgencyId}
              isPending={linkIntegration.isPending}
            >
              Link integration
            </ActionButtonWithPending>
          </div>
        </>
      )}
    </div>
  );
}
