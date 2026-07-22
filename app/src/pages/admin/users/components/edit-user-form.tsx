import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, Label, Input, FieldError, Select, ListBox } from "@heroui/react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { PasswordInput } from "@/components/ui/password-input";
import { RoleTypeFormOptions } from "@/config/constants/dropdowns/users/role-type-form.options";
import {
  updateUserSchema,
  type UpdateUserFormValues,
} from "@/features/users/validation-schemas/update-user.schema";
import type { UpdateAdminUserPayload } from "@/features/users/interfaces/admin-users.interfaces";
import type { RoleType } from "@/features/user/interfaces/user.interface";

interface EditUserFormProps {
  defaultValues: UpdateUserFormValues;
  isSelf: boolean;
  submitLabel: string;
  isPending: boolean;
  onSubmit: (payload: UpdateAdminUserPayload) => void;
  onCancel?: () => void;
}

export function EditUserForm({
  defaultValues,
  isSelf,
  submitLabel,
  isPending,
  onSubmit,
  onCancel,
}: EditUserFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<UpdateUserFormValues>({
    resolver: zodResolver(updateUserSchema),
    defaultValues,
  });

  const role = watch("role");

  const submit = (values: UpdateUserFormValues) => {
    const payload: UpdateAdminUserPayload = {
      email: values.email,
      phone: values.phone.trim() ? values.phone.trim() : null,
      role: values.role,
    };

    if (values.password.trim()) {
      payload.password = values.password;
    }

    onSubmit(payload);
  };

  return (
    <Form onSubmit={handleSubmit(submit)} className="grid gap-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor="edit-user-email">Email</Label>
        <Input
          id="edit-user-email"
          {...register("email")}
          placeholder="name@example.com"
          type="email"
          fullWidth
        />
        {errors.email && <FieldError>{errors.email.message}</FieldError>}
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="edit-user-phone">Phone</Label>
        <Input
          id="edit-user-phone"
          {...register("phone")}
          placeholder="+1234567890"
          fullWidth
        />
        {errors.phone && <FieldError>{errors.phone.message}</FieldError>}
      </div>

      <div className="flex flex-col gap-1">
        <Select
          selectedKey={role}
          onSelectionChange={(key) => setValue("role", key as RoleType, { shouldValidate: true })}
          isDisabled={isSelf}
          fullWidth
        >
          <Label>Role</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {RoleTypeFormOptions.map((option) => (
                <ListBox.Item key={option.id} id={option.id}>
                  {option.label}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
        {isSelf && (
          <p className="text-xs text-muted">You cannot change your own role.</p>
        )}
        {errors.role && <FieldError>{errors.role.message}</FieldError>}
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="edit-user-password">New password</Label>
        <PasswordInput
          id="edit-user-password"
          {...register("password")}
          placeholder="Leave blank to keep current password"
          autoComplete="new-password"
        />
        {errors.password && <FieldError>{errors.password.message}</FieldError>}
      </div>

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
