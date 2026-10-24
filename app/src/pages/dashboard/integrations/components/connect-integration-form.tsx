import { useEffect } from "react";
import { Form } from "@heroui/react";
import { useForm } from "react-hook-form";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import type { AvailableIntegrationTarget } from "@/features/user-integrations/interfaces/user-integrations.interfaces";
import {
  getConnectCredentialsSchema,
  mapConnectFormToPayload,
  type ConnectCredentialsFormValues,
} from "@/features/user-integrations/validation-schemas/user-integrations.schema";
import { integrationSupportsWebhookUrl } from "@/lib/integration-webhook-url";
import { RoleTypes } from "@/features/user/interfaces/user.interface";
import { useAuthStore } from "@/stores/auth";
import { IntegrationCredentialFields } from "./integration-credential-fields";

const VIEW_ONLY_INTEGRATION_MESSAGE =
  "View only — changes are disabled for this integration";

export type ConnectIntegrationPayload = ReturnType<typeof mapConnectFormToPayload>;

type ConnectIntegrationFormProps = {
  target: AvailableIntegrationTarget;
  isPending: boolean;
  onSubmit: (payload: ConnectIntegrationPayload) => void;
  onCancel?: () => void;
  cancelLabel?: string;
  submitLabel?: string;
};

export function ConnectIntegrationForm({
  target,
  isPending,
  onSubmit,
  onCancel,
  cancelLabel = "Cancel",
  submitLabel = "Connect",
}: ConnectIntegrationFormProps) {
  const role = useAuthStore((state) => state.role);
  const isAdmin = role === RoleTypes.ADMIN || role === RoleTypes.SUPER_ADMIN;
  const isReadOnly = !target.is_enabled && !isAdmin;

  const form = useForm<ConnectCredentialsFormValues>();

  useEffect(() => {
    form.reset({ auth_type: target.auth_type } as ConnectCredentialsFormValues);
  }, [target, form]);

  const submit = form.handleSubmit((values) => {
    const parsed = getConnectCredentialsSchema(
      target.auth_type,
      target.integration_type,
    ).parse({
      ...values,
      auth_type: target.auth_type,
    });

    onSubmit(mapConnectFormToPayload(target.id, parsed));
  });

  return (
    <Form onSubmit={submit} className="grid gap-4">
      {isReadOnly && <p className="text-sm text-muted">{VIEW_ONLY_INTEGRATION_MESSAGE}</p>}
      {integrationSupportsWebhookUrl(target.integration_type) ? (
        <p className="text-sm text-muted">
          Enter your API key first. After connecting you get a webhook URL to
          register in OpenAI before the signing secret.
        </p>
      ) : null}
      <IntegrationCredentialFields
        authType={target.auth_type}
        integrationType={target.integration_type}
        register={form.register}
        errors={form.formState.errors}
        isDisabled={isReadOnly}
      />
      <div className="flex justify-end gap-2">
        {onCancel ? (
          <ActionButtonWithPending
            type="button"
            variant="secondary"
            onPress={onCancel}
            isDisabled={isPending}
          >
            {cancelLabel}
          </ActionButtonWithPending>
        ) : null}
        <ActionButtonWithPending
          type="submit"
          isPending={isPending}
          isDisabled={isReadOnly}
        >
          {submitLabel}
        </ActionButtonWithPending>
      </div>
    </Form>
  );
}
