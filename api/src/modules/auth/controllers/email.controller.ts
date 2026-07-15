import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { EmailAuthService } from '../services/email.service';
import { RegisterEmailDto } from '../dto/register-email.dto';
import { LoginEmailDto } from '../dto/login-email.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AuthResponse } from '../entities/auth-response.entity';
import { WaitlistDto } from '../dto/waitlist.dto';
import { JwtGuard } from '@/shared/guards/jwt.guard';
import { RolesGuard } from '@/shared/guards/roles.guard';
import { Roles } from '@/shared/decorators/roles.decorator';
import { AuthRole } from 'generated/prisma';
import { CurrentUser } from '@/shared/decorators/current-user.decorator';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';

@ApiTags('Email Authentication')
@Controller('auth/email')
export class EmailAuthController {
    constructor(private readonly authService: EmailAuthService) { }

    @Post('register')
    @UseGuards(JwtGuard, RolesGuard)
    @Roles(AuthRole.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Register a new user with email and password' })
    @ApiBody({ type: RegisterEmailDto })
    @ApiResponse({
        status: 201,
        description: 'User registered successfully',
        type: AuthResponse
    })
    @ApiResponse({
        status: 409,
        description: 'Conflict - User with this email already exists'
    })
    async registerWithEmail(@Body() dto: RegisterEmailDto) {
        return this.authService.registerWithEmail(dto);
    }

    @Post('login')
    @ApiOperation({ summary: 'Login user with email and password' })
    @ApiBody({ type: LoginEmailDto })
    @ApiResponse({
        status: 200,
        description: 'User logged in successfully',
        type: AuthResponse
    })
    async loginWithEmail(@Body() dto: LoginEmailDto) {
        return this.authService.loginWithEmail(dto);
    }

    @Post('/waitlist')
    @ApiOperation({ summary: 'Waitlist a user with ref code' })
    @ApiBody({ type: WaitlistDto })
    @ApiResponse({
        status: 200,
        description: 'User referred successfully',
        type: AuthResponse
    })
    async waitlist(@Body() dto: WaitlistDto) {
        return this.authService.waitlist(dto);
    }

    @Post('forgot-password')
    @ApiOperation({ summary: 'Request a password reset email' })
    @ApiBody({ type: ForgotPasswordDto })
    async forgotPassword(@Body() dto: ForgotPasswordDto) {
        return this.authService.forgotPassword(dto);
    }

    @Post('reset-password')
    @ApiOperation({ summary: 'Set a new password using a reset token' })
    @ApiBody({ type: ResetPasswordDto })
    async resetPassword(@Body() dto: ResetPasswordDto) {
        return this.authService.resetPassword(dto);
    }

    @Get('reset-password/validate')
    @ApiOperation({ summary: 'Validate a password reset token' })
    @ApiQuery({ name: 'token', required: true })
    async validatePasswordResetToken(@Query('token') token: string) {
        return this.authService.validatePasswordResetToken(token);
    }

    @Post('users/:userId/password-reset')
    @UseGuards(JwtGuard, RolesGuard)
    @Roles(AuthRole.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Send a password reset link to a user' })
    async sendPasswordResetToUser(@Param('userId') userId: string) {
        return this.authService.sendPasswordResetForUser(userId);
    }

    @Post(':userId/admin-login')
    @UseGuards(JwtGuard, RolesGuard)
    @Roles(AuthRole.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Login as a user while retaining the actor role in the token' })
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
