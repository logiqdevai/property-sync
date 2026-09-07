import { useEffect, useState } from "react";
import { Checkbox, Label, ListBox, Select, Tabs } from "@heroui/react";
import {
  buildCrawlIntervalCron,
  CrawlIntervalBuilderFrequencies,
  CrawlIntervalBuilderFrequencyOptions,
  CrawlIntervalBuilderHourOptions,
  CrawlIntervalBuilderHourlyIntervalOptions,
  CrawlIntervalBuilderWeekdayOptions,
  DefaultCrawlIntervalBuilderState,
  parseCrawlIntervalBuilderState,
  type CrawlIntervalBuilderFrequency,
  type CrawlIntervalBuilderState,
} from "@/config/constants/dropdowns/agencies/crawl-interval-builder.options";
import {
  CrawlIntervalPresetOptions,
  isCrawlIntervalPreset,
} from "@/config/constants/dropdowns/agencies/crawl-interval-preset.options";

const CrawlIntervalModes = {
  PRESET: "preset",
  BUILDER: "builder",
  CUSTOM: "custom",
} as const;

type CrawlIntervalMode = (typeof CrawlIntervalModes)[keyof typeof CrawlIntervalModes];

function detectCrawlIntervalMode(cron: string): CrawlIntervalMode {
  if (isCrawlIntervalPreset(cron)) return CrawlIntervalModes.PRESET;
  if (parseCrawlIntervalBuilderState(cron)) return CrawlIntervalModes.BUILDER;
  return CrawlIntervalModes.CUSTOM;
}

interface CrawlIntervalFieldProps {
  value: string;
  disabled?: boolean;
  onChange: (cron: string) => void;
}

