import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, Label, Input, FieldError } from "@heroui/react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import {
  updateProfileSchema,
  type UpdateProfileFormValues,
} from "@/features/users/validation-schemas/account.schema";
import type { UpdateMePayload } from "@/features/users/interfaces/account.interfaces";

interface ProfileFormProps {
  defaultValues: UpdateProfileFormValues;
  isPending: boolean;
  onSubmit: (payload: UpdateMePayload) => void;
}

export function ProfileForm({ defaultValues, isPending, onSubmit }: ProfileFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<UpdateProfileFormValues>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues,
  });

  const submit = (values: UpdateProfileFormValues) => {
    onSubmit({
      email: values.email,
      phone: values.phone.trim() ? values.phone.trim() : null,
    });
  };

  return (
    <Form onSubmit={handleSubmit(submit)} className="grid gap-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor="account-email">Email</Label>
        <Input
          id="account-email"
          {...register("email")}
          placeholder="name@example.com"
          type="email"
          fullWidth
        />
        {errors.email && <FieldError>{errors.email.message}</FieldError>}
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="account-phone">Phone</Label>
        <Input
          id="account-phone"
          {...register("phone")}
          placeholder="+1234567890"
          fullWidth
        />
        {errors.phone && <FieldError>{errors.phone.message}</FieldError>}
      </div>

      <div className="flex justify-end">
        <ActionButtonWithPending type="submit" isPending={isPending} isDisabled={isPending || !isDirty}>
          Save changes
        </ActionButtonWithPending>
      </div>
    </Form>
  );
}
