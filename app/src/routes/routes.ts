export const Routes = {
    auth: {
        sign_in: "/auth/sign-in",
        sign_up: "/auth/sign-up",
    },
    dashboard: {
        root: "/dashboard",
    },
    admin: {
        root: "/admin",
        agencies: {
            list: "/admin/agencies",
            detail: (id: string) => `/admin/agencies/${id}`,
        },
    },
};
