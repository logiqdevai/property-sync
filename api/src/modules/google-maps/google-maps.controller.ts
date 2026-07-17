import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { GoogleMapsService } from './google-maps.service';

@ApiTags('Google Maps')
@Controller('google-maps')
export class GoogleMapsController {
  constructor(private readonly googleMapsService: GoogleMapsService) {}

  @Get('timezone')
  @ApiOperation({ summary: 'Resolve timezone for a latitude/longitude' })
  @ApiQuery({ name: 'lat', required: true, type: Number, example: 37.9838 })
  @ApiQuery({ name: 'lng', required: true, type: Number, example: 23.7275 })
  @ApiResponse({
    status: 200,
    description: 'Timezone payload from Google Time Zone API',
  })
  @ApiResponse({ status: 400, description: 'Missing or invalid lat/lng' })
  getTimezone(@Query('lat') lat: number, @Query('lng') lng: number) {
    return this.googleMapsService.getTimezone(lat, lng);
  }
}
