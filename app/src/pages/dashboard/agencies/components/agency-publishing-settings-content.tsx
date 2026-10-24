import { AppConfig } from "@/config/constants/app-config";
import { RoleGate } from "@/components/providers/role-gate";
import { TrackerAdminOptionsPanel } from "@/components/ui/tracker-admin-options-panel";
import { RoleTypes } from "@/features/user/interfaces/user.interface";
import type {
  TrackAgencyPayload,
  TrackableAgency,
  TrackingPrefs,
} from "@/features/user-tracked-agencies/interfaces/user-tracked-agencies.interfaces";
import { TrackedAgencyIntegrationLink } from "@/pages/dashboard/components/tracked-agency-integration-link";
import { Accordion } from "@heroui/react";
import { ContentPublishingPanel } from "./content-publishing-panel";

type AgencyPublishingSettingsContentProps = {
  agency: Pick<TrackableAgency, "id" | "content_language">;
  /** Needed for the admin options and CMS integration sections. */
  prefs?: TrackingPrefs | null;
  disabled?: boolean;
  onAdminSettingsChange?: (payload: TrackAgencyPayload) => void;
  showAdminOptions?: boolean;
  showCmsIntegration?: boolean;
  /** Admin onboarding: edit content publishing on these users' trackers instead of the caller's. */
  contentPublishingUserIds?: string[];
  /** Expand the content publishing accordion initially. */
  contentPublishingExpanded?: boolean;
};

export function AgencyPublishingSettingsContent({
  agency,
  prefs,
  disabled = false,
  onAdminSettingsChange,
  showAdminOptions = true,
  showCmsIntegration = true,
  contentPublishingUserIds,
  contentPublishingExpanded = false,
}: AgencyPublishingSettingsContentProps) {
  const adminPanel =
    showAdminOptions && prefs && onAdminSettingsChange ? (
      <TrackerAdminOptionsPanel
        accordionId={`${agency.id}-admin-options`}
        values={{
          concurrent_insertions: prefs.concurrent_insertions ?? 1,
          insertion_interval_seconds: prefs.insertion_interval_seconds ?? 1,
          max_properties: prefs.max_properties ?? null,
          text_truncate_pieces: prefs.text_truncate_pieces ?? [],
        }}
        disabled={disabled}
        onAdminSettingsChange={onAdminSettingsChange}
      />
    ) : null;

  return (
    <>
      {adminPanel ? (
        AppConfig.tracked_agency_admin_options_visible ? (
          adminPanel
        ) : (
          <RoleGate roles={[RoleTypes.ADMIN]}>{adminPanel}</RoleGate>
        )
      ) : null}

      {showCmsIntegration && prefs ? (
        <Accordion defaultExpandedKeys={[]} hideSeparator>
          <Accordion.Item id={`${agency.id}-cms-integration`}>
            <Accordion.Heading>
              <Accordion.Trigger className="text-sm font-medium text-foreground">
                CMS integration
                <Accordion.Indicator />
              </Accordion.Trigger>
            </Accordion.Heading>
            <Accordion.Panel>
              <Accordion.Body>
                <TrackedAgencyIntegrationLink
                  agencyId={agency.id}
                  linkedIntegrationId={prefs.user_integration_id}
                  linkedClientId={prefs.integration_client_id}
                  disabled={disabled}
                  hideHeading
                  className="flex flex-col gap-3 pt-1"
                />
              </Accordion.Body>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      ) : null}

      <Accordion
        defaultExpandedKeys={
          contentPublishingExpanded ? [`${agency.id}-content-publishing`] : []
        }
        hideSeparator
      >
        <Accordion.Item id={`${agency.id}-content-publishing`}>
          <Accordion.Heading>
            <Accordion.Trigger className="text-sm font-medium text-foreground">
              Content publishing
              <Accordion.Indicator />
            </Accordion.Trigger>
          </Accordion.Heading>
          <Accordion.Panel>
            <Accordion.Body>
              <div className="pt-1">
                <ContentPublishingPanel
                  agencyId={agency.id}
                  sourceLanguage={agency.content_language}
                  userIds={contentPublishingUserIds}
                  embedded
                />
              </div>
            </Accordion.Body>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </>
  );
}
