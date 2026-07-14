import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { AgencyStatus } from 'generated/prisma';

export class UpdateAgencyStatusDto {
    @ApiProperty({ enum: AgencyStatus, example: AgencyStatus.DISABLED })
    @IsEnum(AgencyStatus)
    status: AgencyStatus;
}
