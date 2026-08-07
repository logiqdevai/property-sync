import { useState } from "react";
import { Button, Input, InputGroup, Label, FieldError } from "@heroui/react";
import { Check, Copy } from "lucide-react";
import type { UseFormRegister, UseFormSetValue, UseFormWatch } from "react-hook-form";
import {
  AuthTypes,
  IntegrationTypes,
  isAiIntegrationType,
  type AuthType,
  type IntegrationType,
} from "@/features/integration-targets/interfaces/integration-targets.interfaces";
import type { MaskedCredentialValues } from "@/features/user-integrations/validation-schemas/user-integrations.schema";
import { PasswordInput } from "@/components/ui/password-input";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import {
  getIntegrationWebhookUrl,
  integrationSupportsWebhookUrl,
} from "@/lib/integration-webhook-url";

type CredentialFieldErrors = {
  email?: { message?: string };
  username?: { message?: string };
  password?: { message?: string };
  api_key_secret?: { message?: string };
  webhook_key?: { message?: string };
  configJson?: { message?: string };
};

interface IntegrationCredentialFieldsProps {
  authType: AuthType;
  integrationType?: IntegrationType;
  connectionId?: string;
  register: UseFormRegister<any>;
  watch?: UseFormWatch<any>;
  setValue?: UseFormSetValue<any>;
  errors?: CredentialFieldErrors;
  mode?: "create" | "edit";
  isDisabled?: boolean;
  maskedCredentials?: MaskedCredentialValues;
  webhookOnly?: boolean;
  canRevealPassword?: boolean;
  hasPassword?: boolean;
  onRevealPassword?: () => Promise<string | null>;
}

