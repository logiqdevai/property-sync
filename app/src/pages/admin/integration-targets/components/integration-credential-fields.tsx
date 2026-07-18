import { Input, Label, FieldError } from "@heroui/react";
import type { UseFormRegister, UseFormWatch } from "react-hook-form";
import type { AuthType } from "@/features/integration-targets/interfaces/integration-targets.interfaces";
import { AuthTypes } from "@/features/integration-targets/interfaces/integration-targets.interfaces";
import type { MaskedCredentialValues } from "@/features/user-integrations/validation-schemas/user-integrations.schema";
import { PasswordInput } from "@/components/ui/password-input";

type CredentialFieldErrors = {
  email?: { message?: string };
  username?: { message?: string };
  password?: { message?: string };
  api_key_secret?: { message?: string };
  configJson?: { message?: string };
};

interface IntegrationCredentialFieldsProps {
  authType: AuthType;
  register: UseFormRegister<any>;
  watch?: UseFormWatch<any>;
  errors?: CredentialFieldErrors;
  mode?: "create" | "edit";
  maskedCredentials?: MaskedCredentialValues;
}

export function IntegrationCredentialFields({
  authType,
  register,
  watch,
  errors = {},
  mode = "create",
  maskedCredentials,
}: IntegrationCredentialFieldsProps) {
  const optionalHint =
    mode === "edit" ? "Leave blank to keep the current value" : undefined;

  const renderPasswordInput = (fieldName: "password" | "api_key_secret", id: string, label: string) => {
    const registration = register(fieldName);

    if (mode === "edit" && watch) {
      const fieldValue = watch(fieldName) ?? "";

      return (
        <div className="flex flex-col gap-1">
          <Label htmlFor={id}>{label}</Label>
          <PasswordInput
            id={id}
            name={registration.name}
            ref={registration.ref}
            onBlur={registration.onBlur}
            onChange={registration.onChange}
            value={fieldValue}
            maskedPreview={maskedCredentials?.[fieldName]}
            placeholder={optionalHint ?? label}
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
          placeholder={optionalHint ?? label}
        />
        {errors[fieldName] && <FieldError>{errors[fieldName]?.message}</FieldError>}
      </div>
    );
  };

  switch (authType) {
    case AuthTypes.EMAIL_PASSWORD:
      return (
        <>
          <div className="flex flex-col gap-1">
            <Label htmlFor="credential-email">Email</Label>
            <Input id="credential-email" {...register("email")} placeholder="user@example.com" fullWidth />
            {errors.email && <FieldError>{errors.email.message}</FieldError>}
          </div>
          {renderPasswordInput("password", "credential-password", "Password")}
        </>
      );
    case AuthTypes.USERNAME_PASSWORD:
      return (
        <>
          <div className="flex flex-col gap-1">
            <Label htmlFor="credential-username">Username</Label>
            <Input id="credential-username" {...register("username")} placeholder="Username" fullWidth />
            {errors.username && <FieldError>{errors.username.message}</FieldError>}
          </div>
          {renderPasswordInput("password", "credential-password", "Password")}
        </>
      );
    case AuthTypes.BEARER_TOKEN:
      return renderPasswordInput("api_key_secret", "credential-bearer", "Bearer token");
    case AuthTypes.API_KEY:
      return renderPasswordInput("api_key_secret", "credential-api-key", "API key");
    case AuthTypes.OAUTH:
      return (
        <div className="flex flex-col gap-1">
          <Label htmlFor="credential-oauth">OAuth config (JSON)</Label>
          <Input
            id="credential-oauth"
            {...register("configJson")}
            placeholder='{"access_token":"..."}'
            fullWidth
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
  hasPassword,
  hasConfig,
  email,
  username,
}: {
  hasApiKey: boolean;
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
      {hasPassword && <span className="text-success"></span>}
      {hasConfig && <span className="text-success">OAuth config set</span>}
    </div>
  );
}
