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
            trackerSettings: (agencyId: string, userId: string) =>
                `/admin/agencies/${agencyId}/trackers/${userId}`,
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
        generationRuns: {
            prefix: "/admin/generation-runs",
            list: "/admin/generation-runs",
            detail: (id: string) => `/admin/generation-runs/${id}`,
            approve: (id: string) => `/admin/generation-runs/${id}/approve`,
            reject: (id: string) => `/admin/generation-runs/${id}/reject`,
            cancel: (id: string) => `/admin/generation-runs/${id}/cancel`,
        },
        crawlRuns: {
            prefix: "/admin/crawl-runs",
            list: "/admin/crawl-runs",
            detail: (id: string) => `/admin/crawl-runs/${id}`,
            rerun: (id: string) => `/admin/crawl-runs/${id}/rerun`,
        },
        jobs: {
            prefix: "/admin/jobs",
            list: "/admin/jobs",
            detail: (id: string) => `/admin/jobs/${id}`,
            retry: (id: string) => `/admin/jobs/${id}/retry`,
        },
        properties: {
            prefix: "/admin/properties",
            list: "/admin/properties",
            detail: (id: string) => `/admin/properties/${id}`,
            merge: "/admin/properties/merge",
            split: (id: string) => `/admin/properties/${id}/split`,
        },
        notifications: {
            prefix: "/admin/notifications",
            list: "/admin/notifications",
            markRead: (id: string) => `/admin/notifications/${id}/read`,
            markAllRead: "/admin/notifications/read-all",
        },
        integrationTargets: {
            prefix: "/admin/integration-targets",
            list: "/admin/integration-targets",
            detail: (id: string) => `/admin/integration-targets/${id}`,
            visibility: (id: string) => `/admin/integration-targets/${id}/visibility`,
            accounts: (id: string) => `/admin/integration-targets/${id}/accounts`,
            account: (id: string, userIntegrationId: string) =>
                `/admin/integration-targets/${id}/accounts/${userIntegrationId}`,
        },
        dashboard: {
            root: "/admin/dashboard",
        },
        users: {
            prefix: "/admin/users",
            list: "/admin/users",
            detail: (id: string) => `/admin/users/${id}`,
        },
    },
    integrations: {
        prefix: "/integrations",
        targets: "/integrations/targets",
        connections: "/integrations/connections",
        connection: (id: string) => `/integrations/connections/${id}`,
        connectionStatus: (id: string) => `/integrations/connections/${id}/status`,
        connectionDefault: (id: string) => `/integrations/connections/${id}/default`,
    },
    agencies: {
        prefix: "/agencies",
        list: "/agencies",
        track: (agencyId: string) => `/agencies/${agencyId}/track`,
        integrationLink: (agencyId: string) => `/agencies/${agencyId}/track/integration`,
    },
    userProperties: {
        prefix: "/properties",
        list: "/properties",
        detail: (id: string) => `/properties/${id}`,
        resync: (id: string) => `/properties/${id}/resync`,
    },
}