import { Module } from '@nestjs/common';
import { StealthBrowserService } from './services/stealth-browser.service';

@Module({
  providers: [StealthBrowserService],
  exports: [StealthBrowserService],
})
export class StealthBrowserModule {}
