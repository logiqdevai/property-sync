
export interface User {
    id: string;
    uuid: string;
    email: string;
    role: RoleType;
    created_at: string;
    updated_at: string;
}



export interface LoggedInUser {
    user_uuid: string | null;
    email: string | null;
    role: RoleType | null;
    access_token: string | null;
    expires_in: number | null;
    avatar?: string | null;
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

export const ADMIN_AREA_ROLES: RoleType[] = [
    RoleTypes.ADMIN,
    RoleTypes.SUPER_ADMIN,
    RoleTypes.SUPPORT,
];

export function canAccessAdmin(role: RoleType | null | undefined): boolean {
    return !!role && ADMIN_AREA_ROLES.includes(role);
}