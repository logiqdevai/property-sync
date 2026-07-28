import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional } from 'class-validator';
import { UserIntegrationSettingsData } from '@/modules/user-integrations/interfaces/user-integration-settings.interface';

export class UpdateUserIntegrationSettingsDto {
  @ApiPropertyOptional({
    type: Object,
    example: {
      estateweb_default_sites: [
        {
          selected: true,
          name: '1. re1.gr',
          agent_site_id: 1002,
          show_on_slider: 0,
          show_on_first_page: 0,
          show_on_relative_pages: 1,
        },
      ],
      estateweb_ad_languages: [1, 2],
      estateweb_listing_types: ['SALE', 'RENT'],
      sales: {
        enable_sales: false,
        sale_percentage_start: 0.05,
        sale_percentage_end: 0.1,
      },
    },
  })
  @IsOptional()
  @IsObject()
  settings?: UserIntegrationSettingsData;
}
