import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Checkbox, Label, ListBox, Modal, Select, Skeleton, useOverlayState } from "@heroui/react";
import { Check } from "lucide-react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { cn } from "@/lib/utils";
import { Routes } from "@/routes/routes";
import {
  useCreateAgency,
  useUpdateAgencyVisibility,
} from "@/features/agencies/hooks/use-agencies";
import {
  useAgencyTrackers,
  useConnectEstateWebForTracker,
  useSetCrmClientForTracker,
  useTrackAgencyUsers,
} from "@/features/agencies/hooks/use-agency-trackers";
import { searchCrmClientsForTracker } from "@/features/agencies/services/agencies.services";
import { toAgencyBlockHandlingPayload } from "@/features/agencies/validation-schemas/agencies.schema";
import type { AgencyTracker, SourceAgency } from "@/features/agencies/interfaces/agencies.interfaces";
import { useAdminUsers } from "@/features/users/hooks/use-admin-users";
import { useAvailableIntegrationTargets } from "@/features/user-integrations/hooks/use-user-integrations";
import { IntegrationTypes } from "@/features/integration-targets/interfaces/integration-targets.interfaces";
import { AgencyPublishingSettingsContent } from "@/pages/dashboard/agencies/components/agency-publishing-settings-content";
import { CmsIntegrationDescription } from "@/pages/dashboard/components/cms-integration-description";
import { IntegrationClientLookup } from "@/pages/dashboard/components/integration-client-lookup";
import { ConnectIntegrationForm } from "@/pages/dashboard/integrations/components/connect-integration-form";
import { AgencyForm } from "./agency-form";

const STEPS = [
  { id: 1, label: "Agency details" },
  { id: 2, label: "Users & publishing" },
  { id: 3, label: "EstateWeb CMS" },
] as const;

type WizardStep = (typeof STEPS)[number]["id"];

