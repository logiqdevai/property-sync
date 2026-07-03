import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { MailController } from './mail.controller';
import { ResendModule } from '@/integrations/notifications/resend/resend.module';

@Module({
  imports: [ResendModule],
  controllers: [MailController],
  providers: [MailService],
})
export class MailModule { }
