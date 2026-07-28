import { useEffect, useState } from "react";
import { Accordion, Form, Input, Label, Switch } from "@heroui/react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { EstateWebPushSitesList } from "@/components/ui/estateweb-push-sites-list";
import {
  ESTATEWEB_DEFAULT_AD_LANGUAGES,
  EstateWebAdLanguageFormOptions,
} from "@/config/constants/dropdowns/integrations/estateweb-ad-language-form.options";
import {
  ESTATEWEB_DEFAULT_LISTING_TYPES,
  EstateWebListingTypeFormOptions,
} from "@/config/constants/dropdowns/properties/listing-type-form.options";
import type {
  EstateWebLanguageId,
  EstateWebPushSiteSetting,
} from "@/features/estateweb/interfaces/estateweb-integration-settings.interfaces";
import type { ListingType } from "@/features/properties/interfaces/properties.interfaces";
import type {
  SalesPricingSettings,
  UserIntegrationSettingsData,
} from "@/features/user-integrations/interfaces/user-integrations.interfaces";
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

const DEFAULT_SALES: SalesPricingSettings = {
  enable_sales: false,
  sale_percentage_start: 0.05,
  sale_percentage_end: 0.1,
};

const ALLOWED_LISTING_TYPE_IDS = new Set(
  EstateWebListingTypeFormOptions.map((option) => option.id),
);

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
  const [listingTypes, setListingTypes] = useState<ListingType[]>(
    ESTATEWEB_DEFAULT_LISTING_TYPES,
  );
  const [sales, setSales] = useState<SalesPricingSettings>(DEFAULT_SALES);

  useEffect(() => {
    setSites(settings?.settings?.estateweb_default_sites ?? []);
    const storedLanguages = settings?.settings?.estateweb_ad_languages;
    setAdLanguages(
      Array.isArray(storedLanguages) && storedLanguages.length > 0
        ? storedLanguages
        : ESTATEWEB_DEFAULT_AD_LANGUAGES,
    );
    const storedListingTypes = settings?.settings?.estateweb_listing_types;
    const filteredListingTypes = Array.isArray(storedListingTypes)
      ? storedListingTypes.filter((type) => ALLOWED_LISTING_TYPE_IDS.has(type))
      : [];
    setListingTypes(
      filteredListingTypes.length > 0
        ? filteredListingTypes
        : ESTATEWEB_DEFAULT_LISTING_TYPES,
    );
    const storedSales = settings?.settings?.sales;
    setSales(
      storedSales
        ? {
            enable_sales: Boolean(storedSales.enable_sales),
            sale_percentage_start:
              typeof storedSales.sale_percentage_start === "number"
                ? storedSales.sale_percentage_start
                : DEFAULT_SALES.sale_percentage_start,
            sale_percentage_end:
              typeof storedSales.sale_percentage_end === "number"
                ? storedSales.sale_percentage_end
                : DEFAULT_SALES.sale_percentage_end,
          }
        : DEFAULT_SALES,
    );
  }, [settings]);

  const addSite = () => {
    setSites((current) => [...current, { ...EMPTY_SITE }]);
  };

  const toggleLanguage = (id: EstateWebLanguageId, enabled: boolean) => {
    setAdLanguages((current) => {
      if (enabled) {
        return current.includes(id) ? current : [...current, id];
      }
      return current.filter((langId) => langId !== id);
    });
  };

  const toggleListingType = (id: ListingType, enabled: boolean) => {
    setListingTypes((current) => {
      if (enabled) {
        return current.includes(id) ? current : [...current, id];
      }
      return current.filter((type) => type !== id);
    });
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    const start = Number(sales.sale_percentage_start);
    const end = Number(sales.sale_percentage_end);
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 0 ||
      end > 1 ||
      start > end
    ) {
      return;
    }

    const payload: UserIntegrationSettingsData = {
      estateweb_default_sites: sites,
      estateweb_ad_languages:
        adLanguages.length > 0 ? adLanguages : ESTATEWEB_DEFAULT_AD_LANGUAGES,
      estateweb_listing_types:
        listingTypes.length > 0 ? listingTypes : ESTATEWEB_DEFAULT_LISTING_TYPES,
      sales: {
        enable_sales: sales.enable_sales,
        sale_percentage_start: start,
        sale_percentage_end: end,
      },
    };

    updateSettings.mutate(
      { targetId, payload: { settings: payload } },
      { onSuccess: onClose },
    );
  };

  return (
    <Form onSubmit={handleSubmit} className="grid gap-6">
      <Accordion allowsMultipleExpanded defaultExpandedKeys={[]} className="w-full">
        <Accordion.Item id="listing-types">
          <Accordion.Heading>
            <Accordion.Trigger className="text-sm font-medium text-foreground">
              Listing types
              <Accordion.Indicator />
            </Accordion.Trigger>
          </Accordion.Heading>
          <Accordion.Panel>
            <Accordion.Body>
              <div className="grid gap-3 pb-2">
                <p className="text-sm text-muted">
                  Only matching listing types become user properties after each crawl.
                </p>
                {settingsPending ? null : (
                  <div className="flex flex-col gap-3">
                    {EstateWebListingTypeFormOptions.map((option) => (
                      <div
                        key={option.id}
                        className="flex items-center justify-between gap-3"
                      >
                        <span className="text-sm text-foreground">{option.label}</span>
                        <Switch
                          isSelected={listingTypes.includes(option.id)}
                          onChange={(isSelected) =>
                            toggleListingType(option.id, isSelected)
                          }
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
            </Accordion.Body>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item id="languages">
          <Accordion.Heading>
            <Accordion.Trigger className="text-sm font-medium text-foreground">
              Languages
              <Accordion.Indicator />
            </Accordion.Trigger>
          </Accordion.Heading>
          <Accordion.Panel>
            <Accordion.Body>
              <div className="grid gap-3 pb-2">
                <p className="text-sm text-muted">
                  Languages that receive title and description when pushing properties.
                </p>
                {settingsPending ? null : (
                  <div className="flex flex-col gap-3">
                    {EstateWebAdLanguageFormOptions.map((option) => (
                      <div
                        key={option.id}
                        className="flex items-center justify-between gap-3"
                      >
                        <span className="text-sm text-foreground">{option.label}</span>
                        <Switch
                          isSelected={adLanguages.includes(option.id)}
                          onChange={(isSelected) =>
                            toggleLanguage(option.id, isSelected)
                          }
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
            </Accordion.Body>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item id="agencies">
          <Accordion.Heading>
            <Accordion.Trigger className="text-sm font-medium text-foreground">
              Agencies
              <Accordion.Indicator />
            </Accordion.Trigger>
          </Accordion.Heading>
          <Accordion.Panel>
            <Accordion.Body>
              <div className="grid gap-3 pb-2">
                <p className="text-sm text-muted">
                  Agencies properties get pushed to. Shared by every connected account for
                  this integration.
                </p>

                {settingsPending ? null : (
                  <EstateWebPushSitesList
                    sites={sites}
                    onChange={setSites}
                    mode="configure"
                    isDisabled={updateSettings.isPending}
                  />
                )}

                <ActionButtonWithPending type="button" variant="secondary" onPress={addSite}>
                  Add agency
                </ActionButtonWithPending>
              </div>
            </Accordion.Body>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item id="sales-pricing">
          <Accordion.Heading>
            <Accordion.Trigger className="text-sm font-medium text-foreground">
              Sales pricing
              <Accordion.Indicator />
            </Accordion.Trigger>
          </Accordion.Heading>
          <Accordion.Panel>
            <Accordion.Body>
              <div className="grid gap-4 pb-2">
                <p className="text-sm text-muted">
                  When enabled and a listing has no source price_start, each CMS sync sets
                  price_start = price × (1 + random%) between the range below.
                </p>
                {settingsPending ? null : (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-foreground">Enable sales</span>
                      <Switch
                        isSelected={sales.enable_sales}
                        onChange={(isSelected) =>
                          setSales((current) => ({
                            ...current,
                            enable_sales: isSelected,
                          }))
                        }
                        aria-label="Enable sales"
                      >
                        <Switch.Control>
                          <Switch.Thumb />
                        </Switch.Control>
                      </Switch>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="flex flex-col gap-1">
                        <Label htmlFor="sale-percentage-start">Sale % start</Label>
                        <Input
                          id="sale-percentage-start"
                          type="number"
                          min={0}
                          max={1}
                          step={0.01}
                          value={String(sales.sale_percentage_start)}
                          onChange={(event) =>
                            setSales((current) => ({
                              ...current,
                              sale_percentage_start: Number(event.target.value),
                            }))
                          }
                          placeholder="0.05"
                          disabled={!sales.enable_sales || updateSettings.isPending}
                          fullWidth
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label htmlFor="sale-percentage-end">Sale % end</Label>
                        <Input
                          id="sale-percentage-end"
                          type="number"
                          min={0}
                          max={1}
                          step={0.01}
                          value={String(sales.sale_percentage_end)}
                          onChange={(event) =>
                            setSales((current) => ({
                              ...current,
                              sale_percentage_end: Number(event.target.value),
                            }))
                          }
                          placeholder="0.1"
                          disabled={!sales.enable_sales || updateSettings.isPending}
                          fullWidth
                        />
                      </div>
                    </div>
                    <p className="text-xs text-muted">
                      Fractions only (e.g. 0.05 = 5%, 0.1 = 10%). Start must be ≤ end.
                    </p>
                  </>
                )}
              </div>
            </Accordion.Body>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>

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
