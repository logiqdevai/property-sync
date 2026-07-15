// src/modules/auth/dto/register-email.dto.ts

import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterEmailDto {
    @ApiProperty({
        description: 'User email address',
        example: 'user@example.com',
        format: 'email'
    })
    @IsEmail()
    email: string;

    @ApiPropertyOptional({
        description: 'User password (minimum 6 characters). When omitted, an invite email is sent instead.',
        example: 'password123',
        minLength: 6
    })
    @IsOptional()
    @IsString()
    @MinLength(6)
    password?: string;

}
