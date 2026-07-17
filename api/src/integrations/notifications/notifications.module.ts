import { Module } from '@nestjs/common';
import { TwillioModule } from './twillio/twillio.module';
import { ResendModule } from './resend/resend.module';
import { TelegramModule } from './telegram/telegram.module';

@Module({
  imports: [TwillioModule, ResendModule, TelegramModule],
  exports: [TelegramModule],
})
export class NotificationsIntegrationModule {}
