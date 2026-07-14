import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, Label, Input, FieldError } from "@heroui/react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { agencyFormSchema, type AgencyFormValues } from "../validation-schemas/agencies.schema";

interface AgencyFormProps {
  defaultValues?: Partial<AgencyFormValues>;
  submitLabel: string;
  isPending: boolean;
  onSubmit: (values: AgencyFormValues) => void;
  onCancel?: () => void;
}

export function AgencyForm({ defaultValues, submitLabel, isPending, onSubmit, onCancel }: AgencyFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AgencyFormValues>({
    resolver: zodResolver(agencyFormSchema),
    defaultValues: {
      name: defaultValues?.name ?? "",
      base_url: defaultValues?.base_url ?? "",
      country: defaultValues?.country ?? "",
      city: defaultValues?.city ?? "",
      notes: defaultValues?.notes ?? "",
    },
  });

  return (
    <Form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor="agency-name">Name</Label>
        <Input id="agency-name" {...register("name")} placeholder="Acme Real Estate" fullWidth />
        {errors.name && <FieldError>{errors.name.message}</FieldError>}
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="agency-base-url">Website URL</Label>
        <Input
          id="agency-base-url"
          {...register("base_url")}
          placeholder="https://acme-realestate.com"
          fullWidth
        />
        {errors.base_url && <FieldError>{errors.base_url.message}</FieldError>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="agency-country">Country</Label>
          <Input id="agency-country" {...register("country")} placeholder="GR" fullWidth />
          {errors.country && <FieldError>{errors.country.message}</FieldError>}
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="agency-city">City</Label>
          <Input id="agency-city" {...register("city")} placeholder="Athens" fullWidth />
          {errors.city && <FieldError>{errors.city.message}</FieldError>}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="agency-notes">Notes</Label>
        <Input id="agency-notes" {...register("notes")} placeholder="Optional notes" fullWidth />
        {errors.notes && <FieldError>{errors.notes.message}</FieldError>}
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
