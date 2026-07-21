import { useEffect, useState } from "react";
import { FieldError, Form, Label, Modal, TextArea, useOverlayState } from "@heroui/react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import {
  useIntegrationTargetUserSettings,
  useUpdateIntegrationTargetUserSettings,
} from "@/features/integration-targets/hooks/use-integration-targets";

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

interface IntegrationTargetSettingsModalProps {
  state: ReturnType<typeof useOverlayState>;
  targetId: string;
  userId: string | null;
  userLabel?: string | null;
}

export function IntegrationTargetSettingsModal({
  state,
  targetId,
  userId,
  userLabel,
}: IntegrationTargetSettingsModalProps) {
  const { data: settings, isPending: settingsPending } = useIntegrationTargetUserSettings(
    targetId,
    userId ?? undefined,
  );
  const updateSettings = useUpdateIntegrationTargetUserSettings();

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
    if (!userId) {
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
      { targetId, userId, payload: { settings: parsed } },
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
                {userLabel ? `Configuration for ${userLabel}` : "Configuration"}
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <Form onSubmit={handleSubmit} className="grid gap-4">
                <p className="text-sm text-muted">
                  Shared by every connected account this user has for this integration target.
                </p>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="admin-integration-settings-json">Configuration (JSON)</Label>
                  <TextArea
                    id="admin-integration-settings-json"
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
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
