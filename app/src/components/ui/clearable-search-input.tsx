import { X } from "lucide-react";
import { Input } from "@heroui/react";
import { cn } from "@/lib/utils";

type ClearableSearchInputProps = Omit<
  React.ComponentProps<typeof Input>,
  "value" | "onChange"
> & {
  value: string;
  onValueChange: (value: string) => void;
};

export function ClearableSearchInput({
  value,
  onValueChange,
  className,
  ...props
}: ClearableSearchInputProps) {
  const hasValue = value.length > 0;

  return (
    <div className={cn("relative", className)}>
      <Input
        {...props}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className={cn("w-full", hasValue && "pr-9")}
      />
      {hasValue ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onValueChange("")}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-sm text-muted transition-colors hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