export function CrawlIntervalField({ value, disabled = false, onChange }: CrawlIntervalFieldProps) {
  const [mode, setMode] = useState<CrawlIntervalMode>(() => detectCrawlIntervalMode(value));
  const [customValue, setCustomValue] = useState(value);
  const [builder, setBuilder] = useState<CrawlIntervalBuilderState>(
    () => parseCrawlIntervalBuilderState(value) ?? DefaultCrawlIntervalBuilderState,
  );

  useEffect(() => {
    setCustomValue(value);
    const parsed = parseCrawlIntervalBuilderState(value);
    if (parsed) setBuilder(parsed);
  }, [value]);

  const commit = (cron: string) => {
    const next = cron.trim();
    if (!next || next === value) return;
    onChange(next);
  };

  const updateBuilder = (patch: Partial<CrawlIntervalBuilderState>) => {
    const next = { ...builder, ...patch };
    setBuilder(next);
    commit(buildCrawlIntervalCron(next));
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-muted">Crawl interval</span>

      <Tabs
        className="w-full"
        variant="secondary"
        selectedKey={mode}
        onSelectionChange={(key) => {
          const nextMode = key as CrawlIntervalMode;
          setMode(nextMode);
          if (nextMode === CrawlIntervalModes.CUSTOM) {
            setCustomValue(value);
          }
          if (nextMode === CrawlIntervalModes.BUILDER) {
            const parsed = parseCrawlIntervalBuilderState(value);
            if (parsed) setBuilder(parsed);
          }
        }}
      >
        <Tabs.ListContainer>
          <Tabs.List aria-label="Crawl interval mode">
            <Tabs.Tab id={CrawlIntervalModes.PRESET} isDisabled={disabled}>
              Preset
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id={CrawlIntervalModes.BUILDER} isDisabled={disabled}>
              Builder
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id={CrawlIntervalModes.CUSTOM} isDisabled={disabled}>
              Custom
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>

        <Tabs.Panel id={CrawlIntervalModes.PRESET} className="pt-3">
          <Select
            selectedKey={isCrawlIntervalPreset(value) ? value : undefined}
            isDisabled={disabled}
            onSelectionChange={(key) => {
              if (typeof key === "string") commit(key);
            }}
            className="w-full"
            aria-label="Preset crawl interval"
          >
            <Label>Schedule</Label>
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {CrawlIntervalPresetOptions.map((option) => (
                  <ListBox.Item key={option.id} id={option.id} textValue={option.label}>
                    <div className="flex flex-col gap-0.5">
                      <span>{option.label}</span>
                      <span className="font-mono text-xs text-muted">{option.id}</span>
                    </div>
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
        </Tabs.Panel>

        <Tabs.Panel id={CrawlIntervalModes.BUILDER} className="pt-3">
          <div className="flex flex-col gap-3">
            <Select
              selectedKey={builder.frequency}
              isDisabled={disabled}
              onSelectionChange={(key) => {
                if (typeof key === "string") {
                  updateBuilder({ frequency: key as CrawlIntervalBuilderFrequency });
                }
              }}
              className="w-full"
            >
              <Label>Frequency</Label>
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {CrawlIntervalBuilderFrequencyOptions.map((option) => (
                    <ListBox.Item key={option.id} id={option.id}>
                      {option.label}
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>

            {builder.frequency === CrawlIntervalBuilderFrequencies.HOURLY ? (
              <Select
                selectedKey={builder.hourlyInterval}
                isDisabled={disabled}
                onSelectionChange={(key) => {
                  if (typeof key === "string") updateBuilder({ hourlyInterval: key });
                }}
                className="w-full"
              >
                <Label>Interval</Label>
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {CrawlIntervalBuilderHourlyIntervalOptions.map((option) => (
                      <ListBox.Item key={option.id} id={option.id}>
                        {option.label}
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
            ) : null}

            {builder.frequency === CrawlIntervalBuilderFrequencies.WEEKLY ? (
              <Select
                selectedKey={builder.weekday}
                isDisabled={disabled}
                onSelectionChange={(key) => {
                  if (typeof key === "string") updateBuilder({ weekday: key });
                }}
                className="w-full"
              >
                <Label>Day of week</Label>
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {CrawlIntervalBuilderWeekdayOptions.map((option) => (
                      <ListBox.Item key={option.id} id={option.id}>
                        {option.label}
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
            ) : null}

            {builder.frequency === CrawlIntervalBuilderFrequencies.HOURLY ||
            builder.frequency === CrawlIntervalBuilderFrequencies.DAILY ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-sm text-muted">Days of week</span>
                <div className="flex flex-wrap gap-3" role="group" aria-label="Days of week">
                  {CrawlIntervalBuilderWeekdayOptions.map((option) => (
                    <Checkbox
                      key={option.id}
                      isSelected={builder.days.includes(option.id)}
                      isDisabled={disabled}
                      onChange={(isSelected) => {
                        const nextDays = isSelected
                          ? [...builder.days, option.id]
                          : builder.days.filter((day) => day !== option.id);
                        updateBuilder({ days: nextDays });
                      }}
                    >
                      <Checkbox.Content>
                        <Checkbox.Control>
                          <Checkbox.Indicator />
                        </Checkbox.Control>
                        {option.label}
                      </Checkbox.Content>
                    </Checkbox>
                  ))}
                </div>
                <span className="text-xs text-muted">Leave all unchecked to run every day.</span>
              </div>
            ) : null}

            {builder.frequency !== CrawlIntervalBuilderFrequencies.HOURLY ? (
              <Select
                selectedKey={builder.hour}
                isDisabled={disabled}
                onSelectionChange={(key) => {
                  if (typeof key === "string") updateBuilder({ hour: key });
                }}
                className="w-full"
              >
                <Label>Time</Label>
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {CrawlIntervalBuilderHourOptions.map((option) => (
                      <ListBox.Item key={option.id} id={option.id}>
                        {option.label}
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
            ) : null}

            <p className="font-mono text-xs text-muted">{buildCrawlIntervalCron(builder)}</p>
          </div>
        </Tabs.Panel>

        <Tabs.Panel id={CrawlIntervalModes.CUSTOM} className="pt-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">Cron expression (5 fields)</span>
            <input
              className="rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs"
              value={customValue}
              disabled={disabled}
              placeholder="0 */6 * * *"
              onChange={(e) => setCustomValue(e.target.value)}
              onBlur={() => commit(customValue)}
            />
          </label>
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}
