import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ResendConfig } from './resend/resend.config';
import { ResendAdapter } from './resend/resend.adapter';
import { ResendMailService } from './services/mail.service';
import { TemplateService } from './utils/templates.utils';

@Module({
  imports: [ConfigModule],
  providers: [ResendMailService, ResendConfig, ResendAdapter, TemplateService, Logger],
  exports: [ResendMailService],
})
export class ResendModule {}
