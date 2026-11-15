import { Spinner } from "@heroui/react";
import { BlockStates, type BlockState } from "@shared/ipc";
import { Notice } from "@/components/ui/notice";

/**
 * The one place the user has to act during a task: a "prove you're a person" check the app could
 * not pass by itself. While it's being solved automatically, only a quiet line is shown.
 */
export function NeedsHelpNotice({ block }: { block: BlockState }) {
  if (block === BlockStates.SOLVING) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner size="sm" color="current" />
        The website is checking for robots. Getting past it automatically…
      </div>
    );
  }
  if (block !== BlockStates.NEEDS_USER) return null;
  return (
    <Notice
      status="warning"
      title="Your help is needed"
      description={
        <>
          The website wants to check that you're a person. Go to the <strong>Chrome window</strong> and complete
          the check (for example, tick the box or pick the pictures). The crawl continues by itself afterwards.
        </>
      }
    />
  );
}
