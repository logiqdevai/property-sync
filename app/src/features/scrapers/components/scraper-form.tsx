import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, Label, Input, TextArea, FieldError, Select, ListBox } from "@heroui/react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { useAgencies } from "@/features/agencies/hooks/use-agencies";
import {
  createScraperFormSchema,
  type CreateScraperFormValues,
} from "../validation-schemas/scrapers.schema";

interface ScraperFormProps {
  defaultAgencyId?: string;
  submitLabel: string;
  isPending: boolean;
  onSubmit: (values: CreateScraperFormValues) => void;
  onCancel?: () => void;
}

export function ScraperForm({ defaultAgencyId, submitLabel, isPending, onSubmit, onCancel }: ScraperFormProps) {
  const { data: agenciesData } = useAgencies({ limit: 100 });
  const agencies = agenciesData?.data ?? [];

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<CreateScraperFormValues>({
    resolver: zodResolver(createScraperFormSchema),
    defaultValues: {
      source_agency_id: defaultAgencyId ?? "",
      name: "",
      config: '{\n  "start_url": ""\n}',
    },
  });

  return (
    <Form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor="scraper-agency">Source agency</Label>
        <Controller
          name="source_agency_id"
          control={control}
          render={({ field }) => (
            <Select
              placeholder="Select an agency"
              selectedKey={field.value}
              onSelectionChange={(key) => field.onChange(key as string)}
            >
              <Select.Trigger id="scraper-agency">
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
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="scraper-name">Name</Label>
        <Input id="scraper-name" {...register("name")} placeholder="Acme listing scraper" fullWidth />
        {errors.name && <FieldError>{errors.name.message}</FieldError>}
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="scraper-config">Config (JSON)</Label>
        <TextArea
          id="scraper-config"
          {...register("config")}
          placeholder='{"start_url": "https://..."}'
          rows={8}
          className="font-mono text-xs"
          fullWidth
        />
        {errors.config && <FieldError>{errors.config.message}</FieldError>}
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
