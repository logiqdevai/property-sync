import type { ReactNode } from "react";
import { Check, Circle, X } from "lucide-react";
import { Spinner } from "@heroui/react";
import { cn } from "@/lib/utils";

export type StepStatus = "done" | "active" | "pending" | "failed";

export interface Step {
  key: string;
  title: string;
  description?: ReactNode;
  status: StepStatus;
}

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "done") {
    return (
      <span className="flex size-6 items-center justify-center rounded-full bg-success text-success-foreground">
        <Check className="size-3.5" aria-hidden />
      </span>
    );
  }
  if (status === "active") {
    return (
      <span className="flex size-6 items-center justify-center rounded-full bg-accent-soft">
        <Spinner size="sm" color="accent" />
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="flex size-6 items-center justify-center rounded-full bg-danger text-danger-foreground">
        <X className="size-3.5" aria-hidden />
      </span>
    );
  }
  return (
    <span className="flex size-6 items-center justify-center rounded-full border border-border text-muted">
      <Circle className="size-2" aria-hidden />
    </span>
  );
}

/** A vertical list of steps; the active one shows a spinner and its description. */
export function StepList({ steps }: { steps: Step[] }) {
  return (
    <ol className="flex flex-col gap-4">
      {steps.map((step) => (
        <li key={step.key} className="flex gap-3">
          <StepIcon status={step.status} />
          <div className="flex min-w-0 flex-col gap-0.5 pt-0.5">
            <span
              className={cn(
                "text-sm font-medium",
                step.status === "pending" ? "text-muted" : "text-foreground",
              )}
            >
              {step.title}
            </span>
            {step.description && step.status !== "pending" ? (
              <span className="text-sm text-muted">{step.description}</span>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
