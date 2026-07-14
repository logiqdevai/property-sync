import { Input, Label, FieldError } from "@heroui/react";
import type { UseFormRegister } from "react-hook-form";
import type { AuthType } from "@/features/integration-targets/interfaces/integration-targets.interfaces";
import { AuthTypes } from "@/features/integration-targets/interfaces/integration-targets.interfaces";
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
  errors?: CredentialFieldErrors;
  mode?: "create" | "edit";
}

export function IntegrationCredentialFields({
  authType,
  register,
  errors = {},
  mode = "create",
}: IntegrationCredentialFieldsProps) {
  const optionalHint =
    mode === "edit" ? "Leave blank to keep the current value" : undefined;

  switch (authType) {
    case AuthTypes.EMAIL_PASSWORD:
      return (
        <>
          <div className="flex flex-col gap-1">
            <Label htmlFor="credential-email">Email</Label>
            <Input id="credential-email" {...register("email")} placeholder="user@example.com" fullWidth />
            {errors.email && <FieldError>{errors.email.message}</FieldError>}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="credential-password">Password</Label>
            <PasswordInput
              id="credential-password"
              {...register("password")}
              placeholder={optionalHint ?? "Password"}
            />
            {errors.password && <FieldError>{errors.password.message}</FieldError>}
          </div>
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
          <div className="flex flex-col gap-1">
            <Label htmlFor="credential-password">Password</Label>
            <PasswordInput
              id="credential-password"
              {...register("password")}
              placeholder={optionalHint ?? "Password"}
            />
            {errors.password && <FieldError>{errors.password.message}</FieldError>}
          </div>
        </>
      );
    case AuthTypes.BEARER_TOKEN:
      return (
        <div className="flex flex-col gap-1">
          <Label htmlFor="credential-bearer">Bearer token</Label>
          <PasswordInput
            id="credential-bearer"
            {...register("api_key_secret")}
            placeholder={optionalHint ?? "Bearer token"}
          />
          {errors.api_key_secret && <FieldError>{errors.api_key_secret.message}</FieldError>}
        </div>
      );
    case AuthTypes.API_KEY:
      return (
        <div className="flex flex-col gap-1">
          <Label htmlFor="credential-api-key">API key</Label>
          <PasswordInput
            id="credential-api-key"
            {...register("api_key_secret")}
            placeholder={optionalHint ?? "API key"}
          />
          {errors.api_key_secret && <FieldError>{errors.api_key_secret.message}</FieldError>}
        </div>
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
      {hasPassword && <span className="text-success">Password set</span>}
      {hasConfig && <span className="text-success">OAuth config set</span>}
    </div>
  );
}
