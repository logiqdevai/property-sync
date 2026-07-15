import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, Label, FieldError } from "@heroui/react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { PasswordInput } from "@/components/ui/password-input";
import {
  changePasswordSchema,
  type ChangePasswordFormValues,
} from "@/features/users/validation-schemas/account.schema";
import type { ChangePasswordPayload } from "@/features/users/interfaces/account.interfaces";

interface ChangePasswordFormProps {
  isPending: boolean;
  onSubmit: (payload: ChangePasswordPayload) => void;
}

export function ChangePasswordForm({ isPending, onSubmit }: ChangePasswordFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      current_password: "",
      new_password: "",
      confirm_password: "",
    },
  });

  const submit = (values: ChangePasswordFormValues) => {
    onSubmit({
      current_password: values.current_password,
      new_password: values.new_password,
    });
  };

  return (
    <Form onSubmit={handleSubmit(submit)} className="grid gap-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor="current-password">Current password</Label>
        <PasswordInput
          id="current-password"
          {...register("current_password")}
          placeholder="********"
          autoComplete="current-password"
        />
        {errors.current_password && <FieldError>{errors.current_password.message}</FieldError>}
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="new-password">New password</Label>
        <PasswordInput
          id="new-password"
          {...register("new_password")}
          placeholder="********"
          autoComplete="new-password"
        />
        {errors.new_password && <FieldError>{errors.new_password.message}</FieldError>}
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="confirm-password">Confirm new password</Label>
        <PasswordInput
          id="confirm-password"
          {...register("confirm_password")}
          placeholder="********"
          autoComplete="new-password"
        />
        {errors.confirm_password && <FieldError>{errors.confirm_password.message}</FieldError>}
      </div>

      <div className="flex justify-end">
        <ActionButtonWithPending type="submit" isPending={isPending} isDisabled={isPending}>
          Change password
        </ActionButtonWithPending>
      </div>
    </Form>
  );
}
