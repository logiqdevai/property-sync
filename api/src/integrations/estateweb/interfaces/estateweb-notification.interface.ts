import { EstateWebErrorCode } from '../constants/estateweb-error-codes';

export interface EstateWebErrorContext {
  userIntegrationId?: string;
  sourceAgencyId?: string;
  operation: string;
  path?: string;
  method?: string;
  propertyId?: number | string;
  statusCode?: number;
  errorCode?: EstateWebErrorCode;
}
