export const ApiRoutes = {
    auth: {
        email: {
            login: "/auth/email/login",
            register: "/auth/email/register",
            refresh_token: "/auth/email/refresh-token",
            admin_login_to_account: (account_uuid: string) => `/auth/email/${account_uuid}/admin-login`,
            forgot_password: "/auth/forgot-password",
            reset_password: "/auth/reset-password",
            verify_email: "/auth/verify-email",
            resend_verification_email: "/auth/resend-verification-email",
        },
    },
    users: {
        prefix: "/users",
        me: "/users/me",
    },
    google_maps: {
        timezone: "/google-maps/timezone",
    },
    admin: {
        agencies: {
            prefix: "/admin/agencies",
            list: "/admin/agencies",
            detail: (id: string) => `/admin/agencies/${id}`,
            status: (id: string) => `/admin/agencies/${id}/status`,
            visibility: (id: string) => `/admin/agencies/${id}/visibility`,
        },
        scrapers: {
            prefix: "/admin/scrapers",
            list: "/admin/scrapers",
            detail: (id: string) => `/admin/scrapers/${id}`,
            versions: (id: string) => `/admin/scrapers/${id}/versions`,
            activateVersion: (id: string, versionId: string) =>
                `/admin/scrapers/${id}/versions/${versionId}/activate`,
            runNow: (id: string) => `/admin/scrapers/${id}/run-now`,
        },
    },
}