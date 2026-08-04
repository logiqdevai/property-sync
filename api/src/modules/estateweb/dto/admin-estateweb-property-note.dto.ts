import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class AdminEstateWebPropertyNoteDto {
  @ApiProperty({ description: 'Note text to add on the EstateWeb property' })
  @IsString()
  @MinLength(1)
  note: string;
}
