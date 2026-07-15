import {
    Injectable,
    Logger,
    NotFoundException,
    UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { CreateJwtService } from '@/shared/utils/jwt/jwt.service';
import { ResendMailService } from '@/integrations/notifications/resend/services/mail.service';
import { EmailConfig } from '@/shared/constants/email';
import { AppUrls } from '@/shared/config/app-urls';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

export type PasswordResetReason = 'invite' | 'forgot';

@Injectable()
export class PasswordResetService {
    private readonly logger = new Logger(PasswordResetService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly jwtService: CreateJwtService,
        private readonly mailService: ResendMailService,
    ) { }

    async requestPasswordReset(email: string) {
        const user = await this.prisma.user.findUnique({
            where: { email },
        });

        if (user) {
            this.logger.log(`Password reset requested for existing user: ${email}`);
            await this.sendPasswordResetEmail(user.id, user.email, 'forgot');
        } else {
            this.logger.warn(`Password reset requested for unknown email: ${email}`);
        }

        return {
            message: 'If an account exists for this email, a password reset link has been sent.',
        };
    }

    async sendPasswordResetForUserId(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        await this.sendPasswordResetEmail(user.id, user.email, 'forgot');

        return {
            message: 'Password reset link sent.',
        };
    }

    async validatePasswordResetToken(token: string) {
        await this.jwtService.verifyPasswordResetToken(token);
        return { valid: true };
    }

    async resetPassword(token: string, password: string) {
        const payload = await this.jwtService.verifyPasswordResetToken(token);

        const user = await this.prisma.user.findUnique({
            where: { id: payload.id },
        });

        if (!user) {
            throw new UnauthorizedException('Invalid token');
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await this.prisma.user.update({
            where: { id: user.id },
            data: { password: hashedPassword },
        });

        return {
            message: 'Password updated successfully.',
        };
    }

    async sendPasswordResetEmail(
        userId: string,
        email: string,
        reason: PasswordResetReason,
    ) {
        const token = await this.jwtService.signPasswordResetToken(userId);
        const resetLink = `${AppUrls.setPassword}?token=${encodeURIComponent(token)}`;
        const isInvite = reason === 'invite';
        const from = EmailConfig.email_addresses.alert;
        const subject = isInvite
            ? 'Set up your Property Sync password'
            : EmailConfig.templates.password_reset.subject;

        this.logger.log(
            `Preparing password reset email: reason="${reason}" from="${from}" to="${email}" appUrl="${AppUrls.setPassword}"`,
        );

        try {
            await this.mailService.sendEmail({
                to: email,
                from,
                subject,
                template_id: EmailConfig.templates.password_reset.template_id,
                dynamic_template_data: {
                    resetLink,
                    headline: isInvite ? 'Welcome to Property Sync' : 'Reset your password',
                    intro: isInvite
                        ? 'An account was created for you. Use the button below to choose your password and sign in.'
                        : 'We received a request to reset your password. Use the button below to choose a new one.',
                    buttonLabel: isInvite ? 'Set password' : 'Reset password',
                },
            });

            this.logger.log(`Password reset email queued successfully for ${email}`);
        } catch (error) {
            this.logger.error(
                `Password reset email failed for ${email} from="${from}" reason="${reason}"`,
                error instanceof Error ? error.stack : error,
            );
            throw error;
        }
    }

    async createPlaceholderPasswordHash() {
        return bcrypt.hash(randomBytes(32).toString('hex'), 10);
    }
}
