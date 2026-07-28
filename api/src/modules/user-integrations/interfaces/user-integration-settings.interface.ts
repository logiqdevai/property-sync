import { EstateWebIntegrationSettings } from '@/integrations/estateweb/interfaces/estateweb-integration-settings.interface';
import { SalesPricingSettings } from './sales-pricing-settings.interface';

export type UserIntegrationSettingsData = Partial<EstateWebIntegrationSettings> & {
  sales?: SalesPricingSettings;
};
