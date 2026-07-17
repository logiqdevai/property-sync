import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class SendTelegramTestDto {
  @ApiProperty({
    description: 'Plain text message to send to the configured Telegram chat',
    example: 'Hello from Property Sync',
    minLength: 1,
    maxLength: 4096,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  message: string;
}
