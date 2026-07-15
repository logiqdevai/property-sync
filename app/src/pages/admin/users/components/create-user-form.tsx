import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, Label, Input, FieldError } from "@heroui/react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
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
    formState: { errors },
  } = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { email: "" },
  });

  const submit = (values: CreateUserFormValues) => {
    onSubmit({ email: values.email });
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

      <p className="text-sm text-muted">
        An email will be sent with a link so the user can choose their own password.
      </p>

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
