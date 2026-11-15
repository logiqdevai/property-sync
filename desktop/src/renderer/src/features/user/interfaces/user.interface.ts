export interface LoggedInUser {
  user_uuid: string | null;
  email: string | null;
  role: RoleType | null;
  access_token: string | null;
  expires_in: number | null;
  full_name?: string | null;
  isLoggedIn?: boolean | null;
}

export const RoleTypes = {
  USER: "USER",
  ADMIN: "ADMIN",
  SUPER_ADMIN: "SUPER_ADMIN",
  SUPPORT: "SUPPORT",
} as const;

export type RoleType = (typeof RoleTypes)[keyof typeof RoleTypes];

/** Roles allowed by the API's desktop-crawl routes. */
export const CRAWLER_ROLES: RoleType[] = [RoleTypes.ADMIN, RoleTypes.SUPER_ADMIN, RoleTypes.SUPPORT];

export function canUseCrawler(role: RoleType | null | undefined): boolean {
  return !!role && CRAWLER_ROLES.includes(role);
}
