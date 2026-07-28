import type { Dispatch, SetStateAction } from "react";
import { Checkbox, Input, Label } from "@heroui/react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import type { EstateWebPushSiteSetting } from "@/features/estateweb/interfaces/estateweb-integration-settings.interfaces";

type SiteFlagKey = "show_on_slider" | "show_on_first_page" | "show_on_relative_pages";

const SITE_FLAGS: { key: SiteFlagKey; label: string; description: string }[] = [
  {
    key: "show_on_slider",
    label: "Slider",
    description: "Feature this listing in the homepage slider.",
  },
  {
    key: "show_on_first_page",
    label: "First page",
    description: "Show this listing on the site's first page.",
  },
  {
    key: "show_on_relative_pages",
    label: "Relative pages",
    description: "Show this listing on related category/location pages.",
  },
];

type EstateWebPushSitesListProps = {
  sites: EstateWebPushSiteSetting[];
  onChange: Dispatch<SetStateAction<EstateWebPushSiteSetting[]>>;
  mode?: "configure" | "select";
  emptyLabel?: string;
  isDisabled?: boolean;
};

export function EstateWebPushSitesList({
  sites,
  onChange,
  mode = "configure",
  emptyLabel = "No agencies added yet.",
  isDisabled = false,
}: EstateWebPushSitesListProps) {
  const isSelectMode = mode === "select";
  const allSelected = sites.length > 0 && sites.every((site) => site.selected);

  const updateSite = (index: number, patch: Partial<EstateWebPushSiteSetting>) => {
    onChange((current) =>
      current.map((site, i) => (i === index ? { ...site, ...patch } : site)),
    );
  };

  const removeSite = (index: number) => {
    onChange((current) => current.filter((_, i) => i !== index));
  };

  const toggleSelectAll = () => {
    onChange((current) =>
      current.map((site) => ({
        ...site,
        selected: !allSelected,
      })),
    );
  };

  if (sites.length === 0) {
    return <p className="text-sm text-muted py-4 text-center">{emptyLabel}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <ActionButtonWithPending
          type="button"
          size="sm"
          variant="secondary"
          onPress={toggleSelectAll}
          isDisabled={isDisabled}
        >
          {allSelected ? "Deselect All" : "Select All"}
        </ActionButtonWithPending>
      </div>

      {sites.map((site, index) => (
        <div
          key={`${site.agent_site_id}-${index}`}
          className="flex flex-col gap-4 rounded-xl border border-border bg-surface-secondary p-4"
        >
          {isSelectMode ? (
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-medium text-foreground">
                {site.name || `Site ${site.agent_site_id}`}
              </span>
              <span className="text-xs text-muted">Agent site ID: {site.agent_site_id}</span>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor={`site-name-${index}`}>Name</Label>
                <Input
                  id={`site-name-${index}`}
                  value={site.name}
                  onChange={(event) => updateSite(index, { name: event.target.value })}
                  placeholder="e.g. re1.gr"
                  disabled={isDisabled}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`site-agent-id-${index}`}>Agent site ID</Label>
                <Input
                  id={`site-agent-id-${index}`}
                  type="number"
                  value={String(site.agent_site_id)}
                  onChange={(event) =>
                    updateSite(index, {
                      agent_site_id: Number(event.target.value) || 0,
                    })
                  }
                  disabled={isDisabled}
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm text-foreground">Selected</span>
              <span className="text-xs text-muted">
                {isSelectMode
                  ? "Publish this property to this agency."
                  : "Include this agency when pushing properties."}
              </span>
            </div>
            <Checkbox
              aria-label="Selected"
              isSelected={site.selected}
              isDisabled={isDisabled}
              onChange={(isSelected) => updateSite(index, { selected: isSelected })}
            >
              <Checkbox.Control className="size-6">
                <Checkbox.Indicator className="size-4" />
              </Checkbox.Control>
            </Checkbox>
          </div>

          {site.selected ? (
            <div className="flex flex-col gap-3 border-t border-border pt-3">
              {SITE_FLAGS.map((flag) => (
                <div key={flag.key} className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm text-foreground">{flag.label}</span>
                    <span className="text-xs text-muted">{flag.description}</span>
                  </div>
                  <Checkbox
                    aria-label={flag.label}
                    isSelected={site[flag.key] === 1}
                    isDisabled={isDisabled}
                    onChange={(isSelected) =>
                      updateSite(index, {
                        [flag.key]: isSelected ? 1 : 0,
                      })
                    }
                  >
                    <Checkbox.Control className="size-6">
                      <Checkbox.Indicator className="size-4" />
                    </Checkbox.Control>
                  </Checkbox>
                </div>
              ))}
            </div>
          ) : null}

          {!isSelectMode ? (
            <div className="flex justify-end border-t border-border pt-3">
              <ActionButtonWithPending
                type="button"
                size="sm"
                variant="danger"
                onPress={() => removeSite(index)}
                isDisabled={isDisabled}
              >
                Remove
              </ActionButtonWithPending>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