function WizardStepper({ current }: { current: WizardStep }) {
  return (
    <ol className="flex items-center gap-2">
      {STEPS.map((step, index) => {
        const isDone = step.id < current;
        const isCurrent = step.id === current;

        return (
          <li key={step.id} className="flex min-w-0 flex-1 items-center gap-2">
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium",
                isCurrent && "border-accent bg-accent text-accent-foreground",
                isDone && "border-success bg-success text-success-foreground",
                !isCurrent && !isDone && "border-border text-muted",
              )}
            >
              {isDone ? <Check className="size-3.5" /> : step.id}
            </span>
            <span
              className={cn(
                "hidden truncate text-sm sm:inline",
                isCurrent ? "font-medium text-foreground" : "text-muted",
              )}
            >
              {step.label}
            </span>
            {index < STEPS.length - 1 ? (
              <span className="h-px flex-1 bg-border" aria-hidden />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

type UsersAndPublishingStepProps = {
  agency: SourceAgency;
  trackers: AgencyTracker[];
  isLoadingTrackers: boolean;
};

function UsersAndPublishingStep({
  agency,
  trackers,
  isLoadingTrackers,
}: UsersAndPublishingStepProps) {
  const [selectedUsers, setSelectedUsers] = useState<Map<string, string>>(new Map());

  const { data: usersData, isPending: usersPending } = useAdminUsers({
    page: 1,
    limit: 100,
  });
  const updateVisibility = useUpdateAgencyVisibility();
  const trackUsers = useTrackAgencyUsers(agency.id);

  const isPending = updateVisibility.isPending || trackUsers.isPending;
  const hasTrackers = trackers.length > 0;

  const toggleUser = (id: string, email: string, isSelected: boolean) => {
    setSelectedUsers((prev) => {
      const next = new Map(prev);
      if (isSelected) {
        next.set(id, email);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const handleEnable = async () => {
    try {
      await updateVisibility.mutateAsync({
        id: agency.id,
        payload: { is_visible: true, is_enabled: true },
      });
      await trackUsers.mutateAsync([...selectedUsers.keys()]);
    } catch {
      // Both hooks already surface the failure as a toast.
    }
  };

  if (isLoadingTrackers) {
    return <Skeleton className="h-24 w-full rounded-lg" />;
  }

  if (hasTrackers) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">
          {agency.name} is enabled and tracked by{" "}
          <span className="text-foreground">
            {trackers.map((tracker) => tracker.email).join(", ")}
          </span>
          . Publishing settings below are saved for all of them.
        </p>
        <AgencyPublishingSettingsContent
          agency={agency}
          showAdminOptions={false}
          showCmsIntegration={false}
          contentPublishingUserIds={trackers.map((tracker) => tracker.user_id)}
          contentPublishingExpanded
        />
      </div>
    );
  }

  const users = usersData?.data ?? [];

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-surface-secondary p-4">
      <p className="text-sm text-foreground">
        Choose the users who should track {agency.name}. It becomes visible and trackable, then
        tracking is set up for each selected user.
      </p>
      <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
        {usersPending ? (
          <Skeleton className="h-16 w-full rounded-lg" />
        ) : users.length === 0 ? (
          <p className="text-sm text-muted">No users found.</p>
        ) : (
          users.map((user) => (
            <Checkbox
              key={user.id}
              isSelected={selectedUsers.has(user.id)}
              isDisabled={isPending}
              onChange={(isSelected) => toggleUser(user.id, user.email, isSelected)}
            >
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              <Checkbox.Content>
                <Label>{user.email}</Label>
              </Checkbox.Content>
            </Checkbox>
          ))
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted">{selectedUsers.size} selected</span>
        <ActionButtonWithPending
          onPress={handleEnable}
          isPending={isPending}
          isDisabled={selectedUsers.size === 0}
        >
          Enable &amp; track
        </ActionButtonWithPending>
      </div>
    </div>
  );
}

type TrackerEstateWebPanelProps = {
  agencyId: string;
  tracker: AgencyTracker;
};

/** One selected user: connect a new EstateWeb account, then pick the CRM client. */
function TrackerEstateWebPanel({ agencyId, tracker }: TrackerEstateWebPanelProps) {
  const { data: targets = [], isPending: targetsPending } = useAvailableIntegrationTargets();
  const connectEstateWeb = useConnectEstateWebForTracker(agencyId);
  const setCrmClient = useSetCrmClientForTracker(agencyId);
  const [clientIdInput, setClientIdInput] = useState(
    tracker.integration_client_id != null ? String(tracker.integration_client_id) : "",
  );

  useEffect(() => {
    setClientIdInput(
      tracker.integration_client_id != null ? String(tracker.integration_client_id) : "",
    );
  }, [tracker.integration_client_id]);

  const estatewebTarget = targets.find(
    (target) => target.integration_type === IntegrationTypes.ESTATEWEB,
  );

  const trimmed = clientIdInput.trim();
  const parsedClientId = trimmed === "" ? null : Number.parseInt(trimmed, 10);
  const clientIdValid =
    trimmed === "" || (Number.isFinite(parsedClientId) && (parsedClientId ?? 0) >= 1);
  const clientIdDirty = clientIdValid && parsedClientId !== tracker.integration_client_id;

  if (!tracker.user_integration_id) {
    return (
      <div className="flex flex-col gap-3">
        <CmsIntegrationDescription context="agency" />
        {targetsPending ? (
          <Skeleton className="h-24 w-full rounded-lg" />
        ) : estatewebTarget ? (
          <ConnectIntegrationForm
            target={estatewebTarget}
            isPending={connectEstateWeb.isPending}
            submitLabel="Connect & link"
            onSubmit={(payload) =>
              connectEstateWeb.mutate({ userId: tracker.user_id, payload })
            }
          />
        ) : (
          <p className="text-sm text-muted">
            EstateWeb CMS is not available as an integration target.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-foreground">
        Linked to {tracker.integration_label ?? "EstateWeb account"}
      </p>
      <IntegrationClientLookup
        disabled={setCrmClient.isPending}
        selectedClientId={parsedClientId}
        onSelect={(client) => setClientIdInput(String(client.id))}
        searchClients={(lastName) =>
          searchCrmClientsForTracker(agencyId, tracker.user_id, lastName)
        }
      />
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">CRM client ID</span>
        <span className="text-xs text-muted">
          Optional. EstateWeb contact id used for property notes (last name).
        </span>
        <input
          type="number"
          min={1}
          className="w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2"
          value={clientIdInput}
          disabled={setCrmClient.isPending}
          placeholder="e.g. 45831"
          onChange={(event) => setClientIdInput(event.target.value)}
        />
      </label>
      <div className="flex justify-end">
        <ActionButtonWithPending
          size="sm"
          isPending={setCrmClient.isPending}
          isDisabled={!clientIdDirty}
          onPress={() =>
            setCrmClient.mutate({ userId: tracker.user_id, clientId: parsedClientId })
          }
        >
          Save client ID
        </ActionButtonWithPending>
      </div>
    </div>
  );
}

type EstateWebStepProps = {
  agencyId: string;
  trackers: AgencyTracker[];
};

function EstateWebStep({ agencyId, trackers }: EstateWebStepProps) {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const activeTracker =
    trackers.find((tracker) => tracker.user_id === selectedUserId) ??
    trackers.find((tracker) => !tracker.user_integration_id) ??
    trackers[0];

  if (!activeTracker) {
    return (
      <p className="text-sm text-muted">
        Track the agency for at least one user in the previous step to connect EstateWeb.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Select
        aria-label="Tracked agency user"
        selectedKey={activeTracker.user_id}
        onSelectionChange={(key) => key && setSelectedUserId(String(key))}
        className="w-full"
      >
        <Label>Tracked agency</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {trackers.map((tracker) => (
              <ListBox.Item
                key={tracker.user_id}
                id={tracker.user_id}
                textValue={tracker.email}
              >
                {tracker.email}
                {tracker.user_integration_id ? " · linked" : ""}
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>

      <TrackerEstateWebPanel
        key={activeTracker.user_id}
        agencyId={agencyId}
        tracker={activeTracker}
      />
    </div>
  );
}

type NewAgencyWizardModalProps = {
  state: ReturnType<typeof useOverlayState>;
};

export function NewAgencyWizardModal({ state }: NewAgencyWizardModalProps) {
  const navigate = useNavigate();
  const createAgency = useCreateAgency();
  const [step, setStep] = useState<WizardStep>(1);
  const [createdAgency, setCreatedAgency] = useState<SourceAgency | null>(null);

  useEffect(() => {
    if (!state.isOpen) {
      setStep(1);
      setCreatedAgency(null);
    }
  }, [state.isOpen]);

  const { data: trackers = [], isPending: trackersPending } = useAgencyTrackers(
    createdAgency?.id ?? "",
    step >= 2,
  );

  const handleFinish = () => {
    const agencyId = createdAgency?.id;
    state.close();
    if (agencyId) {
      navigate(Routes.admin.agencies.detail(agencyId));
    }
  };

  return (
    <Modal state={state}>
      <Modal.Backdrop isDismissable={!createAgency.isPending}>
        <Modal.Container size="lg">
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading>New agency</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto">
              <WizardStepper current={step} />

              {step === 1 ? (
                <AgencyForm
                  submitLabel="Create & continue"
                  isPending={createAgency.isPending}
                  onCancel={state.close}
                  onSubmit={(values) => {
                    const blockHandling = toAgencyBlockHandlingPayload(values);
                    createAgency.mutate(
                      {
                        name: values.name,
                        base_url: values.base_url,
                        country: values.country,
                        city: values.city,
                        notes: values.notes,
                        content_language: values.content_language,
                        crawl_interval: values.crawl_interval,
                        ...(blockHandling.block_handling_wait_timeout_ms != null && {
                          block_handling_wait_timeout_ms:
                            blockHandling.block_handling_wait_timeout_ms,
                        }),
                        ...(blockHandling.block_handling_min_ready_body_length != null && {
                          block_handling_min_ready_body_length:
                            blockHandling.block_handling_min_ready_body_length,
                        }),
                        ...(blockHandling.block_rules.length > 0 && {
                          block_rules: blockHandling.block_rules,
                        }),
                      },
                      {
                        onSuccess: (agency) => {
                          setCreatedAgency(agency);
                          setStep(2);
                        },
                      },
                    );
                  }}
                />
              ) : null}

              {step === 2 && createdAgency ? (
                <UsersAndPublishingStep
                  agency={createdAgency}
                  trackers={trackers}
                  isLoadingTrackers={trackersPending}
                />
              ) : null}

              {step === 3 && createdAgency ? (
                <EstateWebStep agencyId={createdAgency.id} trackers={trackers} />
              ) : null}
            </Modal.Body>
            {step !== 1 ? (
              <Modal.Footer className="flex w-full items-center justify-between">
                <ActionButtonWithPending variant="secondary" onPress={handleFinish}>
                  Skip remaining steps
                </ActionButtonWithPending>
                {step === 2 ? (
                  <ActionButtonWithPending
                    onPress={() => setStep(3)}
                    isDisabled={trackers.length === 0}
                  >
                    Next
                  </ActionButtonWithPending>
                ) : (
                  <ActionButtonWithPending onPress={handleFinish}>Finish</ActionButtonWithPending>
                )}
              </Modal.Footer>
            ) : null}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
