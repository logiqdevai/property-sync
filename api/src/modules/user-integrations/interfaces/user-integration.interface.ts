export interface ResolvedApiKey {
  userIntegrationId: string;
  apiKey: string;
}

export interface ResolvedSourceAgencyApiKey extends ResolvedApiKey {
  userId: string;
}
