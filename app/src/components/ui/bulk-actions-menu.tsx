import { ChevronDown } from "lucide-react";
import { Button, Dropdown } from "@heroui/react";
import {
  ActionMenuEntries,
  countTableRowActionEntries,
  type TableRowActionEntry,
} from "@/components/ui/table-row-actions-menu";

export type BulkActionsMenuProps = {
  actions: TableRowActionEntry[];
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
  if (countTableRowActionEntries(actions) === 0) {
    return null;
  }

  return (
    <Dropdown>
      <Button variant="secondary" isDisabled={isDisabled} isPending={isPending}>
        {label}
        <ChevronDown className="h-4 w-4" />
      </Button>
      <Dropdown.Popover className="max-h-[min(24rem,70dvh)] overflow-y-auto">
        <Dropdown.Menu onAction={(key) => onAction(String(key))}>
          <ActionMenuEntries entries={actions} onAction={onAction} />
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
