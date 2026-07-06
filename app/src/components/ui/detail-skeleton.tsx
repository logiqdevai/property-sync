import { Skeleton } from "@heroui/react";
import { cn } from "@/lib/utils";
import { TableSkeleton } from "@/components/ui/table-skeleton";

export type DetailSkeletonProps = {
  fieldCount?: number;
  showSubTable?: boolean;
  subTableRows?: number;
  className?: string;
};

export function DetailSkeleton({
  fieldCount = 6,
  showSubTable = true,
  subTableRows = 4,
  className,
}: DetailSkeletonProps) {
  return (
    <div className={cn("flex flex-col gap-8", className)}>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64 rounded-lg" />
        <Skeleton className="h-4 w-96 max-w-full rounded-md" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: fieldCount }).map((_, i) => (
          <div key={`field-${i}`} className="flex flex-col gap-2">
            <Skeleton className="h-3 w-24 rounded-md" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        ))}
      </div>
      {showSubTable && (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-6 w-48 rounded-md" />
          <TableSkeleton rows={subTableRows} columns={4} showHeader />
        </div>
      )}
    </div>
  );
}
