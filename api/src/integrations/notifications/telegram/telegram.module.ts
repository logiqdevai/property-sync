import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TelegramConfig } from './config/telegram.config';
import { TelegramService } from './services/telegram.service';

@Module({
  imports: [ConfigModule],
  providers: [TelegramConfig, TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
