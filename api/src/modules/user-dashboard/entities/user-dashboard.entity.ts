import { ApiProperty } from '@nestjs/swagger';
import { PropertyHistoryEventType } from 'generated/prisma';

export class UserDashboardStats {
  @ApiProperty()
  total_properties: number;

  @ApiProperty()
  active_properties: number;

  @ApiProperty()
  properties_added_this_week: number;

  @ApiProperty()
  tracked_agencies: number;
}

export class UserDashboardActivityItem {
  @ApiProperty()
  id: string;

  @ApiProperty()
  property_id: string;

  @ApiProperty()
  property_title: string;

  @ApiProperty({ enum: PropertyHistoryEventType })
  event_type: PropertyHistoryEventType;

  @ApiProperty({ nullable: true })
  field: string | null;

  @ApiProperty({ nullable: true })
  old_value: unknown;

  @ApiProperty({ nullable: true })
  new_value: unknown;

  @ApiProperty()
  created_at: Date;
}

export class UserDashboardResponse {
  @ApiProperty({ type: UserDashboardStats })
  stats: UserDashboardStats;

  @ApiProperty({ type: [UserDashboardActivityItem] })
  activity: UserDashboardActivityItem[];
}
