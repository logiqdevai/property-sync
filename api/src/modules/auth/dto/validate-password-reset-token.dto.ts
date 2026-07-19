import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class ValidatePasswordResetTokenDto {
  @ApiProperty()
  @IsString()
  token: string;
}
