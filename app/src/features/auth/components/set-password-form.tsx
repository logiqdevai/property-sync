import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, Label, FieldError } from "@heroui/react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { PasswordInput } from "@/components/ui/password-input";
import {
  setPasswordSchema,
  type SetPasswordFormValues,
} from "@/features/auth/validation-schemas/password.schema";

interface SetPasswordFormProps {
  submitLabel: string;
  isPending: boolean;
  onSubmit: (values: Pick<SetPasswordFormValues, "password">) => void;
  onCancel?: () => void;
}

export function SetPasswordForm({
  submitLabel,
  isPending,
  onSubmit,
  onCancel,
}: SetPasswordFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SetPasswordFormValues>({
    resolver: zodResolver(setPasswordSchema),
    defaultValues: { password: "", confirm_password: "" },
  });

  const submit = (values: SetPasswordFormValues) => {
    onSubmit({ password: values.password });
  };

  return (
    <Form onSubmit={handleSubmit(submit)} className="grid gap-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor="set-password">Password</Label>
        <PasswordInput id="set-password" {...register("password")} placeholder="********" />
        {errors.password && <FieldError>{errors.password.message}</FieldError>}
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="set-password-confirm">Confirm password</Label>
        <PasswordInput
          id="set-password-confirm"
          {...register("confirm_password")}
          placeholder="********"
        />
        {errors.confirm_password && <FieldError>{errors.confirm_password.message}</FieldError>}
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
