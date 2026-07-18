import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, Label, Input, FieldError, Select, ListBox } from "@heroui/react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { PasswordInput } from "@/components/ui/password-input";
import {
  UserPasswordSetupFormOptions,
  UserPasswordSetupModes,
  type UserPasswordSetupMode,
} from "@/config/constants/dropdowns/user-password-setup-form.options";
import {
  createUserSchema,
  type CreateUserFormValues,
} from "@/features/users/validation-schemas/create-user.schema";
import type { CreateAdminUserPayload } from "@/features/users/interfaces/admin-users.interfaces";

interface CreateUserFormProps {
  submitLabel: string;
  isPending: boolean;
  onSubmit: (payload: CreateAdminUserPayload) => void;
  onCancel?: () => void;
}

export function CreateUserForm({
  submitLabel,
  isPending,
  onSubmit,
  onCancel,
}: CreateUserFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      email: "",
      password_setup: UserPasswordSetupModes.INVITE,
      password: "",
    },
  });

  const passwordSetup = watch("password_setup");
  const isManualPassword = passwordSetup === UserPasswordSetupModes.MANUAL;

  const submit = (values: CreateUserFormValues) => {
    onSubmit({
      email: values.email,
      ...(values.password_setup === UserPasswordSetupModes.MANUAL && {
        password: values.password,
      }),
    });
  };

  return (
    <Form onSubmit={handleSubmit(submit)} className="grid gap-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor="create-user-email">Email</Label>
        <Input
          id="create-user-email"
          {...register("email")}
          placeholder="name@example.com"
          type="email"
          fullWidth
        />
        {errors.email && <FieldError>{errors.email.message}</FieldError>}
      </div>

      <div className="flex flex-col gap-1">
        <Select
          selectedKey={passwordSetup}
          onSelectionChange={(key) => {
            const next = key as UserPasswordSetupMode;
            setValue("password_setup", next, { shouldValidate: true });
            if (next === UserPasswordSetupModes.INVITE) {
              setValue("password", "", { shouldValidate: true });
            }
          }}
          fullWidth
        >
          <Label>up</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {UserPasswordSetupFormOptions.map((option) => (
                <ListBox.Item key={option.id} id={option.id}>
                  {option.label}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
        {errors.password_setup && (
          <FieldError>{errors.password_setup.message}</FieldError>
        )}
      </div>

      {isManualPassword ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor="create-user-password">Password</Label>
          <PasswordInput
            id="create-user-password"
            {...register("password")}
            placeholder="At least 6 characters"
            autoComplete="new-password"
          />
          {errors.password && <FieldError>{errors.password.message}</FieldError>}
        </div>
      ) : (
        <p className="text-sm text-muted">
          An email will be sent with a link so the user can choose their own password.
        </p>
      )}

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
