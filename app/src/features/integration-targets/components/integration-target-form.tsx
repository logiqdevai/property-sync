import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, Label, Input, FieldError, Select, ListBox, Switch } from "@heroui/react";
import { z } from "zod";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import {
  AuthTypes,
  IntegrationTypes,
  type AuthType,
  type CreateIntegrationTargetPayload,
  type IntegrationType,
} from "../interfaces/integration-targets.interfaces";

const integrationTargetFormSchema = z.object({
  integration_type: z.enum([
    IntegrationTypes.ESTATEWEB,
    IntegrationTypes.OPENAI,
    IntegrationTypes.ANTHROPIC,
    IntegrationTypes.GEMINI,
    IntegrationTypes.DEEPSEEK,
  ]),
  auth_type: z.enum([
    AuthTypes.EMAIL_PASSWORD,
    AuthTypes.USERNAME_PASSWORD,
    AuthTypes.BEARER_TOKEN,
    AuthTypes.API_KEY,
    AuthTypes.OAUTH,
  ]),
  base_url: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  allow_multiple: z.boolean(),
  is_visible: z.boolean(),
});

export type IntegrationTargetFormValues = z.infer<typeof integrationTargetFormSchema>;

const integrationTypeOptions: { id: IntegrationType; label: string }[] = [
  { id: IntegrationTypes.ESTATEWEB, label: "EstateWeb (CMS)" },
  { id: IntegrationTypes.OPENAI, label: "OpenAI" },
  { id: IntegrationTypes.ANTHROPIC, label: "Anthropic" },
  { id: IntegrationTypes.GEMINI, label: "Gemini" },
  { id: IntegrationTypes.DEEPSEEK, label: "DeepSeek" },
];

const authTypeOptions: { id: AuthType; label: string }[] = [
  { id: AuthTypes.EMAIL_PASSWORD, label: "Email + password" },
  { id: AuthTypes.USERNAME_PASSWORD, label: "Username + password" },
  { id: AuthTypes.BEARER_TOKEN, label: "Bearer token" },
  { id: AuthTypes.API_KEY, label: "API key" },
  { id: AuthTypes.OAUTH, label: "OAuth" },
];

interface IntegrationTargetFormProps {
  defaultValues?: Partial<IntegrationTargetFormValues>;
  submitLabel: string;
  isPending: boolean;
  onSubmit: (payload: CreateIntegrationTargetPayload) => void;
  onCancel?: () => void;
}

export function IntegrationTargetForm({
  defaultValues,
  submitLabel,
  isPending,
  onSubmit,
  onCancel,
}: IntegrationTargetFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<IntegrationTargetFormValues>({
    resolver: zodResolver(integrationTargetFormSchema),
    defaultValues: {
      integration_type: defaultValues?.integration_type ?? IntegrationTypes.OPENAI,
      auth_type: defaultValues?.auth_type ?? AuthTypes.API_KEY,
      base_url: defaultValues?.base_url ?? "",
      allow_multiple: defaultValues?.allow_multiple ?? false,
      is_visible: defaultValues?.is_visible ?? true,
    },
  });

  const allowMultiple = watch("allow_multiple");
  const isVisible = watch("is_visible");
  const integrationType = watch("integration_type");
  const authType = watch("auth_type");

  const submit = (values: IntegrationTargetFormValues) => {
    onSubmit({
      integration_type: values.integration_type,
      auth_type: values.auth_type,
      allow_multiple: values.allow_multiple,
      is_visible: values.is_visible,
      ...(values.base_url ? { base_url: values.base_url } : {}),
    });
  };

  return (
    <Form onSubmit={handleSubmit(submit)} className="grid gap-4">
      <div className="flex flex-col gap-1">
        <Select
          selectedKey={integrationType}
          onSelectionChange={(key) =>
            setValue("integration_type", key as IntegrationType, { shouldValidate: true })
          }
        >
          <Label>Integration type</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {integrationTypeOptions.map((option) => (
                <ListBox.Item key={option.id} id={option.id}>
                  {option.label}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
        {errors.integration_type && <FieldError>{errors.integration_type.message}</FieldError>}
      </div>

      <div className="flex flex-col gap-1">
        <Select
          selectedKey={authType}
          onSelectionChange={(key) => setValue("auth_type", key as AuthType, { shouldValidate: true })}
        >
          <Label>Auth type</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {authTypeOptions.map((option) => (
                <ListBox.Item key={option.id} id={option.id}>
                  {option.label}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
        {errors.auth_type && <FieldError>{errors.auth_type.message}</FieldError>}
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="target-base-url">Base URL (optional)</Label>
        <Input
          id="target-base-url"
          {...register("base_url")}
          placeholder="https://cms.example.com"
          fullWidth
        />
        {errors.base_url && <FieldError>{errors.base_url.message}</FieldError>}
      </div>

      <Switch isSelected={allowMultiple} onChange={(value) => setValue("allow_multiple", value)}>
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
        <Switch.Content>Allow multiple connections per user</Switch.Content>
      </Switch>

      <Switch isSelected={isVisible} onChange={(value) => setValue("is_visible", value)}>
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
        <Switch.Content>Visible to users on Integrations page</Switch.Content>
      </Switch>

      <div className="flex justify-end gap-2 mt-2">
        {onCancel && (
          <ActionButtonWithPending type="button" variant="secondary" isDisabled={isPending} onPress={onCancel}>
            Cancel
          </ActionButtonWithPending>
        )}
        <ActionButtonWithPending type="submit" isPending={isPending} isDisabled={isPending}>
          {submitLabel}
        </ActionButtonWithPending>
      </div>
    </Form>
  );
}
