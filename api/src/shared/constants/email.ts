import { EmailTemplates } from '@/integrations/notifications/resend/interfaces/mail.interfaces';

export const EmailConfig = {
    email_addresses: {
        verification: 'Property Sync <info@logiqdev.com>',
        alert: 'Property Sync <info@logiqdev.com>',
        confirmation: 'Property Sync <info@logiqdev.com>',
    },
    templates: {
        waitlist: {
            subject: 'Sentify - Waitlist',
            template_id: EmailTemplates.WAITLIST,
        },
        password_reset: {
            subject: 'Set your password',
            template_id: EmailTemplates.PASSWORD_RESET,
        },
    }
}
