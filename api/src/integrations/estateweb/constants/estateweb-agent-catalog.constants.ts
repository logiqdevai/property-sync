import { EstateWebPushSiteSetting } from '../interfaces/estateweb-integration-settings.interface';

export const ESTATEWEB_INIT_AGENT_SITES = [
  { id: 1002, name: '1. re1.gr' },
  { id: 1004, name: '2. synergazomenoi-mesites.gr' },
  { id: 2, name: '3. akinitakritis.gr' },
  { id: 32, name: '4. mesitikes-aggelies.gr' },
  { id: 1003, name: '6. greekpropertyfinder.gr' },
  { id: 11, name: '5. luxury-properties-greece.gr' },
] as const;

export type EstateWebAgentSiteId =
  (typeof ESTATEWEB_INIT_AGENT_SITES)[number]['id'];

export interface EstateWebInitAgentSite {
  id: EstateWebAgentSiteId;
  name: string;
}

export const ESTATEWEB_DEFAULT_PUSH_SITES: EstateWebPushSiteSetting[] = [
  {
    selected: true,
    name: '1. re1.gr',
    agent_site_id: 1002,
    show_on_slider: 0,
    show_on_first_page: 0,
    show_on_relative_pages: 1,
  },
];

export const ESTATEWEB_INIT_GATEWAYS = [
  { agent_id: 2, name: 'Κρητικές Αγγελίες', logo: 'kritikes-aggelies' },
  { agent_id: 2, name: 'Spitogatos', logo: 'spitogatos' },
] as const;

export type EstateWebGatewayLogo =
  (typeof ESTATEWEB_INIT_GATEWAYS)[number]['logo'];

export interface EstateWebInitGateway {
  agent_id: number;
  name: string;
  logo: EstateWebGatewayLogo;
}
