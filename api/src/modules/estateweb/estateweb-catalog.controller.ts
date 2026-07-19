import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtGuard } from '@/shared/guards/jwt.guard';
import { AdminEstateWebPropertiesService } from './admin-estateweb-properties.service';

@ApiTags('EstateWeb Catalog')
@ApiBearerAuth()
@Controller('estateweb')
@UseGuards(JwtGuard)
export class EstateWebCatalogController {
  constructor(
    private readonly adminEstateWebPropertiesService: AdminEstateWebPropertiesService,
  ) {}

  @Get('catalog/locations')
  @ApiOperation({
    summary: 'Get EstateWeb location catalog (id + human-readable path)',
  })
  @ApiResponse({ status: 200, description: 'EstateWeb location catalog' })
  getLocationCatalog() {
    return this.adminEstateWebPropertiesService.getLocationCatalog();
  }
}
