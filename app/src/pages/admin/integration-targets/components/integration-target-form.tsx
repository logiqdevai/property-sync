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
} from "@/features/integration-targets/interfaces/integration-targets.interfaces";
import { IntegrationTypeFormOptions } from "@/config/constants/dropdowns/integrations/integration-type-form.options";
import { AuthTypeFormOptions } from "@/config/constants/dropdowns/integrations/auth-type-form.options";

const integrationTypeValues = Object.values(IntegrationTypes) as [
  IntegrationType,
  ...IntegrationType[],
];
const authTypeValues = Object.values(AuthTypes) as [AuthType, ...AuthType[]];

const integrationTargetFormSchema = z.object({
  integration_type: z.enum(integrationTypeValues),
  auth_type: z.enum(authTypeValues),
  base_url: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  allow_multiple: z.boolean(),
  is_visible: z.boolean(),
  is_enabled: z.boolean(),
});

export type IntegrationTargetFormValues = z.infer<typeof integrationTargetFormSchema>;

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
      is_enabled: defaultValues?.is_enabled ?? true,
    },
  });

  const allowMultiple = watch("allow_multiple");
  const isVisible = watch("is_visible");
  const isEnabled = watch("is_enabled");
  const integrationType = watch("integration_type");
  const authType = watch("auth_type");
  const isDewatermark = integrationType === IntegrationTypes.DEWATERMARK;

  const submit = (values: IntegrationTargetFormValues) => {
    onSubmit({
      integration_type: values.integration_type,
      auth_type: values.auth_type,
      allow_multiple:
        values.integration_type === IntegrationTypes.DEWATERMARK
          ? false
          : values.allow_multiple,
      is_visible: values.is_visible,
      is_enabled: values.is_enabled,
      ...(values.base_url ? { base_url: values.base_url } : {}),
    });
  };

  return (
    <Form onSubmit={handleSubmit(submit)} className="grid gap-4">
      <div className="flex flex-col gap-1">
        <Select
          selectedKey={integrationType}
          onSelectionChange={(key) => {
            const nextType = key as IntegrationType;
            setValue("integration_type", nextType, { shouldValidate: true });
            if (nextType === IntegrationTypes.DEWATERMARK) {
              setValue("auth_type", AuthTypes.API_KEY, { shouldValidate: true });
              setValue("allow_multiple", false);
            }
          }}
        >
          <Label>Integration type</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {IntegrationTypeFormOptions.map((option) => (
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
          isDisabled={isDewatermark}
          onSelectionChange={(key) => setValue("auth_type", key as AuthType, { shouldValidate: true })}
        >
          <Label>Auth type</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {AuthTypeFormOptions.map((option) => (
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

      <Switch
        isSelected={allowMultiple}
        isDisabled={isDewatermark}
        onChange={(value) => setValue("allow_multiple", value)}
      >
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

      <Switch isSelected={isEnabled} onChange={(value) => setValue("is_enabled", value)}>
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
        <Switch.Content>Users can connect and modify</Switch.Content>
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
