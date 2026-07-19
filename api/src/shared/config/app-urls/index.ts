export const AppUrls = {
  billing: `${process.env.APP_URL}/dashboard/billing/account`,
  setPassword: `${process.env.APP_URL}/auth/set-password`,
} as const;

export const ApiUrls = {
  api_url: process.env.API_URL,
} as const;
