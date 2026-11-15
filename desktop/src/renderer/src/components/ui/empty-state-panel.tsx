import type { ComponentType, ReactNode } from "react";
import { Card } from "@heroui/react";

interface EmptyStatePanelProps {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}

export function EmptyStatePanel({ icon: Icon, title, description, action }: EmptyStatePanelProps) {
  return (
    <Card className="items-center gap-3 px-6 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-surface-secondary">
        <Icon className="size-6 text-muted" />
      </span>
      <p className="text-base font-medium text-foreground">{title}</p>
      {description ? <p className="max-w-md text-sm text-muted">{description}</p> : null}
      {action}
    </Card>
  );
}
