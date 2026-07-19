import type { LucideIcon } from "lucide-react";
import { MoreHorizontal } from "lucide-react";
import { Button, Dropdown, Label } from "@heroui/react";
import { cn } from "@/lib/utils";

export type TableRowActionVariant = "default" | "accent" | "warning" | "danger";

export type TableRowAction = {
  id: string;
  label: string;
  variant?: TableRowActionVariant;
  icon?: LucideIcon;
  isDisabled?: boolean;
};

export type TableRowActionsMenuProps = {
  actions: TableRowAction[];
  onAction: (actionId: string) => void;
  ariaLabel?: string;
};

const actionToneClass: Record<TableRowActionVariant, string> = {
  default: "text-foreground",
  accent: "text-accent",
  warning: "text-warning",
  danger: "text-danger",
};

const actionIconToneClass: Record<TableRowActionVariant, string> = {
  default: "text-muted",
  accent: "text-accent",
  warning: "text-warning",
  danger: "text-danger",
};

export function getActionTone(variant: TableRowActionVariant = "default") {
  return {
    label: actionToneClass[variant],
    icon: actionIconToneClass[variant],
  };
}

export function TableRowActionsMenu({
  actions,
  onAction,
  ariaLabel = "Row actions",
}: TableRowActionsMenuProps) {
  if (actions.length === 0) {
    return <span className="text-muted text-sm">—</span>;
  }

  return (
    <div onClick={(event) => event.stopPropagation()}>
      <Dropdown>
        <Button size="sm" variant="ghost" aria-label={ariaLabel} className="min-w-8 px-2">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
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
    </div>
  );
}
