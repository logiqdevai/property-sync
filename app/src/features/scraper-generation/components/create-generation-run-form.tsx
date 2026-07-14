import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, Label, TextArea, FieldError, Select, ListBox } from "@heroui/react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { useAgencies } from "@/features/agencies/hooks/use-agencies";
import {
  createGenerationRunFormSchema,
  type CreateGenerationRunFormValues,
} from "../validation-schemas/scraper-generation.schema";

interface CreateGenerationRunFormProps {
  defaultAgencyId?: string;
  defaultAgencyName?: string;
  lockAgency?: boolean;
  defaultScraperId?: string;
  submitLabel?: string;
  isPending: boolean;
  onSubmit: (values: CreateGenerationRunFormValues) => void;
  onCancel?: () => void;
}

export function CreateGenerationRunForm({
  defaultAgencyId,
  defaultAgencyName,
  lockAgency = false,
  defaultScraperId,
  submitLabel = "Generate",
  isPending,
  onSubmit,
  onCancel,
}: CreateGenerationRunFormProps) {
  // Skip the agencies fetch entirely when locked — the caller already knows the agency
  // (it's the scraper's own agency), and waiting on this list caused the disabled Select
  // to briefly show its placeholder instead of the known name before data arrived.
  const { data: agenciesData } = useAgencies({ limit: 100 }, { enabled: !lockAgency });
  const agencies = agenciesData?.data ?? [];

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<CreateGenerationRunFormValues>({
    resolver: zodResolver(createGenerationRunFormSchema),
    defaultValues: {
      source_agency_id: defaultAgencyId ?? "",
      scraper_id: defaultScraperId,
      prompt: "",
    },
  });

  return (
    <Form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor="generation-agency">Source agency</Label>
        {lockAgency ? (
          <div
            id="generation-agency"
            className="rounded-lg border border-border bg-surface-secondary px-3 py-2 text-sm text-muted"
          >
            {defaultAgencyName ?? defaultAgencyId}
          </div>
        ) : (
          <Controller
            name="source_agency_id"
            control={control}
            render={({ field }) => (
              <Select
                placeholder="Select an agency"
                selectedKey={field.value}
                onSelectionChange={(key) => field.onChange(key as string)}
              >
                <Select.Trigger id="generation-agency">
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {agencies.map((agency) => (
                      <ListBox.Item key={agency.id} id={agency.id}>
                        {agency.name}
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
            )}
          />
        )}
        {errors.source_agency_id && <FieldError>{errors.source_agency_id.message}</FieldError>}
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="generation-prompt">Prompt (optional)</Label>
        <TextArea
          id="generation-prompt"
          {...register("prompt")}
          placeholder="Any extra instructions for the AI (e.g. focus on the rentals page)"
          rows={4}
          fullWidth
        />
        {errors.prompt && <FieldError>{errors.prompt.message}</FieldError>}
      </div>

      <div className="flex justify-end gap-2 mt-2">
        {onCancel && (
          <ActionButtonWithPending
            type="button"
            variant="secondary"
            isDisabled={isPending}
            onPress={onCancel}
          >
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
