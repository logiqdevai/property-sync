import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { AgencyStatus } from 'generated/prisma';
import { CreateAgencyDto } from './create-agency.dto';

export class UpdateAgencyDto extends PartialType(CreateAgencyDto) {
    @ApiProperty({ required: false, enum: AgencyStatus })
    @IsOptional()
    @IsEnum(AgencyStatus)
    status?: AgencyStatus;
}
