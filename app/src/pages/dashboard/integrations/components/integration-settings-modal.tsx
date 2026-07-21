import { useEffect, useState } from "react";
import { FieldError, Form, Label, Modal, TextArea, useOverlayState } from "@heroui/react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { getIntegrationTypeLabel } from "@/config/constants/dropdowns/integration-type-form.options";
import { IntegrationTypes } from "@/features/integration-targets/interfaces/integration-targets.interfaces";
import type { AvailableIntegrationTarget } from "@/features/user-integrations/interfaces/user-integrations.interfaces";
import {
  useUpdateUserIntegrationSettings,
  useUserIntegrationSettings,
} from "@/features/user-integrations/hooks/use-user-integrations";
import { EstateWebPushSitesSettingsForm } from "./estateweb-push-sites-settings-form";

function parseSettingsInput(value: string): Record<string, unknown> | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return {};
  }

  const parsed = JSON.parse(trimmed);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }

  return parsed as Record<string, unknown>;
}

interface IntegrationSettingsModalProps {
  state: ReturnType<typeof useOverlayState>;
  target: AvailableIntegrationTarget | null;
}

export function IntegrationSettingsModal({ state, target }: IntegrationSettingsModalProps) {
  const isEstateWeb = target?.integration_type === IntegrationTypes.ESTATEWEB;
  const { data: settings, isPending: settingsPending } = useUserIntegrationSettings(
    !isEstateWeb ? target?.id : undefined,
  );
  const updateSettings = useUpdateUserIntegrationSettings();

  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!state.isOpen) {
      return;
    }
    setValue(settings?.settings ? JSON.stringify(settings.settings, null, 2) : "");
    setError(null);
  }, [state.isOpen, settings]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!target) {
      return;
    }

    let parsed: Record<string, unknown> | null;
    try {
      parsed = parseSettingsInput(value);
    } catch {
      setError("Must be valid JSON");
      return;
    }

    if (parsed === null) {
      setError("Must be a JSON object");
      return;
    }

    updateSettings.mutate(
      { targetId: target.id, payload: { settings: parsed } },
      { onSuccess: () => state.close() },
    );
  };

  return (
    <Modal state={state}>
      <Modal.Backdrop isDismissable={!updateSettings.isPending}>
        <Modal.Container>
          <Modal.Dialog className="max-w-lg">
            <Modal.Header>
              <Modal.Heading>
                {target
                  ? `${getIntegrationTypeLabel(target.integration_type)} configuration`
                  : "Configuration"}
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              {isEstateWeb && target ? (
                <EstateWebPushSitesSettingsForm targetId={target.id} onClose={state.close} />
              ) : (
                <Form onSubmit={handleSubmit} className="grid gap-4">
                  <p className="text-sm text-muted">
                    Shared by every connected account for this integration — set once, applies to
                    all.
                  </p>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="integration-settings-json">Configuration (JSON)</Label>
                    <TextArea
                      id="integration-settings-json"
                      value={value}
                      onChange={(event) => {
                        setValue(event.target.value);
                        setError(null);
                      }}
                      rows={8}
                      placeholder="{}"
                      disabled={settingsPending}
                    />
                    {error && <FieldError>{error}</FieldError>}
                  </div>
                  <div className="flex justify-end gap-2">
                    <ActionButtonWithPending
                      type="button"
                      variant="secondary"
                      onPress={state.close}
                      isDisabled={updateSettings.isPending}
                    >
                      Cancel
                    </ActionButtonWithPending>
                    <ActionButtonWithPending type="submit" isPending={updateSettings.isPending}>
                      Save
                    </ActionButtonWithPending>
                  </div>
                </Form>
              )}
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
