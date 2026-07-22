import { useEffect, useState } from "react";
import { Form, Input, Label, Switch } from "@heroui/react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import {
  ESTATEWEB_DEFAULT_AD_LANGUAGES,
  EstateWebAdLanguageFormOptions,
} from "@/config/constants/dropdowns/estateweb-ad-language-form.options";
import type {
  EstateWebIntegrationSettings,
  EstateWebLanguageId,
  EstateWebPushSiteSetting,
} from "@/features/estateweb/interfaces/estateweb-integration-settings.interfaces";
import {
  useUpdateUserIntegrationSettings,
  useUserIntegrationSettings,
} from "@/features/user-integrations/hooks/use-user-integrations";

const EMPTY_SITE: EstateWebPushSiteSetting = {
  selected: true,
  name: "",
  agent_site_id: 0,
  show_on_slider: 0,
  show_on_first_page: 0,
  show_on_relative_pages: 0,
};

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

interface EstateWebPushSitesSettingsFormProps {
  targetId: string;
  onClose: () => void;
}

export function EstateWebPushSitesSettingsForm({
  targetId,
  onClose,
}: EstateWebPushSitesSettingsFormProps) {
  const { data: settings, isPending: settingsPending } = useUserIntegrationSettings(targetId);
  const updateSettings = useUpdateUserIntegrationSettings();

  const [sites, setSites] = useState<EstateWebPushSiteSetting[]>([]);
  const [adLanguages, setAdLanguages] = useState<EstateWebLanguageId[]>(
    ESTATEWEB_DEFAULT_AD_LANGUAGES,
  );

  useEffect(() => {
    setSites(settings?.settings?.estateweb_default_sites ?? []);
    const stored = settings?.settings?.estateweb_ad_languages;
    setAdLanguages(
      Array.isArray(stored) && stored.length > 0
        ? stored
        : ESTATEWEB_DEFAULT_AD_LANGUAGES,
    );
  }, [settings]);

  const addSite = () => {
    setSites((current) => [...current, { ...EMPTY_SITE }]);
  };

  const removeSite = (index: number) => {
    setSites((current) => current.filter((_, i) => i !== index));
  };

  const updateSite = (index: number, patch: Partial<EstateWebPushSiteSetting>) => {
    setSites((current) =>
      current.map((site, i) => (i === index ? { ...site, ...patch } : site)),
    );
  };

  const toggleLanguage = (id: EstateWebLanguageId, enabled: boolean) => {
    setAdLanguages((current) => {
      if (enabled) {
        return current.includes(id) ? current : [...current, id];
      }
      return current.filter((langId) => langId !== id);
    });
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    const payload: EstateWebIntegrationSettings = {
      estateweb_default_sites: sites,
      estateweb_ad_languages:
        adLanguages.length > 0 ? adLanguages : ESTATEWEB_DEFAULT_AD_LANGUAGES,
    };

    updateSettings.mutate(
      { targetId, payload: { settings: payload } },
      { onSuccess: onClose },
    );
  };

  return (
    <Form onSubmit={handleSubmit} className="grid gap-6">
      <div className="grid gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-foreground">Languages</span>
          <p className="text-sm text-muted">
            Languages that receive title and description when pushing properties.
          </p>
        </div>

        {settingsPending ? null : (
          <div className="flex flex-col gap-3">
            {EstateWebAdLanguageFormOptions.map((option) => (
              <div key={option.id} className="flex items-center justify-between gap-3">
                <span className="text-sm text-foreground">{option.label}</span>
                <Switch
                  isSelected={adLanguages.includes(option.id)}
                  onChange={(isSelected) => toggleLanguage(option.id, isSelected)}
                  aria-label={option.label}
                >
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                </Switch>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-3 border-t border-border pt-6">
        <p className="text-sm text-muted">
          Agencies properties get pushed to. Shared by every connected account for this
          integration.
        </p>

        {settingsPending ? null : (
          <div className="flex flex-col gap-3 max-h-96 overflow-y-auto">
            {sites.length === 0 ? (
              <p className="text-sm text-muted py-4 text-center">No agencies added yet.</p>
            ) : (
              sites.map((site, index) => (
                <div
                  key={index}
                  className="flex flex-col gap-4 rounded-xl border border-border bg-surface-secondary p-4"
                >
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <Label htmlFor={`site-name-${index}`}>Name</Label>
                      <Input
                        id={`site-name-${index}`}
                        value={site.name}
                        onChange={(event) => updateSite(index, { name: event.target.value })}
                        placeholder="e.g. re1.gr"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label htmlFor={`site-agent-id-${index}`}>Agent site ID</Label>
                      <Input
                        id={`site-agent-id-${index}`}
                        type="number"
                        value={String(site.agent_site_id)}
                        onChange={(event) =>
                          updateSite(index, { agent_site_id: Number(event.target.value) || 0 })
                        }
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-sm text-foreground">Selected</span>
                      <span className="text-xs text-muted">
                        Include this agency when pushing properties.
                      </span>
                    </div>
                    <Switch
                      isSelected={site.selected}
                      onChange={(isSelected) => updateSite(index, { selected: isSelected })}
                      aria-label="Selected"
                    >
                      <Switch.Control>
                        <Switch.Thumb />
                      </Switch.Control>
                    </Switch>
                  </div>

                  {site.selected ? (
                    <div className="flex flex-col gap-3 border-t border-border pt-3">
                      {SITE_FLAGS.map((flag) => (
                        <div key={flag.key} className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 flex-col gap-0.5">
                            <span className="text-sm text-foreground">{flag.label}</span>
                            <span className="text-xs text-muted">{flag.description}</span>
                          </div>
                          <Switch
                            isSelected={site[flag.key] === 1}
                            onChange={(isSelected) =>
                              updateSite(index, { [flag.key]: isSelected ? 1 : 0 })
                            }
                            aria-label={flag.label}
                          >
                            <Switch.Control>
                              <Switch.Thumb />
                            </Switch.Control>
                          </Switch>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="flex justify-end border-t border-border pt-3">
                    <ActionButtonWithPending
                      type="button"
                      size="sm"
                      variant="danger"
                      onPress={() => removeSite(index)}
                    >
                      Remove
                    </ActionButtonWithPending>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        <ActionButtonWithPending type="button" variant="secondary" onPress={addSite}>
          Add agency
        </ActionButtonWithPending>
      </div>

      <div className="flex justify-end gap-2">
        <ActionButtonWithPending
          type="button"
          variant="secondary"
          onPress={onClose}
          isDisabled={updateSettings.isPending}
        >
          Cancel
        </ActionButtonWithPending>
        <ActionButtonWithPending type="submit" isPending={updateSettings.isPending}>
          Save
        </ActionButtonWithPending>
      </div>
    </Form>
  );
}
