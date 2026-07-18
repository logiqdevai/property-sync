export enum EstateWebFieldType {
  NUMERIC = 1,
  SELECT = 2,
  BOOLEAN = 3,
  TEXT = 4,
}

export enum EstateWebScope {
  SALE = 1,
  RENT = 2,
}

export type EstateWebLanguageId = 1 | 2 | 3 | 4 | 5 | 6;

export interface EstateWebInitLanguage {
  id: EstateWebLanguageId;
  name: string;
  iso_code: string;
}

export const ESTATEWEB_INIT_LANGUAGES: EstateWebInitLanguage[] = [
  { id: 1, name: 'Ελληνικά', iso_code: 'el' },
  { id: 2, name: 'Αγγλικά', iso_code: 'en' },
  { id: 3, name: 'Γερμανικά', iso_code: 'de' },
  { id: 4, name: 'Γαλλικά', iso_code: 'fr' },
  { id: 5, name: 'Ιταλικά', iso_code: 'it' },
  { id: 6, name: 'Ρώσσικα', iso_code: 'ru' },
];

export type EstateWebBooleanFlag = 0 | 1;

export const ESTATEWEB_PROPERTY_TYPE_LEAF_IDS = [
  2, 3, 11, 12, 13, 14, 15, 16, 17, 21, 22, 23, 24, 25, 26, 27, 28, 29, 31,
  32, 33, 901, 902, 1000,
] as const;

export type EstateWebPropertyTypeId =
  (typeof ESTATEWEB_PROPERTY_TYPE_LEAF_IDS)[number];

export const ESTATEWEB_PROPERTY_HISTORY_TYPES = {
  10: 'Καταχώρηση',
  20: 'Ενημέρωση',
  30: 'Αλλαγή τιμής',
  40: 'Υπόδειξη',
  50: 'Ενοικίαση',
  60: 'Πώληση',
  70: 'Αλλαγή Κατάστασης',
  80: 'Διαγραφή',
} as const;

export type EstateWebPropertyHistoryTypeId =
  keyof typeof ESTATEWEB_PROPERTY_HISTORY_TYPES;

export const ESTATEWEB_HISTORY_TYPES = {
  100: 'Login',
  101: 'Logout',
  200: 'Ανάθεση ακινήτου',
  201: 'Διαγραφή ακινήτου',
  210: 'Υπόδειξη ακινήτου',
  220: 'Ολοκλήρωση ακινήτου',
  230: 'Ανάρτηση ακινήτου',
  231: 'Απόσυρση ακινήτου',
  300: 'Δημιουργία επαφής',
  301: 'Διαγραφή επαφής',
  302: 'Ενημέρωση επαφής',
  400: 'Καταχώρηση εργασίας',
  420: 'Ολοκλήρωση εργασίας',
  500: 'Καταχώρηση ζήτησης',
  501: 'Διαγραφή ζήτησης',
} as const;

export type EstateWebHistoryTypeId = keyof typeof ESTATEWEB_HISTORY_TYPES;

export type EstateWebStatusId = number;

export type EstateWebHasKeys = '' | '0' | '1' | '2' | string;

export enum EstateWebIncomeType {
  PERCENTAGE = 0,
  INDEX = 1,
}

export type EstateWebIncomePeriod = number;

export type EstateWebPropertyListSortColumn =
  | 'created_at'
  | 'updated_at'
  | 'price'
  | 'sqm'
  | 'code'
  | string;

export type EstateWebPropertyListSortWay = 'ASC' | 'DESC';

export type EstateWebAgentScope = 0 | 1 | number;

export type EstateWebUnderMaintenance = 0 | 1;
