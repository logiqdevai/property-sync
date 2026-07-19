import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ example: 'current-password' })
  @IsString()
  @MinLength(1)
  current_password: string;

  @ApiProperty({ minLength: 6, example: 'new-password' })
  @IsString()
  @MinLength(6)
  new_password: string;
}
