import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl, MinLength } from 'class-validator';

export class SetEstateWebSessionDto {
  @ApiProperty({
    description: 'Value of the EstateWeb `estate_session` cookie',
    example: 'abc123sessionvalue',
  })
  @IsString()
  @MinLength(1)
  estate_session: string;

  @ApiProperty({
    description: 'Bearer token extracted from the EstateWeb `/app` page',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString()
  @MinLength(1)
  token: string;

  @ApiPropertyOptional({
    description: 'Optional CSRF token from the EstateWeb login form',
  })
  @IsOptional()
  @IsString()
  csrf?: string;

  @ApiPropertyOptional({
    description: 'EstateWeb base URL override (defaults to integration target base URL)',
    example: 'https://app.estateweb.gr',
  })
  @IsOptional()
  @IsUrl({ require_tld: false })
  base_url?: string;
}
