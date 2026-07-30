import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, Label, Input, FieldError, Tabs } from "@heroui/react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { DetailSkeleton } from "@/components/ui/detail-skeleton";
import { usePlatformConfig, useUpdatePlatformConfig } from "@/features/platform-config/hooks/use-platform-config";
import {
  CRAWLER_CONFIG_FIELDS,
  CRAWLER_CONFIG_GROUP_ORDER,
  crawlerConfigFormSchema,
  parseOptionalConfigNumber,
  type CrawlerConfigFormValues,
} from "@/features/platform-config/validation-schemas/crawler-config-fields.schema";
import type { UpdatePlatformConfigPayload } from "@/features/platform-config/interfaces/platform-config.interfaces";
import { NotificationSettingsPanel } from "./components/notification-settings-panel";

function toFormValue(value: number | null): string {
  return value === null ? "" : String(value);
}

const APP_CONFIG_TABS = {
  general: "general",
  notifications: "notifications",
} as const;

type AppConfigTab = (typeof APP_CONFIG_TABS)[keyof typeof APP_CONFIG_TABS];

export default function CrawlerConfigPage() {
  const [selectedTab, setSelectedTab] = useState<AppConfigTab>(APP_CONFIG_TABS.general);
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
          Tunable parameters for crawl worker, Playwright pipeline, AI normalization, and outbound
          alerting.
        </p>
      </div>

      <Tabs
        className="relative w-full"
        variant="secondary"
        selectedKey={selectedTab}
        onSelectionChange={(key) => setSelectedTab(key as AppConfigTab)}
      >
        <Tabs.ListContainer className="relative z-10">
          <Tabs.List aria-label="App config sections">
            <Tabs.Tab id={APP_CONFIG_TABS.general}>
              General
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id={APP_CONFIG_TABS.notifications}>
              Notifications
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>

        <Tabs.Panel id={APP_CONFIG_TABS.general} className="pt-6 data-[exiting]:pointer-events-none">
          {isPending || !data ? (
            <DetailSkeleton fieldCount={10} showSubTable={false} />
          ) : (
            <Form onSubmit={handleSubmit(submit)} className="flex flex-col gap-6">
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {CRAWLER_CONFIG_GROUP_ORDER.map((group) => {
                  const fields = CRAWLER_CONFIG_FIELDS.filter((field) => field.group === group.id);
                  return (
                    <section
                      key={group.id}
                      className="rounded-xl border border-border bg-surface p-6 flex flex-col gap-4"
                    >
                      <div>
                        <h2 className="text-lg font-semibold text-foreground">{group.label}</h2>
                        <p className="text-sm text-muted mt-1">{group.description}</p>
                      </div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {fields.map((field) => (
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
                            {errors[field.key] && (
                              <FieldError>{errors[field.key]?.message}</FieldError>
                            )}
                            <span className="text-xs text-muted">{field.hint}</span>
                          </div>
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>

              <div className="flex justify-end gap-2">
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
        </Tabs.Panel>

        <Tabs.Panel id={APP_CONFIG_TABS.notifications} className="pt-6 data-[exiting]:pointer-events-none">
          <NotificationSettingsPanel />
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}
