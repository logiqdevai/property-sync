import { Card } from "@heroui/react";
import { ImageOff } from "lucide-react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";

interface PhotoStartCardProps {
  agencyName: string;
  isStarting: boolean;
  onStart(): void;
}

export function PhotoStartCard({ agencyName, isStarting, onStart }: PhotoStartCardProps) {
  return (
    <Card className="gap-5 p-6">
      <Card.Header className="flex flex-col gap-1">
        <Card.Title>Fix missing photos</Card.Title>
        <Card.Description>
          Use this after you pushed {agencyName}'s listings to the CRM. It checks every listing in the CRM, and for
          the ones without photos, copies the photos from the agency's website through Chrome. Listings that already
          have photos are not touched.
        </Card.Description>
      </Card.Header>
      <div>
        <ActionButtonWithPending
          variant="primary"
          isPending={isStarting}
          isDisabled={isStarting}
          idleLeading={<ImageOff className="size-4" />}
          onPress={onStart}
        >
          Check photos
        </ActionButtonWithPending>
      </div>
    </Card>
  );
}
