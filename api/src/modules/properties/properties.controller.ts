import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtGuard } from '@/shared/guards/jwt.guard';
import { RolesGuard } from '@/shared/guards/roles.guard';
import { Roles } from '@/shared/decorators/roles.decorator';
import {
  AuthRole,
  ListingType,
  PropertyStatus,
  PropertyType,
} from 'generated/prisma';
import { ZodValidationPipe } from '@/shared/pipes/zod.validation.pipe';
import { PropertiesService } from './properties.service';
import {
  PropertyQuerySchema,
  PropertyQueryType,
} from './dto/property-query.schema';
import { MergePropertiesDto } from './dto/merge-properties.dto';
import { DeletePropertiesDto } from './dto/delete-properties.dto';
import { TruncatePropertyDescriptionsDto } from './dto/truncate-property-descriptions.dto';
import { PropertyEntity } from './entities/property.entity';

@ApiTags('Properties')
@ApiBearerAuth()
@Controller('admin/properties')
@UseGuards(JwtGuard, RolesGuard)
@Roles(AuthRole.ADMIN, AuthRole.SUPPORT)
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  @Get()
  @ApiOperation({ summary: 'List properties (paginated, filterable)' })
  @ApiResponse({ status: 200, description: 'Paginated property list' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: PropertyStatus })
  @ApiQuery({ name: 'listing_type', required: false, enum: ListingType })
  @ApiQuery({ name: 'property_type', required: false, enum: PropertyType })
  @ApiQuery({ name: 'city', required: false, type: String })
  @ApiQuery({ name: 'price_min', required: false, type: Number })
  @ApiQuery({ name: 'price_max', required: false, type: Number })
  @ApiQuery({ name: 'duplicate_group_id', required: false, type: String })
  @ApiQuery({
    name: 'has_duplicate_group',
    required: false,
    enum: ['true', 'false'],
  })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'agency_id', required: false, type: String })
  @ApiQuery({ name: 'date_from', required: false, type: String })
  @ApiQuery({ name: 'date_to', required: false, type: String })
  findAll(
    @Query(new ZodValidationPipe(PropertyQuerySchema)) query: PropertyQueryType,
  ) {
    return this.propertiesService.findAll(query);
  }

  @Get('count')
  @ApiOperation({ summary: 'Count properties matching filters' })
  @ApiResponse({ status: 200, description: 'Filtered property total' })
  @ApiQuery({ name: 'status', required: false, enum: PropertyStatus })
  @ApiQuery({ name: 'listing_type', required: false, enum: ListingType })
  @ApiQuery({ name: 'property_type', required: false, enum: PropertyType })
  @ApiQuery({ name: 'city', required: false, type: String })
  @ApiQuery({ name: 'price_min', required: false, type: Number })
  @ApiQuery({ name: 'price_max', required: false, type: Number })
  @ApiQuery({ name: 'duplicate_group_id', required: false, type: String })
  @ApiQuery({
    name: 'has_duplicate_group',
    required: false,
    enum: ['true', 'false'],
  })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'agency_id', required: false, type: String })
  @ApiQuery({ name: 'date_from', required: false, type: String })
  @ApiQuery({ name: 'date_to', required: false, type: String })
  count(
    @Query(new ZodValidationPipe(PropertyQuerySchema)) query: PropertyQueryType,
  ) {
    return this.propertiesService.count(query);
  }

  @Post('merge')
  @Roles(AuthRole.ADMIN)
  @ApiOperation({ summary: 'Merge properties into a duplicate group' })
  @ApiResponse({ status: 200, description: 'Properties merged' })
  @ApiResponse({ status: 400, description: 'Invalid merge payload' })
  @ApiResponse({ status: 404, description: 'One or more properties not found' })
  merge(@Body() dto: MergePropertiesDto) {
    return this.propertiesService.merge(dto);
  }

  @Post('bulk-delete')
  @Roles(AuthRole.ADMIN)
  @ApiOperation({ summary: 'Delete multiple properties' })
  @ApiResponse({ status: 200, description: 'Properties deleted' })
  @ApiResponse({ status: 400, description: 'Invalid property ids' })
  removeMany(@Body() dto: DeletePropertiesDto) {
    return this.propertiesService.removeMany(dto.property_ids);
  }

  @Post('truncate-descriptions')
  @Roles(AuthRole.ADMIN)
  @ApiOperation({
    summary: 'Remove exact text from selected property titles and descriptions',
  })
  @ApiResponse({ status: 200, description: 'Descriptions truncated' })
  @ApiResponse({ status: 400, description: 'Invalid truncate payload' })
  @ApiResponse({ status: 404, description: 'One or more properties not found' })
  truncateDescriptions(@Body() dto: TruncatePropertyDescriptionsDto) {
    return this.propertiesService.truncateDescriptions(
      dto.property_ids,
      dto.text,
      dto.replacement,
    );
  }

  @Post('dedupe-groups')
  @Roles(AuthRole.ADMIN)
  @ApiOperation({
    summary: 'Keep one property per duplicate group and delete the rest',
  })
  @ApiResponse({ status: 200, description: 'Duplicate group members deduped' })
  @ApiResponse({
    status: 400,
    description: 'No multi-member groups in selection',
  })
  @ApiResponse({ status: 404, description: 'One or more properties not found' })
  dedupeGroups(@Body() dto: DeletePropertiesDto) {
    return this.propertiesService.dedupeGroups(dto.property_ids);
  }

  @Post('bulk-split')
  @Roles(AuthRole.ADMIN)
  @ApiOperation({ summary: 'Remove selected properties from their duplicate groups' })
  @ApiResponse({ status: 200, description: 'Properties split from groups' })
  @ApiResponse({
    status: 400,
    description: 'None of the selected properties are in a duplicate group',
  })
  @ApiResponse({ status: 404, description: 'One or more properties not found' })
  splitMany(@Body() dto: DeletePropertiesDto) {
    return this.propertiesService.splitMany(dto.property_ids);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get property with source links and history' })
  @ApiResponse({ status: 200, type: PropertyEntity })
  @ApiResponse({ status: 404, description: 'Property not found' })
  findOne(@Param('id') id: string) {
    return this.propertiesService.findOne(id);
  }

  @Post(':id/split')
  @Roles(AuthRole.ADMIN)
  @ApiOperation({ summary: 'Remove property from its duplicate group' })
  @ApiResponse({ status: 200, type: PropertyEntity })
  @ApiResponse({ status: 404, description: 'Property not found' })
  split(@Param('id') id: string) {
    return this.propertiesService.split(id);
  }

  @Delete(':id')
  @Roles(AuthRole.ADMIN)
  @ApiOperation({ summary: 'Delete a property' })
  @ApiResponse({ status: 200, description: 'Deleted' })
  @ApiResponse({ status: 404, description: 'Property not found' })
  remove(@Param('id') id: string) {
    return this.propertiesService.remove(id);
  }
}
