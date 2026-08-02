import { Checkbox, Input, Label, ListBox, Select } from "@heroui/react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { BlockRuleSourceFormOptions } from "@/config/constants/dropdowns/agencies/block-rule-source-form.options";
import { BlockSignalFormOptions } from "@/config/constants/dropdowns/agencies/block-signal-form.options";
import type { BlockRule } from "@/features/agencies/interfaces/agencies.interfaces";
import { EmptyBlockRule } from "@/features/agencies/validation-schemas/agencies.schema";

type BlockRulesEditorProps = {
  rules: BlockRule[];
  onChange: (rules: BlockRule[]) => void;
  isDisabled?: boolean;
};

export function BlockRulesEditor({
  rules,
  onChange,
  isDisabled = false,
}: BlockRulesEditorProps) {
  const updateRule = (index: number, patch: Partial<BlockRule>) => {
    onChange(rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)));
  };

  const removeRule = (index: number) => {
    onChange(rules.filter((_, i) => i !== index));
  };

  const addRule = () => {
    onChange([...rules, { ...EmptyBlockRule }]);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-foreground">Block-handling rules</span>
          <span className="text-xs text-muted">
            Extra detection rules for this agency. Leave empty to use built-in defaults only.
          </span>
        </div>
        <ActionButtonWithPending
          type="button"
          size="sm"
          variant="secondary"
          onPress={addRule}
          isDisabled={isDisabled}
        >
          Add rule
        </ActionButtonWithPending>
      </div>

      {rules.length === 0 ? (
        <p className="text-sm text-muted py-3 text-center rounded-xl border border-dashed border-border">
          No extra rules — built-in defaults apply
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {rules.map((rule, index) => (
            <div
              key={rule.id ?? `rule-${index}`}
              className="flex flex-col gap-3 rounded-xl border border-border bg-surface-secondary p-4"
            >
              <div className="flex flex-col gap-1">
                <Label htmlFor={`block-rule-label-${index}`}>Label</Label>
                <Input
                  id={`block-rule-label-${index}`}
                  value={rule.label ?? ""}
                  onChange={(event) => updateRule(index, { label: event.target.value })}
                  placeholder="e.g. CloudFront token challenge"
                  disabled={isDisabled}
                  fullWidth
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Select
                  selectedKey={rule.signal}
                  isDisabled={isDisabled}
                  onSelectionChange={(key) => {
                    if (key) {
                      updateRule(index, {
                        signal: String(key) as BlockRule["signal"],
                      });
                    }
                  }}
                >
                  <Label>Signal</Label>
                  <Select.Trigger>
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox items={BlockSignalFormOptions}>
                      {(option) => (
                        <ListBox.Item id={option.id} textValue={option.label}>
                          {option.label}
                        </ListBox.Item>
                      )}
                    </ListBox>
                  </Select.Popover>
                </Select>

                <Select
                  selectedKey={rule.source}
                  isDisabled={isDisabled}
                  onSelectionChange={(key) => {
                    if (key) {
                      updateRule(index, {
                        source: String(key) as BlockRule["source"],
                      });
                    }
                  }}
                >
                  <Label>Match against</Label>
                  <Select.Trigger>
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox items={BlockRuleSourceFormOptions}>
                      {(option) => (
                        <ListBox.Item id={option.id} textValue={option.label}>
                          {option.label}
                        </ListBox.Item>
                      )}
                    </ListBox>
                  </Select.Popover>
                </Select>
              </div>

              <div className="flex flex-col gap-1">
                <Label htmlFor={`block-rule-pattern-${index}`}>Pattern</Label>
                <Input
                  id={`block-rule-pattern-${index}`}
                  value={rule.pattern}
                  onChange={(event) => updateRule(index, { pattern: event.target.value })}
                  placeholder={
                    rule.source === "SELECTOR"
                      ? ".cf-challenge"
                      : "e.g. 69616d7761746368696e67796f75"
                  }
                  className="font-mono text-xs"
                  disabled={isDisabled}
                  fullWidth
                />
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm text-foreground">Treat as regex</span>
                  <span className="text-xs text-muted">
                    Match pattern as a regular expression instead of a plain substring.
                  </span>
                </div>
                <Checkbox
                  aria-label="Treat as regex"
                  isSelected={Boolean(rule.is_regex)}
                  isDisabled={isDisabled}
                  onChange={(isSelected) => updateRule(index, { is_regex: isSelected })}
                >
                  <Checkbox.Control className="size-6">
                    <Checkbox.Indicator className="size-4" />
                  </Checkbox.Control>
                </Checkbox>
              </div>

              {rule.is_regex ? (
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`block-rule-flags-${index}`}>Regex flags</Label>
                  <Input
                    id={`block-rule-flags-${index}`}
                    value={rule.regex_flags ?? ""}
                    onChange={(event) =>
                      updateRule(index, { regex_flags: event.target.value })
                    }
                    placeholder="i"
                    className="font-mono text-xs"
                    disabled={isDisabled}
                    fullWidth
                  />
                </div>
              ) : null}

              <div className="flex justify-end border-t border-border pt-3">
                <ActionButtonWithPending
                  type="button"
                  size="sm"
                  variant="danger"
                  onPress={() => removeRule(index)}
                  isDisabled={isDisabled}
                >
                  Remove
                </ActionButtonWithPending>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
