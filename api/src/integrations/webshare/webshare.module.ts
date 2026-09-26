import { Module } from '@nestjs/common';
import { WebshareConfig } from './config/webshare.config';
import { WebshareClientService } from './services/webshare-client.service';
import { WebshareProxyService } from './services/webshare-proxy.service';

@Module({
  providers: [WebshareConfig, WebshareClientService, WebshareProxyService],
  exports: [WebshareConfig, WebshareClientService, WebshareProxyService],
})
export class WebshareModule {}
