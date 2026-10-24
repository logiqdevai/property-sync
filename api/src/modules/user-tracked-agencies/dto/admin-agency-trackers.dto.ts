import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';

export class AdminTrackAgencyUsersDto {
  @ApiProperty({ type: [String], description: 'Users who should track the agency' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  user_ids: string[];
}

export class AdminSetIntegrationClientDto {
  @ApiProperty({ nullable: true, description: 'CRM client id, or null to clear it' })
  @IsOptional()
  @IsInt()
  @Min(1)
  integration_client_id?: number | null;
}

export class AdminSearchIntegrationClientsQueryDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  last_name: string;
}
