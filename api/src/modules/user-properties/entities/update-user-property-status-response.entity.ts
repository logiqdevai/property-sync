import { ApiProperty } from '@nestjs/swagger';
import { PropertyStatus } from 'generated/prisma';

export class UpdateUserPropertyStatusResponseEntity {
  @ApiProperty()
  accepted: number;

  @ApiProperty({ enum: PropertyStatus })
  status: PropertyStatus;

  @ApiProperty()
  message: string;
}
