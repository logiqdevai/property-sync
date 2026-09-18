import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { EmailAuthService } from '../services/email.service';
import { RegisterEmailDto } from '../dto/register-email.dto';
import { LoginEmailDto } from '../dto/login-email.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { AuthResponse } from '../entities/auth-response.entity';
import { WaitlistDto } from '../dto/waitlist.dto';
import { JwtGuard } from '@/shared/guards/jwt.guard';
import { RolesGuard } from '@/shared/guards/roles.guard';
import { Roles } from '@/shared/decorators/roles.decorator';
import { AuthRole } from 'generated/prisma';
import { CurrentUser } from '@/shared/decorators/current-user.decorator';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { Audited } from '@/modules/activity-logs/decorators/audited.decorator';

@ApiTags('Email Authentication')
@Controller('auth/email')
export class EmailAuthController {
  constructor(private readonly authService: EmailAuthService) {}

  @Audited({ action: 'auth.register', entity: 'User', resultIds: { path: 'user.id' } })
  @Post('register')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(AuthRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Create a user with a password, or send an invite email when password is omitted',
  })
  @ApiBody({ type: RegisterEmailDto })
  @ApiResponse({
    status: 201,
    description: 'User created. When password is omitted, invite_sent is true.',
  })
  @ApiResponse({
    status: 409,
    description: 'Conflict - User with this email already exists',
  })
  async registerWithEmail(@Body() dto: RegisterEmailDto) {
    return this.authService.registerWithEmail(dto);
  }

  @Audited({ action: 'auth.login' })
  @Post('login')
  @ApiOperation({ summary: 'Login user with email and password' })
  @ApiBody({ type: LoginEmailDto })
  @ApiResponse({
    status: 200,
    description: 'User logged in successfully',
    type: AuthResponse,
  })
  async loginWithEmail(@Body() dto: LoginEmailDto) {
    return this.authService.loginWithEmail(dto);
  }

  @Audited({ action: 'auth.waitlist' })
  @Post('/waitlist')
  @ApiOperation({ summary: 'Waitlist a user with ref code' })
  @ApiBody({ type: WaitlistDto })
  @ApiResponse({
    status: 200,
    description: 'User referred successfully',
    type: AuthResponse,
  })
  async waitlist(@Body() dto: WaitlistDto) {
    return this.authService.waitlist(dto);
  }

  @Audited({ action: 'auth.forgot_password' })
  @Post('forgot-password')
  @ApiOperation({ summary: 'Request a password reset email' })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiResponse({
    status: 200,
    description: 'Reset email sent if account exists',
  })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Audited({ action: 'auth.reset_password' })
  @Post('reset-password')
  @ApiOperation({ summary: 'Set a new password using a reset token' })
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse({ status: 200, description: 'Password reset successful' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Get('reset-password/validate')
  @ApiOperation({ summary: 'Validate a password reset token' })
  @ApiQuery({ name: 'token', required: true, type: String })
  @ApiResponse({ status: 200, description: 'Token validity result' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  async validatePasswordResetToken(@Query('token') token: string) {
    return this.authService.validatePasswordResetToken(token);
  }

  @Audited({ action: 'auth.admin_send_password_reset', entity: 'User', ids: { param: 'userId' } })
  @Post('users/:userId/password-reset')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(AuthRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send a password reset link to a user' })
  @ApiResponse({ status: 200, description: 'Password reset link sent' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async sendPasswordResetToUser(@Param('userId') userId: string) {
    return this.authService.sendPasswordResetForUser(userId);
  }

  @Audited({ action: 'auth.admin_impersonate', entity: 'User', ids: { param: 'userId' } })
  @Post(':userId/admin-login')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(AuthRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Login as a user while retaining the actor role in the token',
  })
  @ApiResponse({ status: 200, type: AuthResponse })
  @ApiResponse({ status: 403, description: 'Cannot login as yourself' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async adminLoginToAccount(
    @Param('userId') userId: string,
    @CurrentUser('id') actorId: string,
    @CurrentUser('role') actorRole: AuthRole,
  ) {
    return this.authService.adminLoginToAccount(userId, actorId, actorRole);
  }
}
