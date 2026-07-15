import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUrl, MinLength } from 'class-validator';
import { AuthType, IntegrationType } from 'generated/prisma';

export class CreateIntegrationTargetDto {
  @ApiProperty({ enum: IntegrationType, example: IntegrationType.OPENAI })
  @IsEnum(IntegrationType)
  integration_type: IntegrationType;

  @ApiProperty({ enum: AuthType, example: AuthType.API_KEY })
  @IsEnum(AuthType)
  auth_type: AuthType;

  @ApiPropertyOptional({ example: 'https://cms.example.com' })
  @IsOptional()
  @IsUrl()
  base_url?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  allow_multiple?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_visible?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_enabled?: boolean;
}

export class UpdateIntegrationTargetDto {
  @ApiPropertyOptional({ enum: IntegrationType })
  @IsOptional()
  @IsEnum(IntegrationType)
  integration_type?: IntegrationType;

  @ApiPropertyOptional({ enum: AuthType })
  @IsOptional()
  @IsEnum(AuthType)
  auth_type?: AuthType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  base_url?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allow_multiple?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_visible?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_enabled?: boolean;
}

export class UpdateIntegrationTargetVisibilityDto {
  @ApiProperty()
  @IsBoolean()
  is_visible: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_enabled?: boolean;
}

export class UserIntegrationCredentialsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  api_key_secret?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  webhook_key?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  password?: string;

  @ApiPropertyOptional()
  @IsOptional()
  config?: Record<string, unknown>;
}

export class CreateUserIntegrationAccountDto extends UserIntegrationCredentialsDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  user_id: string;
}

export class UpdateUserIntegrationAccountDto extends UserIntegrationCredentialsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
