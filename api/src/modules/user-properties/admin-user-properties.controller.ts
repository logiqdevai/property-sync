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
import { UserPropertiesService } from './user-properties.service';
import {
  AdminUserPropertyQuerySchema,
  AdminUserPropertyQueryType,
} from './dto/admin-user-property-query.schema';
import { DeleteUserPropertiesDto } from './dto/delete-user-properties.dto';
import { TruncateUserPropertyDescriptionsDto } from './dto/truncate-user-property-descriptions.dto';
import { UserPropertyEntity } from './entities/user-property.entity';

@ApiTags('Admin User Properties')
@ApiBearerAuth()
@Controller('admin/user-properties')
@UseGuards(JwtGuard, RolesGuard)
@Roles(AuthRole.ADMIN, AuthRole.SUPPORT)
export class AdminUserPropertiesController {
  constructor(private readonly userPropertiesService: UserPropertiesService) {}

  @Get()
  @ApiOperation({ summary: 'List all user properties (paginated, filterable)' })
  @ApiResponse({ status: 200, description: 'Paginated user property list' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: PropertyStatus })
  @ApiQuery({ name: 'change', required: false, enum: ['new', 'updated'] })
  @ApiQuery({ name: 'listing_type', required: false, enum: ListingType })
  @ApiQuery({ name: 'property_type', required: false, enum: PropertyType })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'user_id', required: false, type: String })
  @ApiQuery({ name: 'agency_id', required: false, type: String })
  @ApiQuery({
    name: 'has_duplicate_group',
    required: false,
    enum: ['true', 'false'],
  })
  @ApiQuery({
    name: 'pushed_to_crm',
    required: false,
    enum: ['true', 'false'],
  })
  @ApiQuery({
    name: 'pending_crm_update',
    required: false,
    enum: ['true', 'false'],
  })
  @ApiQuery({ name: 'date_from', required: false, type: String })
  @ApiQuery({ name: 'date_to', required: false, type: String })
  findAll(
    @Query(new ZodValidationPipe(AdminUserPropertyQuerySchema))
    query: AdminUserPropertyQueryType,
  ) {
    return this.userPropertiesService.adminFindAll(query);
  }

  @Get('count')
  @ApiOperation({ summary: 'Count user properties matching filters' })
  @ApiResponse({ status: 200, description: 'Filtered user property total' })
  @ApiQuery({ name: 'status', required: false, enum: PropertyStatus })
  @ApiQuery({ name: 'change', required: false, enum: ['new', 'updated'] })
  @ApiQuery({ name: 'listing_type', required: false, enum: ListingType })
  @ApiQuery({ name: 'property_type', required: false, enum: PropertyType })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'user_id', required: false, type: String })
  @ApiQuery({ name: 'agency_id', required: false, type: String })
  @ApiQuery({
    name: 'has_duplicate_group',
    required: false,
    enum: ['true', 'false'],
  })
  @ApiQuery({
    name: 'pushed_to_crm',
    required: false,
    enum: ['true', 'false'],
  })
  @ApiQuery({
    name: 'pending_crm_update',
    required: false,
    enum: ['true', 'false'],
  })
  @ApiQuery({ name: 'date_from', required: false, type: String })
  @ApiQuery({ name: 'date_to', required: false, type: String })
  count(
    @Query(new ZodValidationPipe(AdminUserPropertyQuerySchema))
    query: AdminUserPropertyQueryType,
  ) {
    return this.userPropertiesService.adminCount(query);
  }

  @Post('bulk-delete')
  @Roles(AuthRole.ADMIN)
  @ApiOperation({ summary: 'Delete multiple user properties' })
  @ApiResponse({ status: 200, description: 'User properties deleted' })
  @ApiResponse({ status: 400, description: 'Invalid user property ids' })
  removeMany(@Body() dto: DeleteUserPropertiesDto) {
    return this.userPropertiesService.adminRemoveMany(dto.ids);
  }

  @Post('truncate-descriptions')
  @Roles(AuthRole.ADMIN)
  @ApiOperation({
    summary: 'Remove exact text from selected user property titles and descriptions',
  })
  @ApiResponse({ status: 200, description: 'Descriptions truncated' })
  @ApiResponse({ status: 400, description: 'Invalid truncate payload' })
  @ApiResponse({ status: 404, description: 'One or more user properties not found' })
  truncateDescriptions(@Body() dto: TruncateUserPropertyDescriptionsDto) {
    return this.userPropertiesService.adminTruncateDescriptions(
      dto.ids,
      dto.text,
      dto.replacement,
    );
  }

  @Post('dedupe-groups')
  @Roles(AuthRole.ADMIN)
  @ApiOperation({
    summary: 'Keep one user property per duplicate group and delete the rest',
  })
  @ApiResponse({ status: 200, description: 'Duplicate group members deduped' })
  @ApiResponse({
    status: 400,
    description: 'No multi-member groups in selection',
  })
  @ApiResponse({ status: 404, description: 'One or more user properties not found' })
  dedupeGroups(@Body() dto: DeleteUserPropertiesDto) {
    return this.userPropertiesService.adminDedupeGroups(dto.ids);
  }

  @Post('bulk-split')
  @Roles(AuthRole.ADMIN)
  @ApiOperation({
    summary: 'Remove selected user properties from their duplicate groups',
  })
  @ApiResponse({ status: 200, description: 'Properties split from groups' })
  @ApiResponse({
    status: 400,
    description: 'None of the selected properties are in a duplicate group',
  })
  @ApiResponse({ status: 404, description: 'One or more user properties not found' })
  splitMany(@Body() dto: DeleteUserPropertiesDto) {
    return this.userPropertiesService.adminSplitMany(dto.ids);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user property with owner, sources, and history' })
  @ApiResponse({ status: 200, type: UserPropertyEntity })
  @ApiResponse({ status: 404, description: 'User property not found' })
  findOne(@Param('id') id: string) {
    return this.userPropertiesService.adminFindOne(id);
  }

  @Post(':id/migrate-integration-images')
  @Roles(AuthRole.ADMIN)
  @ApiOperation({
    summary:
      'Fetch EstateWeb CRM images and upsert IntegrationProperty.images',
  })
  @ApiResponse({ status: 200, type: UserPropertyEntity })
  @ApiResponse({ status: 400, description: 'Cannot migrate images' })
  @ApiResponse({ status: 404, description: 'User property not found' })
  migrateIntegrationImages(@Param('id') id: string) {
    return this.userPropertiesService.adminMigrateIntegrationImages(id);
  }

  @Delete(':id')
  @Roles(AuthRole.ADMIN)
  @ApiOperation({ summary: 'Delete a user property' })
  @ApiResponse({ status: 200, description: 'Deleted' })
  @ApiResponse({ status: 404, description: 'User property not found' })
  remove(@Param('id') id: string) {
    return this.userPropertiesService.adminRemove(id);
  }
}
