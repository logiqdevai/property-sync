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

export type TableRowActionGroup = {
  id: string;
  label: string;
  icon?: LucideIcon;
  items: TableRowAction[];
};

export type TableRowActionEntry = TableRowAction | TableRowActionGroup;

export type TableRowActionsMenuProps = {
  actions: TableRowActionEntry[];
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

export function isTableRowActionGroup(
  entry: TableRowActionEntry,
): entry is TableRowActionGroup {
  return Array.isArray((entry as TableRowActionGroup).items);
}

export function countTableRowActionEntries(entries: TableRowActionEntry[]): number {
  return entries.reduce(
    (count, entry) =>
      count + (isTableRowActionGroup(entry) ? entry.items.length : 1),
    0,
  );
}

function ActionMenuItem({ action }: { action: TableRowAction }) {
  const Icon = action.icon;
  const tone = getActionTone(action.variant);

  return (
    <Dropdown.Item
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
}

export function ActionMenuEntries({
  entries,
  onAction,
}: {
  entries: TableRowActionEntry[];
  onAction: (actionId: string) => void;
}) {
  return (
    <>
      {entries.map((entry) => {
        if (isTableRowActionGroup(entry)) {
          if (entry.items.length === 0) {
            return null;
          }

          const GroupIcon = entry.icon;

          return (
            <Dropdown.SubmenuTrigger key={entry.id}>
              <Dropdown.Item id={entry.id} textValue={entry.label}>
                <div className="flex w-full items-center gap-2">
                  {GroupIcon ? (
                    <GroupIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
                  ) : null}
                  <Label>{entry.label}</Label>
                </div>
                <Dropdown.SubmenuIndicator />
              </Dropdown.Item>
              <Dropdown.Popover>
                <Dropdown.Menu onAction={(key) => onAction(String(key))}>
                  {entry.items.map((action) => (
                    <ActionMenuItem key={action.id} action={action} />
                  ))}
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown.SubmenuTrigger>
          );
        }

        return <ActionMenuItem key={entry.id} action={entry} />;
      })}
    </>
  );
}

export function TableRowActionsMenu({
  actions,
  onAction,
  ariaLabel = "Row actions",
}: TableRowActionsMenuProps) {
  if (countTableRowActionEntries(actions) === 0) {
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
            <ActionMenuEntries entries={actions} onAction={onAction} />
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
    </div>
  );
}
