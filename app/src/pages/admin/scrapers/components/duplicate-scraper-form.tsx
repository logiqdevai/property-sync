import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, Label, FieldError, Select, ListBox } from "@heroui/react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { useAgencies } from "@/features/agencies/hooks/use-agencies";
import {
  duplicateScraperFormSchema,
  type DuplicateScraperFormValues,
} from "@/features/scrapers/validation-schemas/scrapers.schema";

interface DuplicateScraperFormProps {
  isPending: boolean;
  onSubmit: (values: DuplicateScraperFormValues) => void;
  onCancel?: () => void;
}

export function DuplicateScraperForm({ isPending, onSubmit, onCancel }: DuplicateScraperFormProps) {
  const { data: agenciesData } = useAgencies({ limit: 100 });
  // An agency can only have one scraper — only offer agencies that don't have one yet.
  const agencies = (agenciesData?.data ?? []).filter((agency) => (agency._count?.scrapers ?? 0) === 0);

  const {
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<DuplicateScraperFormValues>({
    resolver: zodResolver(duplicateScraperFormSchema),
    defaultValues: { source_agency_id: "" },
  });

  return (
    <Form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
      <div className="flex flex-col gap-1">
        <Controller
          name="source_agency_id"
          control={control}
          render={({ field }) => (
            <Select
              placeholder="Select an agency"
              selectedKey={field.value}
              onSelectionChange={(key) => field.onChange(key as string)}
            >
              <Label>Duplicate for agency</Label>
              <Select.Trigger>
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
        {errors.source_agency_id && <FieldError>{errors.source_agency_id.message}</FieldError>}
        <span className="text-xs text-muted">
          Only agencies without an existing scraper are shown. The new scraper's name is
          auto-generated as "&lt;agency name&gt; scraper".
        </span>
      </div>

      <div className="flex justify-end gap-2 mt-2">
        {onCancel && (
          <ActionButtonWithPending type="button" variant="secondary" isDisabled={isPending} onPress={onCancel}>
            Cancel
          </ActionButtonWithPending>
        )}
        <ActionButtonWithPending type="submit" isPending={isPending} isDisabled={isPending}>
          Duplicate
        </ActionButtonWithPending>
      </div>
    </Form>
  );
}
