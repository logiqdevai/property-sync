import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, Label, Input, FieldError } from "@heroui/react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { DetailSkeleton } from "@/components/ui/detail-skeleton";
import { usePlatformConfig, useUpdatePlatformConfig } from "@/features/platform-config/hooks/use-platform-config";
import {
  CRAWLER_CONFIG_FIELDS,
  crawlerConfigFormSchema,
  parseOptionalConfigNumber,
  type CrawlerConfigFormValues,
} from "@/features/platform-config/validation-schemas/crawler-config-fields.schema";
import type { UpdatePlatformConfigPayload } from "@/features/platform-config/interfaces/platform-config.interfaces";

function toFormValue(value: number | null): string {
  return value === null ? "" : String(value);
}

export default function CrawlerConfigPage() {
  const { data, isPending } = usePlatformConfig();
  const updateConfig = useUpdatePlatformConfig();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CrawlerConfigFormValues>({
    resolver: zodResolver(crawlerConfigFormSchema),
    defaultValues: Object.fromEntries(CRAWLER_CONFIG_FIELDS.map((field) => [field.key, ""])),
  });

  useEffect(() => {
    if (!data) return;
    reset(Object.fromEntries(CRAWLER_CONFIG_FIELDS.map((field) => [field.key, toFormValue(data[field.key])])));
  }, [data, reset]);

  const submit = (values: CrawlerConfigFormValues) => {
    const payload = Object.fromEntries(
      CRAWLER_CONFIG_FIELDS.map((field) => [
        field.key,
        parseOptionalConfigNumber(values[field.key], field.isDecimal),
      ]),
    ) as UpdatePlatformConfigPayload;

    updateConfig.mutate(payload);
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-2xl font-semibold tracking-tight text-foreground">App Config</p>
        <p className="text-sm text-muted">
          Tunable parameters for crawl worker, Playwright pipeline, and AI normalization. Leave a
          field blank to fall back to its default value.
        </p>
      </div>

      {isPending || !data ? (
        <DetailSkeleton fieldCount={10} showSubTable={false} />
      ) : (
        <Form onSubmit={handleSubmit(submit)} className="grid gap-4 max-w-xl">
          {CRAWLER_CONFIG_FIELDS.map((field) => (
            <div key={field.key} className="flex flex-col gap-1">
              <Label htmlFor={`crawler-config-${field.key}`}>{field.label}</Label>
              <Input
                id={`crawler-config-${field.key}`}
                type="number"
                min={field.min}
                step={field.step ?? 1}
                {...register(field.key)}
                placeholder={`Default: ${field.defaultValue}`}
                fullWidth
              />
              {errors[field.key] && <FieldError>{errors[field.key]?.message}</FieldError>}
              <span className="text-xs text-muted">{field.hint}</span>
            </div>
          ))}

          <div className="flex justify-end gap-2 mt-2">
            <ActionButtonWithPending
              type="submit"
              isPending={updateConfig.isPending}
              isDisabled={updateConfig.isPending}
            >
              Save changes
            </ActionButtonWithPending>
          </div>
        </Form>
      )}
    </div>
  );
}
