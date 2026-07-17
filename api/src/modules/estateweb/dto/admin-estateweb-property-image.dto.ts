import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class AdminEstateWebPropertyImageDto {
  @ApiProperty({ example: 'living-room.jpg' })
  @IsString()
  @MinLength(1)
  filename: string;

  @ApiPropertyOptional({ enum: [0, 1], default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  show_on_site?: 0 | 1;

  @ApiPropertyOptional({ enum: [0, 1], default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  show_on_groups?: 0 | 1;

  @ApiPropertyOptional({ enum: [0, 1], default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  show_on_foreign_agents?: 0 | 1;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  zindex?: number;
}
