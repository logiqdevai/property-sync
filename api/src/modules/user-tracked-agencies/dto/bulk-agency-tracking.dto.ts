import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsUUID,
} from 'class-validator';
import { TrackAgencyDto } from './track-agency.dto';

export const BulkAgencyTrackingActions = {
  TRACK: 'track',
  UNTRACK: 'untrack',
  UPDATE: 'update',
} as const;

export type BulkAgencyTrackingAction =
  (typeof BulkAgencyTrackingActions)[keyof typeof BulkAgencyTrackingActions];

export class BulkAgencyTrackingDto extends TrackAgencyDto {
  @ApiProperty({ type: [String], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  agency_ids: string[];

  @ApiProperty({ enum: Object.values(BulkAgencyTrackingActions) })
  @IsIn(Object.values(BulkAgencyTrackingActions))
  action: BulkAgencyTrackingAction;
}
