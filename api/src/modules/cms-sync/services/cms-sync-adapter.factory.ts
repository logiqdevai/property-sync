import { Injectable, NotFoundException } from '@nestjs/common';
import { IntegrationType } from 'generated/prisma';
import { EstateWebCmsSyncAdapter } from '@/integrations/estateweb/services/estateweb-cms-sync-adapter.service';
import { CmsSyncAdapter } from '../interfaces/cms-sync-adapter.interface';

@Injectable()
export class CmsSyncAdapterFactory {
  constructor(private readonly estateWebAdapter: EstateWebCmsSyncAdapter) {}

  getAdapter(integrationType: IntegrationType): CmsSyncAdapter {
    switch (integrationType) {
      case IntegrationType.ESTATEWEB:
        return this.estateWebAdapter;
      default:
        throw new NotFoundException(
          `No CMS sync adapter for integration type ${integrationType}`,
        );
    }
  }
}