export function IntegrationCredentialFields({
  authType,
  integrationType,
  connectionId,
  register,
  watch,
  setValue,
  errors = {},
  mode = "create",
  isDisabled = false,
  maskedCredentials,
  webhookOnly = false,
  canRevealPassword = false,
  hasPassword = false,
  onRevealPassword,
}: IntegrationCredentialFieldsProps) {
  const [webhookUrlCopied, setWebhookUrlCopied] = useState(false);
  const [revealingPassword, setRevealingPassword] = useState(false);
  const [passwordRevealed, setPasswordRevealed] = useState(false);
  const optionalHint =
    mode === "edit" ? "Leave blank to keep the current value" : undefined;
  const showAiFields = integrationType ? isAiIntegrationType(integrationType) : false;
  const deferWebhookUntilConnectionExists =
    integrationType === IntegrationTypes.OPENAI &&
    mode === "create" &&
    !connectionId &&
    !webhookOnly;
  const showWebhookFields =
    showAiFields && (webhookOnly || !deferWebhookUntilConnectionExists);
  const webhookUrl = connectionId
    ? getIntegrationWebhookUrl(integrationType ?? "", connectionId)
    : null;
  const showRevealPasswordButton =
    mode === "edit" &&
    canRevealPassword &&
    hasPassword &&
    !!onRevealPassword &&
    !!setValue &&
    (authType === AuthTypes.EMAIL_PASSWORD || authType === AuthTypes.USERNAME_PASSWORD);

  const copyWebhookUrl = async () => {
    if (!webhookUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(webhookUrl);
      setWebhookUrlCopied(true);
      window.setTimeout(() => setWebhookUrlCopied(false), 2000);
    } catch {
      setWebhookUrlCopied(false);
    }
  };

  const handleRevealPassword = async () => {
    if (!onRevealPassword || !setValue) {
      return;
    }

    setRevealingPassword(true);
    try {
      const password = await onRevealPassword();
      if (password) {
        setValue("password", password, { shouldDirty: true });
        setPasswordRevealed(true);
      }
    } finally {
      setRevealingPassword(false);
    }
  };

  const renderSecretInput = (
    fieldName: "password" | "api_key_secret" | "webhook_key",
    id: string,
    label: string,
    placeholder?: string,
  ) => {
    const registration = register(fieldName);
    const isPasswordField = fieldName === "password";

    if (mode === "edit" && watch) {
      const fieldValue = watch(fieldName) ?? "";

      return (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor={id}>{label}</Label>
            {isPasswordField && showRevealPasswordButton ? (
              <ActionButtonWithPending
                type="button"
                size="sm"
                variant="secondary"
                onPress={handleRevealPassword}
                isPending={revealingPassword}
                isDisabled={isDisabled || passwordRevealed}
              >
                {passwordRevealed ? "Password revealed" : "Reveal password"}
              </ActionButtonWithPending>
            ) : null}
          </div>
          <PasswordInput
            id={id}
            name={registration.name}
            ref={registration.ref}
            onBlur={registration.onBlur}
            onChange={registration.onChange}
            value={fieldValue}
            maskedPreview={maskedCredentials?.[fieldName]}
            forceShow={isPasswordField && passwordRevealed}
            placeholder={placeholder ?? optionalHint ?? label}
            disabled={isDisabled}
          />
          {errors[fieldName] && <FieldError>{errors[fieldName]?.message}</FieldError>}
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-1">
        <Label htmlFor={id}>{label}</Label>
        <PasswordInput
          id={id}
          {...registration}
          placeholder={placeholder ?? optionalHint ?? label}
          disabled={isDisabled}
        />
        {errors[fieldName] && <FieldError>{errors[fieldName]?.message}</FieldError>}
      </div>
    );
  };

  const renderAiWebhookFields = () => {
    if (!showWebhookFields) {
      return null;
    }

    return (
      <>
        {webhookUrl ? (
          <div className="flex flex-col gap-1">
            <Label htmlFor="webhook-url">Webhook URL</Label>
            <InputGroup fullWidth>
              <InputGroup.Input
                id="webhook-url"
                value={webhookUrl}
                readOnly
                onFocus={(event) => event.currentTarget.select()}
                onChange={() => {}}
              />
              <InputGroup.Suffix className="pr-0">
                <Button
                  isIconOnly
                  aria-label={webhookUrlCopied ? "Webhook URL copied" : "Copy webhook URL"}
                  size="sm"
                  variant="ghost"
                  onPress={copyWebhookUrl}
                >
                  {webhookUrlCopied ? (
                    <Check className="size-4 text-success" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                </Button>
              </InputGroup.Suffix>
            </InputGroup>
            <p className="text-xs text-muted">
              {integrationSupportsWebhookUrl(integrationType ?? "")
                ? "Paste this URL in OpenAI webhook settings first, then copy the signing secret below."
                : "Register this URL in your provider webhook settings."}
            </p>
          </div>
        ) : null}
        {renderSecretInput(
          "webhook_key",
          "credential-webhook-key",
          "Webhook signing secret",
          mode === "create" || webhookOnly
            ? "From your provider webhook settings"
            : optionalHint,
        )}
      </>
    );
  };

  if (webhookOnly) {
    return <>{renderAiWebhookFields()}</>;
  }

  switch (authType) {
    case AuthTypes.EMAIL_PASSWORD:
      return (
        <>
          <div className="flex flex-col gap-1">
            <Label htmlFor="credential-email">Email</Label>
            <Input
              id="credential-email"
              {...register("email")}
              placeholder="user@example.com"
              fullWidth
              disabled={isDisabled}
            />
            {errors.email && <FieldError>{errors.email.message}</FieldError>}
          </div>
          {renderSecretInput("password", "credential-password", "Password")}
        </>
      );
    case AuthTypes.USERNAME_PASSWORD:
      return (
        <>
          <div className="flex flex-col gap-1">
            <Label htmlFor="credential-username">Username</Label>
            <Input
              id="credential-username"
              {...register("username")}
              placeholder="Username"
              fullWidth
              disabled={isDisabled}
            />
            {errors.username && <FieldError>{errors.username.message}</FieldError>}
          </div>
          {renderSecretInput("password", "credential-password", "Password")}
        </>
      );
    case AuthTypes.BEARER_TOKEN:
      return (
        <>
          {renderSecretInput("api_key_secret", "credential-bearer", "Bearer token")}
          {renderAiWebhookFields()}
        </>
      );
    case AuthTypes.API_KEY:
      return (
        <>
          {renderSecretInput("api_key_secret", "credential-api-key", "API key")}
          {renderAiWebhookFields()}
        </>
      );
    case AuthTypes.OAUTH:
      return (
        <div className="flex flex-col gap-1">
          <Label htmlFor="credential-oauth">OAuth config (JSON)</Label>
          <Input
            id="credential-oauth"
            {...register("configJson")}
            placeholder='{"access_token":"..."}'
            fullWidth
            disabled={isDisabled}
          />
          {errors.configJson && <FieldError>{errors.configJson.message}</FieldError>}
        </div>
      );
    default:
      return null;
  }
}

export function CredentialStatusIndicators({
  hasApiKey,
  hasWebhookKey,
  hasPassword,
  hasConfig,
  email,
  username,
}: {
  hasApiKey: boolean;
  hasWebhookKey: boolean;
  hasPassword: boolean;
  hasConfig: boolean;
  email?: string | null;
  username?: string | null;
}) {
  return (
    <div className="flex flex-wrap gap-2 text-xs text-muted">
      {email && <span>Email: {email}</span>}
      {username && <span>Username: {username}</span>}
      {hasApiKey && <span className="text-success">API key set</span>}
      {hasWebhookKey && <span className="text-success">Webhook secret set</span>}
      {hasPassword && <span className="text-success"></span>}
      {hasConfig && <span className="text-success"></span>}
    </div>
  );
}
