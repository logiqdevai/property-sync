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
  properties_updated_this_week: number;

  @ApiProperty()
  properties_removed_this_week: number;

  @ApiProperty()
  tracked_agencies: number;
}

export class UserDashboardActivityItem {
  @ApiProperty()
  id: string;

  @ApiProperty()
  property_id: string;

  @ApiProperty({ nullable: true })
  user_property_id: string | null;

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

export class UserDashboardListings {
  @ApiProperty({ type: [UserDashboardActivityItem] })
  added: UserDashboardActivityItem[];

  @ApiProperty({ type: [UserDashboardActivityItem] })
  updated: UserDashboardActivityItem[];

  @ApiProperty({ type: [UserDashboardActivityItem] })
  removed: UserDashboardActivityItem[];
}

export class UserDashboardResponse {
  @ApiProperty({ type: UserDashboardStats })
  stats: UserDashboardStats;

  @ApiProperty({ type: UserDashboardListings })
  listings: UserDashboardListings;
}
