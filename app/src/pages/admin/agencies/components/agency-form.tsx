import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, Label, Input, FieldError, Select, ListBox } from "@heroui/react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { CrawlIntervalField } from "@/components/ui/crawl-interval-field";
import { ContentLanguageFormOptions } from "@/config/constants/dropdowns/agencies/content-language-form.options";
import { ContentLanguages } from "@/features/content-publishing/interfaces/content-publishing.interfaces";
import {
  agencyFormSchema,
  DefaultAgencyCrawlInterval,
  type AgencyFormValues,
} from "@/features/agencies/validation-schemas/agencies.schema";

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
    control,
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
      content_language:
        defaultValues?.content_language ?? ContentLanguages.EL,
      crawl_interval: defaultValues?.crawl_interval ?? DefaultAgencyCrawlInterval,
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

      <Controller
        name="content_language"
        control={control}
        render={({ field }) => (
          <Select
            selectedKey={field.value}
            onSelectionChange={(key) => {
              if (key) field.onChange(String(key));
            }}
          >
            <Label>Content language</Label>
            <Select.Trigger>
              <Select.Value />
            </Select.Trigger>
            <Select.Popover>
              <ListBox items={ContentLanguageFormOptions}>
                {(option) => (
                  <ListBox.Item id={option.id} textValue={option.label}>
                    {option.label}
                  </ListBox.Item>
                )}
              </ListBox>
            </Select.Popover>
          </Select>
        )}
      />
      {errors.content_language && (
        <FieldError>{errors.content_language.message}</FieldError>
      )}

      <div className="flex flex-col gap-1">
        <Label htmlFor="agency-notes">Notes</Label>
        <Input id="agency-notes" {...register("notes")} placeholder="Optional notes" fullWidth />
        {errors.notes && <FieldError>{errors.notes.message}</FieldError>}
      </div>

      <Controller
        name="crawl_interval"
        control={control}
        render={({ field }) => (
          <div className="flex flex-col gap-1">
            <CrawlIntervalField
              value={field.value}
              disabled={isPending}
              onChange={field.onChange}
            />
            {errors.crawl_interval && (
              <FieldError>{errors.crawl_interval.message}</FieldError>
            )}
          </div>
        )}
      />

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
