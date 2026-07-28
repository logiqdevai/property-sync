import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GoogleTranslateConfig } from './config/google-translate.config';
import { GoogleTranslateService } from './services/google-translate.service';

@Module({
  imports: [ConfigModule],
  providers: [GoogleTranslateConfig, GoogleTranslateService],
  exports: [GoogleTranslateService],
})
export class GoogleTranslateModule {}
