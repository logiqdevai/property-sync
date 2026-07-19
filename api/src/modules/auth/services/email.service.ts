import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { RegisterEmailDto } from '../dto/register-email.dto';
import { LoginEmailDto } from '../dto/login-email.dto';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { CreateJwtService } from '@/shared/utils/jwt/jwt.service';
import { AuthRole } from 'generated/prisma';
import { WaitlistDto } from '../dto/waitlist.dto';
import { ResendMailService } from '@/integrations/notifications/resend/services/mail.service';
import { EmailConfig } from '@/shared/constants/email';
import { PasswordResetService } from './password-reset.service';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';

@Injectable()
export class EmailAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: CreateJwtService,
    private readonly mailService: ResendMailService,
    private readonly passwordResetService: PasswordResetService,
  ) {}

  async registerWithEmail(dto: RegisterEmailDto) {
    try {
      const existingUser = await this.prisma.user.findUnique({
        where: {
          email: dto.email,
        },
      });

      if (existingUser) {
        throw new ConflictException('User with this email already exists');
      }

      const hashedPassword = dto.password
        ? await bcrypt.hash(dto.password, 10)
        : await this.passwordResetService.createPlaceholderPasswordHash();

      const user = await this.prisma.user.create({
        data: {
          email: dto.email,
          password: hashedPassword,
          role: AuthRole.USER,
        },
      });

      delete user.password;

      if (!dto.password) {
        await this.passwordResetService.sendPasswordResetEmail(
          user.id,
          user.email,
          'invite',
        );

        return {
          user,
          invite_sent: true,
        };
      }

      return {
        user,
        invite_sent: false,
      };
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }

      throw new BadRequestException(error.message);
    }
  }

  async loginWithEmail(dto: LoginEmailDto) {
    try {
      const user = await this.prisma.user.findUnique({
        where: {
          email: dto.email,
        },
      });

      if (!user) {
        throw new UnauthorizedException('Invalid credentials');
      }

      const password_match = await bcrypt.compare(dto.password, user.password);

      if (!password_match) {
        throw new UnauthorizedException('Invalid credentials');
      }

      const token = await this.jwtService.signToken({
        id: user.id,
        role: user.role,
      });

      const expires_in = this.jwtService.getExpirationTime(token);

      delete user.password;

      return { access_token: token, expires_in: expires_in, user: user };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  async waitlist(dto: WaitlistDto) {
    try {
      const existingUser = await this.prisma.user.findUnique({
        where: {
          email: dto.email,
        },
      });

      if (existingUser) {
        return {
          message: 'You are already in the waitlist',
          code: 'WAITLIST_ALREADY_EXISTS',
        };
      }

      const user = await this.prisma.user.create({
        data: {
          email: dto.email,
          password: '',
          role: AuthRole.USER,
        },
      });

      await this.mailService.sendEmail({
        to: dto.email,
        from: EmailConfig.email_addresses.alert,
        subject: EmailConfig.templates.waitlist.subject,
        template_id: EmailConfig.templates.waitlist.template_id,
      });

      return {
        message: 'You have been successfully added to the waitlist',
        code: 'WAITLIST_SUCCESS',
      };
    } catch (error) {
      throw new BadRequestException('Failed to waitlist user', error.message);
    }
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    return this.passwordResetService.requestPasswordReset(dto.email);
  }

  async resetPassword(dto: ResetPasswordDto) {
    return this.passwordResetService.resetPassword(dto.token, dto.password);
  }

  async validatePasswordResetToken(token: string) {
    return this.passwordResetService.validatePasswordResetToken(token);
  }

  async sendPasswordResetForUser(userId: string) {
    return this.passwordResetService.sendPasswordResetForUserId(userId);
  }

  async adminLoginToAccount(
    userId: string,
    actorId: string,
    actorRole: AuthRole,
  ) {
    if (userId === actorId) {
      throw new ForbiddenException('You cannot login as yourself');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const token = await this.jwtService.signToken({
      id: user.id,
      role: actorRole,
    });

    const expires_in = this.jwtService.getExpirationTime(token);

    delete user.password;

    return {
      access_token: token,
      expires_in,
      user: {
        ...user,
        role: actorRole,
      },
    };
  }
}
