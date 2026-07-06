import { Skeleton } from "@heroui/react";
import { cn } from "@/lib/utils";

export type TableSkeletonProps = {
  rows?: number;
  columns?: number;
  showHeader?: boolean;
  className?: string;
};

export function TableSkeleton({
  rows = 8,
  columns = 5,
  showHeader = true,
  className,
}: TableSkeletonProps) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {showHeader && (
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton key={`header-${i}`} className="h-4 w-full rounded-md" />
          ))}
        </div>
      )}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={`row-${rowIndex}`}
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton
              key={`cell-${rowIndex}-${colIndex}`}
              className="h-10 w-full rounded-lg"
            />
          ))}
        </div>
      ))}
    </div>
  );
}
