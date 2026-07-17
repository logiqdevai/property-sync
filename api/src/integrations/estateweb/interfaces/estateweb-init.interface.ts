import {
  EstateWebInitGateway,
  EstateWebInitAgentSite,
} from '../constants/estateweb-agent-catalog.constants';
import {
  EstateWebInitLanguage,
  EstateWebHistoryTypeId,
  EstateWebPropertyHistoryTypeId,
} from '../constants/estateweb-enums.constants';
import {
  EstateWebInitField,
  EstateWebInitPropertyType,
} from '../constants/estateweb-init.constants';

export interface EstateWebInitUser {
  id: number;
  group_id: number;
  name: string;
  email: string;
  login_at: string;
  is_active: boolean;
  last_version: string;
  tasks: unknown[];
}

export interface EstateWebInitGroup {
  id: number;
  name: string;
  is_admin: boolean;
  client_permissions: string;
  property_permissions: string;
  request_permissions: string;
}

export interface EstateWebInitAgentSettings {
  hidden_locations: number[];
  sms_api_key?: string;
}

export interface EstateWebInitAgent {
  id: number;
  name: string;
  languages: EstateWebInitLanguage[];
  sites: EstateWebInitAgentSite[];
  gateways: EstateWebInitGateway[];
  foreign_agents: unknown[];
  contact?: string;
  address1?: string;
  address2?: string;
  max_users?: number;
  phone1?: string;
  phone2?: string;
  fax?: string;
  mobile?: string;
  email?: string;
  created_at?: string;
  activated_at?: string;
  expires_at?: string;
  settings?: EstateWebInitAgentSettings;
}

export interface EstateWebInitUserSummary {
  id: number;
  name: string;
}

export type EstateWebInitFieldsOfTypes = Record<string, number[]>;

export type EstateWebInitPropertyHistoryTypes = Record<
  EstateWebPropertyHistoryTypeId,
  string
>;

export type EstateWebInitHistoryTypes = Record<EstateWebHistoryTypeId, string>;

export interface EstateWebInitCache {
  locations: string;
}

export interface EstateWebInitResponse {
  user: EstateWebInitUser;
  group: EstateWebInitGroup;
  agent: EstateWebInitAgent;
  users: EstateWebInitUserSummary[];
  property_types: EstateWebInitPropertyType[];
  fields: EstateWebInitField[];
  fieldsOfTypes: EstateWebInitFieldsOfTypes;
  property_history_types: EstateWebInitPropertyHistoryTypes;
  history_types: EstateWebInitHistoryTypes;
  cache: EstateWebInitCache;
  clients: unknown[];
  ws: string;
  image_server: string;
  server_message: unknown;
  under_maintenance: 0 | 1;
}
