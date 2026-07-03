import { EmailTemplates } from '@/integrations/notifications/resend/interfaces/mail.interfaces';

const EmailAddress = "info@appointmy.com"

export const EmailConfig = {
    email_addresses: {
        verification: EmailAddress,
        confirmation: EmailAddress,
    },
    templates: {
        waitlist: {
            subject: 'Waitlist',
            template_id: EmailTemplates.WAITLIST,
        },
    }
}
