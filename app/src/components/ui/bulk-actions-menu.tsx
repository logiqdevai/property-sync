import { ChevronDown } from "lucide-react";
import { Button, Dropdown, Label } from "@heroui/react";
import { cn } from "@/lib/utils";
import {
  getActionTone,
  type TableRowAction,
} from "@/components/ui/table-row-actions-menu";

export type BulkActionsMenuProps = {
  actions: TableRowAction[];
  onAction: (actionId: string) => void;
  label?: string;
  isDisabled?: boolean;
  isPending?: boolean;
};

export function BulkActionsMenu({
  actions,
  onAction,
  label = "Actions",
  isDisabled = false,
  isPending = false,
}: BulkActionsMenuProps) {
  if (actions.length === 0) {
    return null;
  }

  return (
    <Dropdown>
      <Dropdown.Trigger>
        <Button variant="secondary" isDisabled={isDisabled} isPending={isPending}>
          {label}
          <ChevronDown className="h-4 w-4" />
        </Button>
      </Dropdown.Trigger>
      <Dropdown.Popover>
        <Dropdown.Menu onAction={(key) => onAction(String(key))}>
          {actions.map((action) => {
            const Icon = action.icon;
            const tone = getActionTone(action.variant);

            return (
              <Dropdown.Item
                key={action.id}
                id={action.id}
                textValue={action.label}
                variant={action.variant === "danger" ? "danger" : undefined}
                isDisabled={action.isDisabled}
              >
                <div className="flex w-full items-center gap-2">
                  {Icon ? (
                    <Icon className={cn("h-3.5 w-3.5 shrink-0", tone.icon)} />
                  ) : null}
                  <Label className={tone.label}>{action.label}</Label>
                </div>
              </Dropdown.Item>
            );
          })}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
