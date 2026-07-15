import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { EmailConfig } from '@/shared/constants/email';
import { CreateEmail, EmailFromAddress, EmailTemplate } from '../interfaces/mail.interfaces';
import { ResendConfig } from './resend.config';
import { TemplateService } from '../utils/templates.utils';

@Injectable()
export class ResendAdapter {
  private readonly logger = new Logger(ResendAdapter.name);
  private readonly emailFromAddresses: EmailFromAddress;

  constructor(
    private readonly resendConfig: ResendConfig,
    private readonly templateService: TemplateService,
  ) {
    this.emailFromAddresses = EmailConfig.email_addresses;
  }

  public async sendEmail(createEmail: CreateEmail) {
    const from = createEmail.from || this.emailFromAddresses.confirmation;

    try {
      const resendClient = this.resendConfig.getResendClient();
      let html = createEmail.html;

      if (createEmail.template_id) {
        html = await this.templateService.renderTemplate(
          createEmail.template_id as EmailTemplate,
          createEmail.dynamic_template_data ?? {},
        );
      }

      this.logger.log(
        `Sending email via Resend: from="${from}" to="${createEmail.to}" subject="${createEmail.subject}" template="${createEmail.template_id ?? 'none'}"`,
      );

      const result = await resendClient.emails.send({
        from,
        to: createEmail.to,
        subject: createEmail.subject,
        text: createEmail.text,
        html,
        cc: createEmail.cc,
        bcc: createEmail.bcc,
        replyTo: createEmail.replyTo,
        headers: createEmail.headers,
      });

      if (result.error) {
        this.logger.error(
          `Resend rejected email: from="${from}" to="${createEmail.to}" subject="${createEmail.subject}" error=${JSON.stringify(result.error)}`,
        );
        throw new InternalServerErrorException(
          result.error.message || 'Failed to send email with Resend',
        );
      }

      this.logger.log(
        `Resend accepted email: id="${result.data?.id ?? 'unknown'}" from="${from}" to="${createEmail.to}"`,
      );

      return result;
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }

      this.logger.error(
        `Resend send failed: from="${from}" to="${createEmail.to}" subject="${createEmail.subject}"`,
        error instanceof Error ? error.stack : error,
      );
      throw new InternalServerErrorException('Failed to send email with Resend');
    }
  }
}
