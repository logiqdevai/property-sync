import { HttpStatus, Injectable } from '@nestjs/common';
import { DewatermarkConfig } from '../config/dewatermark.config';
import { DewatermarkException } from '../exceptions/dewatermark.exception';
import { DewatermarkAuthContext } from '../interfaces/dewatermark-auth.interface';
import {
  DewatermarkCreditInfo,
  DewatermarkCreditInfoResponse,
} from '../interfaces/dewatermark-credit.interface';
import { DewatermarkClientService } from './dewatermark-client.service';

@Injectable()
export class DewatermarkCreditService {
  constructor(
    private readonly dewatermarkConfig: DewatermarkConfig,
    private readonly dewatermarkClient: DewatermarkClientService,
  ) {}

  async getCreditInfo(
    auth: DewatermarkAuthContext,
  ): Promise<DewatermarkCreditInfo> {
    const paths = this.dewatermarkConfig.getPaths();
    const response =
      await this.dewatermarkClient.request<DewatermarkCreditInfoResponse>({
        method: 'GET',
        path: paths.creditInfo,
        apiKey: auth.apiKey,
      });

    const availableCredit = response?.data?.available_credit;
    if (typeof availableCredit !== 'number' || Number.isNaN(availableCredit)) {
      throw new DewatermarkException(
        'Dewatermark credit response missing available_credit',
        'DEWATERMARK_INVALID_RESPONSE',
        HttpStatus.BAD_GATEWAY,
      );
    }

    return {
      available_credit: availableCredit,
      user_id: response.data.user_id ?? '',
    };
  }
}
