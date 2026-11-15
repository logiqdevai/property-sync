import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="inline-flex w-fit items-center gap-1 text-sm text-muted hover:text-foreground">
      <ArrowLeft className="size-4" />
      {label}
    </Link>
  );
}
