import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, Label, Input, TextArea, FieldError } from "@heroui/react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import {
  createScraperVersionFormSchema,
  type CreateScraperVersionFormValues,
} from "@/features/scrapers/validation-schemas/scrapers.schema";

interface ScraperVersionFormProps {
  defaultConfig?: string;
  isPending: boolean;
  onSubmit: (values: CreateScraperVersionFormValues) => void;
  onCancel?: () => void;
}

export function ScraperVersionForm({ defaultConfig, isPending, onSubmit, onCancel }: ScraperVersionFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateScraperVersionFormValues>({
    resolver: zodResolver(createScraperVersionFormSchema),
    defaultValues: {
      config: defaultConfig ?? "",
      notes: "",
    },
  });

  return (
    <Form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor="version-config">Config (JSON, optional)</Label>
        <TextArea
          id="version-config"
          {...register("config")}
          rows={10}
          className="font-mono text-xs"
          fullWidth
        />
        {errors.config && <FieldError>{errors.config.message}</FieldError>}
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="version-notes">Notes</Label>
        <Input id="version-notes" {...register("notes")} placeholder="What changed and why" fullWidth />
        {errors.notes && <FieldError>{errors.notes.message}</FieldError>}
      </div>

      <div className="flex justify-end gap-2 mt-2">
        {onCancel && (
          <ActionButtonWithPending type="button" variant="secondary" isDisabled={isPending} onPress={onCancel}>
            Cancel
          </ActionButtonWithPending>
        )}
        <ActionButtonWithPending type="submit" isPending={isPending} isDisabled={isPending}>
          Create version
        </ActionButtonWithPending>
      </div>
    </Form>
  );
}
