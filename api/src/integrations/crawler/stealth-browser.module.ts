import { Module } from '@nestjs/common';
import { PlatformConfigModule } from '@/modules/platform-config/platform-config.module';
import { StealthBrowserService } from './services/stealth-browser.service';

@Module({
  imports: [PlatformConfigModule],
  providers: [StealthBrowserService],
  exports: [StealthBrowserService],
})
export class StealthBrowserModule {}
