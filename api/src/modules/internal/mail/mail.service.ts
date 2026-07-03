import { ResendMailService } from '@/integrations/notifications/resend/services/mail.service';
import { Injectable } from '@nestjs/common';
import { CreateMailDto } from './dto/create-mail.dto';

@Injectable()
export class MailService {

  constructor(
    private readonly mailService: ResendMailService
  ) { }

  create(createMailDto: CreateMailDto) {
    return this.mailService.sendEmail(createMailDto);
  }




}
