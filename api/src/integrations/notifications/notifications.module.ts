import { Module } from '@nestjs/common';
import { TwillioModule } from './twillio/twillio.module';
import { ResendModule } from './resend/resend.module';

@Module({
    imports: [TwillioModule, ResendModule],
    providers: [],
    exports: [],
})
export class NotificationsIntegrationModule { }