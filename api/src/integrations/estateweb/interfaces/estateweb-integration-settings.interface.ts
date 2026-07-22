import {
  EstateWebBooleanFlag,
  EstateWebLanguageId,
} from '../constants/estateweb-enums.constants';

export interface EstateWebPushSiteSetting {
  selected: boolean;
  name: string;
  agent_site_id: number;
  show_on_slider: EstateWebBooleanFlag;
  show_on_first_page: EstateWebBooleanFlag;
  show_on_relative_pages: EstateWebBooleanFlag;
}

export interface EstateWebIntegrationSettings {
  estateweb_default_sites: EstateWebPushSiteSetting[];
  estateweb_ad_languages: EstateWebLanguageId[];
}
