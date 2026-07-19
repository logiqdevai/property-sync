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

  @Get('catalog/floors')
  @ApiOperation({ summary: 'Get EstateWeb floor option catalog' })
  @ApiResponse({ status: 200, description: 'EstateWeb floor catalog' })
  getFloorCatalog() {
    return this.adminEstateWebPropertiesService.getFloorCatalog();
  }

  @Get('catalog/energy-classes')
  @ApiOperation({ summary: 'Get EstateWeb energy class option catalog' })
  @ApiResponse({ status: 200, description: 'EstateWeb energy class catalog' })
  getEnergyClassCatalog() {
    return this.adminEstateWebPropertiesService.getEnergyClassCatalog();
  }

  @Get('catalog/road-types')
  @ApiOperation({ summary: 'Get EstateWeb road type option catalog' })
  @ApiResponse({ status: 200, description: 'EstateWeb road type catalog' })
  getRoadTypeCatalog() {
    return this.adminEstateWebPropertiesService.getRoadTypeCatalog();
  }

  @Get('catalog/listing-types')
  @ApiOperation({ summary: 'Get listing type catalog' })
  @ApiResponse({ status: 200, description: 'Listing type catalog' })
  getListingTypeCatalog() {
    return this.adminEstateWebPropertiesService.getListingTypeCatalog();
  }

  @Get('catalog/property-types')
  @ApiOperation({
    summary: 'Get EstateWeb property type catalog (id + human-readable path)',
  })
  @ApiResponse({ status: 200, description: 'EstateWeb property type catalog' })
  getPropertyTypeCatalog() {
    return this.adminEstateWebPropertiesService.getPropertyTypeCatalog();
  }

  @Get('catalog/features')
  @ApiOperation({ summary: 'Get EstateWeb feature catalog' })
  @ApiResponse({ status: 200, description: 'EstateWeb feature catalog' })
  getFeaturesCatalog() {
    return this.adminEstateWebPropertiesService.getFeaturesCatalog();
  }
}
