import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Form, Label, TextArea, FieldError } from "@heroui/react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import {
  sendTelegramTestSchema,
  type SendTelegramTestFormValues,
} from "@/features/notifications/validation-schemas/notifications.schema";

interface SendTelegramTestFormProps {
  isPending: boolean;
  onSubmit: (values: SendTelegramTestFormValues) => void;
  onCancel: () => void;
}

export function SendTelegramTestForm({
  isPending,
  onSubmit,
  onCancel,
}: SendTelegramTestFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SendTelegramTestFormValues>({
    resolver: zodResolver(sendTelegramTestSchema),
    defaultValues: {
      message: "Property Sync Telegram test message",
    },
  });

  return (
    <Form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor="telegram-test-message">Message</Label>
        <TextArea
          id="telegram-test-message"
          rows={5}
          disabled={isPending}
          {...register("message")}
        />
        {errors.message ? <FieldError>{errors.message.message}</FieldError> : null}
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button variant="secondary" isDisabled={isPending} onPress={onCancel}>
          Cancel
        </Button>
        <ActionButtonWithPending type="submit" isPending={isPending}>
          Send test
        </ActionButtonWithPending>
      </div>
    </Form>
  );
}
