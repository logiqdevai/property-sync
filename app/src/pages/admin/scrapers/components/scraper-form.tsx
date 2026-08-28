import { useForm, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, Label, Input, FieldError, Select, ListBox } from "@heroui/react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { useAgencies } from "@/features/agencies/hooks/use-agencies";
import { useScrapers } from "@/features/scrapers/hooks/use-scrapers";
import {
  createScraperFormSchema,
  type CreateScraperFormValues,
} from "@/features/scrapers/validation-schemas/scrapers.schema";

interface ScraperFormProps {
  defaultAgencyId?: string;
  submitLabel: string;
  isPending: boolean;
  onSubmit: (values: CreateScraperFormValues) => void;
  onCancel?: () => void;
}

const CREATE_FROM_SCRATCH = "";

export function ScraperForm({ defaultAgencyId, submitLabel, isPending, onSubmit, onCancel }: ScraperFormProps) {
  const { data: agenciesData } = useAgencies({ limit: 100 });
  const { data: scrapersData } = useScrapers({ limit: 100 });
  // Only scrapers with an active version have anything to copy.
  const duplicatableScrapers = (scrapersData?.data ?? []).filter((scraper) => scraper.active_version_id);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<CreateScraperFormValues>({
    resolver: zodResolver(createScraperFormSchema),
    defaultValues: {
      source_agency_id: defaultAgencyId ?? "",
      duplicate_from_scraper_id: CREATE_FROM_SCRATCH,
      name: "",
      normalize_limit: "",
    },
  });

  const duplicateFromScraperId = useWatch({ control, name: "duplicate_from_scraper_id" });
  const isDuplicating = Boolean(duplicateFromScraperId);
  const sourceScraper = duplicatableScrapers.find((scraper) => scraper.id === duplicateFromScraperId);

  // An agency can only have one scraper -- when duplicating, only offer agencies without one yet.
  const agencies = (agenciesData?.data ?? []).filter(
    (agency) => !isDuplicating || (agency._count?.scrapers ?? 0) === 0,
  );

  return (
    <Form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
      <div className="flex flex-col gap-1">
        <Controller
          name="duplicate_from_scraper_id"
          control={control}
          render={({ field }) => (
            <Select
              placeholder="Create from scratch"
              selectedKey={field.value}
              onSelectionChange={(key) => {
                field.onChange(key as string);
                // The previously picked agency may no longer be a valid duplicate target
                // (or vice versa), so reset it whenever the mode changes.
                setValue("source_agency_id", defaultAgencyId ?? "");
              }}
            >
              <Label>Duplicate from scraper (optional)</Label>
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  <ListBox.Item key={CREATE_FROM_SCRATCH} id={CREATE_FROM_SCRATCH}>
                    Create from scratch
                  </ListBox.Item>
                  {duplicatableScrapers.map((scraper) => (
                    <ListBox.Item key={scraper.id} id={scraper.id}>
                      {scraper.name} — {scraper.source_agency?.name ?? "Unknown agency"}
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
          )}
        />
        <span className="text-xs text-muted">
          {isDuplicating
            ? `Copies "${sourceScraper?.name ?? "the selected scraper"}"'s active config into a brand-new scraper for the agency below.`
            : "Or copy an existing scraper's config instead of starting blank."}
        </span>
      </div>

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
              <Label>{isDuplicating ? "Duplicate for agency" : "Source agency"}</Label>
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
        {isDuplicating && (
          <span className="text-xs text-muted">
            Only agencies without an existing scraper are shown. The new scraper's name is
            auto-generated as "&lt;agency name&gt; scraper", and its start_url is taken from
            this agency's own base_url (not copied from {sourceScraper?.name ?? "the selected scraper"}).
          </span>
        )}
      </div>

      {!isDuplicating && (
        <>
          <div className="flex flex-col gap-1">
            <Label htmlFor="scraper-name">Name</Label>
            <Input id="scraper-name" {...register("name")} placeholder="Acme listing scraper" fullWidth />
            {errors.name && <FieldError>{errors.name.message}</FieldError>}
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="scraper-normalize-limit">Normalize limit (optional)</Label>
            <Input
              id="scraper-normalize-limit"
              type="number"
              min={1}
              step={1}
              {...register("normalize_limit")}
              placeholder="Unlimited"
              fullWidth
            />
            {errors.normalize_limit && <FieldError>{errors.normalize_limit.message}</FieldError>}
            <span className="text-xs text-muted">
              Cap how many listings get AI-normalized per crawl. Leave blank for unlimited.
            </span>
          </div>
        </>
      )}

      <div className="flex justify-end gap-2 mt-2">
        {onCancel && (
          <ActionButtonWithPending type="button" variant="secondary" isDisabled={isPending} onPress={onCancel}>
            Cancel
          </ActionButtonWithPending>
        )}
        <ActionButtonWithPending type="submit" isPending={isPending} isDisabled={isPending}>
          {isDuplicating ? "Duplicate" : submitLabel}
        </ActionButtonWithPending>
      </div>
    </Form>
  );
}
