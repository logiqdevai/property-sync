import type { ReactNode } from "react";
import { Alert } from "@heroui/react";

interface NoticeProps {
  status?: "accent" | "danger" | "default" | "success" | "warning";
  title: ReactNode;
  description?: ReactNode;
  /** Buttons under the text. */
  actions?: ReactNode;
  className?: string;
}

/** A HeroUI Alert with a title, optional text and optional actions. */
export function Notice({ status = "default", title, description, actions, className }: NoticeProps) {
  return (
    <Alert status={status} className={className}>
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>{title}</Alert.Title>
        {description ? <Alert.Description>{description}</Alert.Description> : null}
        {actions ? <div className="mt-3 flex flex-wrap gap-2">{actions}</div> : null}
      </Alert.Content>
    </Alert>
  );
}
