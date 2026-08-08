import { Link } from "react-router-dom";

export type DetailErrorStateProps = {
  title?: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
};

export function DetailErrorState({
  title = "Not found",
  description = "This resource could not be found.",
  backHref,
  backLabel = "← Go back",
}: DetailErrorStateProps) {
  return (
    <div className="flex max-w-lg flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
        <p className="text-sm text-muted">{description}</p>
      </div>
      {backHref ? (
        <Link
          to={backHref}
          className="w-fit text-sm text-muted transition-colors hover:text-foreground"
        >
          {backLabel}
        </Link>
      ) : null}
    </div>
  );
}
