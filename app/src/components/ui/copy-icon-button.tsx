import { useState, type FC } from "react";
import { Button } from "@heroui/react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

type CopyIconButtonProps = {
  value: string;
  ariaLabel: string;
  className?: string;
};

export const CopyIconButton: FC<CopyIconButtonProps> = ({
  value,
  ariaLabel,
  className,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!value) return;

    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Button
      size="sm"
      variant="ghost"
      isIconOnly
      aria-label={copied ? "Copied" : ariaLabel}
      onPress={handleCopy}
      isDisabled={!value}
      className={cn("size-7 min-w-7 shrink-0", className)}
    >
      {copied ? (
        <Check className="size-3.5 text-success" />
      ) : (
        <Copy className="size-3.5" />
      )}
    </Button>
  );
};
