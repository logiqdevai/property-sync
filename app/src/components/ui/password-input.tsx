import { forwardRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@heroui/react";
import { cn } from "@/lib/utils";

type PasswordInputProps = Omit<React.ComponentProps<typeof Input>, "type"> & {
  maskedPreview?: string | null;
};

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput(
    { className, maskedPreview, value, onChange, onFocus, ...props },
    ref,
  ) {
    const [show, setShow] = useState(false);
    const [previewDismissed, setPreviewDismissed] = useState(false);
    const isControlled = value !== undefined;
    const controlledValue = value ?? "";

    const showMaskedPreview =
      isControlled &&
      show &&
      !!maskedPreview &&
      controlledValue === "" &&
      !previewDismissed;
    const inputValue = showMaskedPreview ? maskedPreview : isControlled ? controlledValue : undefined;

    const handleToggleShow = () => {
      setShow((current) => {
        if (!current) {
          setPreviewDismissed(false);
        }
        return !current;
      });
    };

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      if (showMaskedPreview) {
        setPreviewDismissed(true);
        const nextValue = event.target.value.startsWith(maskedPreview!)
          ? event.target.value.slice(maskedPreview!.length)
          : event.target.value;
        onChange?.({
          ...event,
          target: { ...event.target, value: nextValue },
        });
        return;
      }

      onChange?.(event);
    };

    const handleFocus = (event: React.FocusEvent<HTMLInputElement>) => {
      if (showMaskedPreview) {
        setPreviewDismissed(true);
      }
      onFocus?.(event);
    };

    return (
      <div className="relative">
        <Input
          {...props}
          ref={ref}
          type={show ? "text" : "password"}
          {...(isControlled ? { value: inputValue } : {})}
          onChange={handleChange}
          onFocus={handleFocus}
          className={cn("pr-10", className)}
          fullWidth
        />
        <button
          type="button"
          onClick={handleToggleShow}
          tabIndex={-1}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    );
  },
);
