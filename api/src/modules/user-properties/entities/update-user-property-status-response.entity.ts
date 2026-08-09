import { ApiProperty } from '@nestjs/swagger';
import { PropertyStatus } from 'generated/prisma';

export class UpdateUserPropertyStatusResponseEntity {
  @ApiProperty()
  updated: number;

  @ApiProperty({ enum: PropertyStatus })
  status: PropertyStatus;
}
