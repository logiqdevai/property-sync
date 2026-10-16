import { useState, type FC } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Pencil } from "lucide-react";
import { formatDate } from "@/lib/date";
import { Routes } from "@/routes/routes";
import type { DelistedPropertyAlert } from "@/features/property-clients/interfaces/property-clients.interfaces";

type DelistedAlertsListProps = {
  alerts: DelistedPropertyAlert[];
  onNavigate?: () => void;
  /** When set, clicking a client opens its notes (view/edit) for that property. */
  onOpenClients?: (property: { id: string; title: string }) => void;
};

/** Properties shown to clients that were delisted, each with a togglable list of its clients. */
export const DelistedAlertsList: FC<DelistedAlertsListProps> = ({ alerts, onNavigate, onOpenClients }) => {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleClients = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <ul className="flex flex-col gap-2">
      {alerts.map((alert) => {
        const isCollapsed = collapsed.has(alert.user_property_id);
        return (
          <li key={alert.user_property_id} className="rounded-lg border border-border p-3">
            <div className="flex items-start justify-between gap-2">
              <Link
                to={Routes.dashboard.properties.detail(alert.user_property_id)}
                onClick={onNavigate}
                className="min-w-0 break-words text-sm font-medium text-accent hover:underline"
              >
                {alert.internal_id ? `${alert.internal_id} · ` : ""}
                {alert.title}
              </Link>
              {alert.acknowledged ? (
                <span className="shrink-0 text-xs text-muted">Seen</span>
              ) : null}
            </div>
            <button
              type="button"
              className="mt-1 flex items-center gap-1 text-sm text-muted hover:text-foreground"
              aria-expanded={!isCollapsed}
              onClick={() => toggleClients(alert.user_property_id)}
            >
              <ChevronDown
                className={`size-4 transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
              />
              {isCollapsed ? "Show" : "Hide"} clients ({alert.clients.length})
            </button>
            {!isCollapsed && (
              <ul className="mt-2 flex flex-col gap-1.5">
                {alert.clients.map((c) => {
                  const content = (
                    <>
                    <p className="font-medium text-foreground">
                      {c.name}
                      <span className="font-normal text-muted">
                        {" "}
                        · shown {formatDate(c.shown_at)}
                        {c.phone ? ` · ${c.phone}` : ""}
                      </span>
                    </p>
                    {c.notes && (
                      <p className="mt-0.5 whitespace-pre-wrap break-words text-muted">
                        {c.notes}
                      </p>
                    )}
                    </>
                  );
                  return (
                    <li key={c.id}>
                      {onOpenClients ? (
                        <button
                          type="button"
                          aria-label={`View or edit notes for ${c.name}`}
                          onClick={() =>
                            onOpenClients({ id: alert.user_property_id, title: alert.title })
                          }
                          className="flex w-full min-w-0 cursor-pointer items-start justify-between gap-2 rounded-md bg-surface-secondary px-3 py-2 text-left text-sm transition-colors hover:ring-1 hover:ring-border"
                        >
                          <span className="min-w-0 flex-1 break-words">{content}</span>
                          <Pencil className="mt-0.5 size-4 shrink-0 text-muted" />
                        </button>
                      ) : (
                        <div className="min-w-0 break-words rounded-md bg-surface-secondary px-3 py-2 text-sm">
                          {content}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
};
