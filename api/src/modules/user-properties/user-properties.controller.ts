import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
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
import { CurrentUser } from '@/shared/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/shared/pipes/zod.validation.pipe';
import { AuthRole, PropertyStatus } from 'generated/prisma';
import { UserPropertiesService } from './user-properties.service';
import { UpdateUserPropertyDto } from './dto/update-user-property.dto';
import { DeleteUserPropertiesDto } from './dto/delete-user-properties.dto';
import { DeleteIntegrationImagesDto } from './dto/delete-integration-images.dto';
import { CreateIntegrationImagesDto } from './dto/create-integration-images.dto';
import { UpdateIntegrationImagesDto } from './dto/update-integration-images.dto';
import { RemoveWatermarkImagesDto } from './dto/remove-watermark-images.dto';
import { RemoveWatermarkImagesResponseEntity } from './entities/remove-watermark-images-response.entity';
import { TruncateUserPropertyDescriptionsDto } from './dto/truncate-user-property-descriptions.dto';
import {
  UserPropertyQuerySchema,
  UserPropertyQueryType,
} from './dto/user-property-query.schema';
import { UserPropertyEntity } from './entities/user-property.entity';

@ApiTags('User Properties')
@ApiBearerAuth()
@Controller('properties')
@UseGuards(JwtGuard)
export class UserPropertiesController {
  constructor(private readonly userPropertiesService: UserPropertiesService) {}

  @Get()
  @ApiOperation({ summary: 'List the current user saved properties' })
  @ApiResponse({ status: 200, description: 'Paginated saved property list' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: PropertyStatus })
  @ApiQuery({ name: 'change', required: false, enum: ['new', 'updated'] })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'city', required: false, type: String })
  @ApiQuery({ name: 'price_min', required: false, type: Number })
  @ApiQuery({ name: 'price_max', required: false, type: Number })
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
  @ApiQuery({ name: 'agency_id', required: false, type: String })
  @ApiQuery({ name: 'user_tracked_agency_id', required: false, type: String })
  @ApiQuery({ name: 'date_from', required: false, type: String })
  @ApiQuery({ name: 'date_to', required: false, type: String })
  findAll(
    @CurrentUser('id') userId: string,
    @Query(new ZodValidationPipe(UserPropertyQuerySchema))
    query: UserPropertyQueryType,
  ) {
    return this.userPropertiesService.findAll(userId, query);
  }

  @Get('count')
  @ApiOperation({ summary: 'Count saved properties matching filters' })
  @ApiResponse({ status: 200, description: 'Filtered saved property total' })
  @ApiQuery({ name: 'status', required: false, enum: PropertyStatus })
  @ApiQuery({ name: 'change', required: false, enum: ['new', 'updated'] })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'city', required: false, type: String })
  @ApiQuery({ name: 'price_min', required: false, type: Number })
  @ApiQuery({ name: 'price_max', required: false, type: Number })
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
  @ApiQuery({ name: 'agency_id', required: false, type: String })
  @ApiQuery({ name: 'user_tracked_agency_id', required: false, type: String })
  @ApiQuery({ name: 'date_from', required: false, type: String })
  @ApiQuery({ name: 'date_to', required: false, type: String })
  count(
    @CurrentUser('id') userId: string,
    @Query(new ZodValidationPipe(UserPropertyQuerySchema))
    query: UserPropertyQueryType,
  ) {
    return this.userPropertiesService.count(userId, query);
  }

  @Post('bulk-delete')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(AuthRole.ADMIN)
  @ApiOperation({ summary: 'Delete multiple saved properties (admin only)' })
  @ApiResponse({ status: 200, description: 'Saved properties deleted' })
  @ApiResponse({ status: 403, description: 'Admin only' })
  removeMany(
    @CurrentUser('id') userId: string,
    @Body() dto: DeleteUserPropertiesDto,
  ) {
    return this.userPropertiesService.removeMany(userId, dto.ids);
  }

  @Post('dedupe-groups')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(AuthRole.ADMIN)
  @ApiOperation({
    summary:
      'Keep one saved property per duplicate group and delete the rest (admin only)',
  })
  @ApiResponse({ status: 200, description: 'Duplicate group members deduped' })
  @ApiResponse({
    status: 400,
    description: 'No multi-member groups in selection',
  })
  @ApiResponse({ status: 403, description: 'Admin only' })
  dedupeGroups(
    @CurrentUser('id') userId: string,
    @Body() dto: DeleteUserPropertiesDto,
  ) {
    return this.userPropertiesService.dedupeGroups(userId, dto.ids);
  }

  @Post('bulk-split')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(AuthRole.ADMIN)
  @ApiOperation({
    summary:
      'Remove selected saved properties from their duplicate groups (admin only)',
  })
  @ApiResponse({ status: 200, description: 'Properties split from groups' })
  @ApiResponse({
    status: 400,
    description: 'None of the selected properties are in a duplicate group',
  })
  @ApiResponse({ status: 403, description: 'Admin only' })
  @ApiResponse({ status: 404, description: 'One or more properties not found' })
  splitMany(
    @CurrentUser('id') userId: string,
    @Body() dto: DeleteUserPropertiesDto,
  ) {
    return this.userPropertiesService.splitMany(userId, dto.ids);
  }

  @Post('truncate-descriptions')
  @ApiOperation({
    summary: 'Remove exact text from selected saved property titles and descriptions',
  })
  @ApiResponse({ status: 200, description: 'Descriptions truncated' })
  @ApiResponse({ status: 400, description: 'Invalid truncate payload' })
  @ApiResponse({ status: 404, description: 'One or more properties not found' })
  truncateDescriptions(
    @CurrentUser('id') userId: string,
    @Body() dto: TruncateUserPropertyDescriptionsDto,
  ) {
    return this.userPropertiesService.truncateDescriptions(
      userId,
      dto.ids,
      dto.text,
      dto.replacement,
    );
  }

  @Post('push-to-cms')
  @ApiOperation({
    summary:
      'Push one or more properties to the linked EstateWeb CMS (create or update)',
  })
  @ApiResponse({ status: 200, description: 'CMS push queued' })
  @ApiResponse({ status: 400, description: 'Cannot push to CMS' })
  @ApiResponse({ status: 404, description: 'Saved property not found' })
  pushToCrmMany(
    @CurrentUser('id') userId: string,
    @Body() dto: DeleteUserPropertiesDto,
  ) {
    return this.userPropertiesService.pushToCrm(userId, dto.ids);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one saved property with canonical history' })
  @ApiResponse({ status: 200, type: UserPropertyEntity })
  @ApiResponse({ status: 404, description: 'Saved property not found' })
  findOne(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.userPropertiesService.findOne(userId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a saved property copy' })
  @ApiResponse({ status: 200, type: UserPropertyEntity })
  @ApiResponse({ status: 404, description: 'Saved property not found' })
  update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateUserPropertyDto,
  ) {
    return this.userPropertiesService.update(userId, id, dto);
  }

  @Post(':id/resync')
  @ApiOperation({ summary: 'Overwrite local edits from canonical property' })
  @ApiResponse({ status: 200, type: UserPropertyEntity })
  @ApiResponse({ status: 404, description: 'Saved property not found' })
  resync(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.userPropertiesService.resync(userId, id);
  }

  @Post(':id/push-to-cms')
  @ApiOperation({
    summary:
      'Push this property to the linked EstateWeb CMS (create or update)',
  })
  @ApiResponse({ status: 200, type: UserPropertyEntity })
  @ApiResponse({ status: 400, description: 'Cannot push to CMS' })
  @ApiResponse({ status: 404, description: 'Saved property not found' })
  pushToCrm(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.userPropertiesService.pushToCrm(userId, id);
  }

  @Post(':id/migrate-integration-images')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(AuthRole.ADMIN)
  @ApiOperation({
    summary:
      'Fetch EstateWeb CMS images and upsert IntegrationProperty.images (admin only)',
  })
  @ApiResponse({ status: 200, type: UserPropertyEntity })
  @ApiResponse({ status: 400, description: 'Cannot migrate images' })
  @ApiResponse({ status: 403, description: 'Admin only' })
  @ApiResponse({ status: 404, description: 'Saved property not found' })
  migrateIntegrationImages(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.userPropertiesService.migrateIntegrationImages(userId, id);
  }

  @Post(':id/delete-integration-images')
  @ApiOperation({
    summary: 'Delete selected CMS images via the linked integration adapter',
  })
  @ApiResponse({ status: 200, type: UserPropertyEntity })
  @ApiResponse({ status: 400, description: 'Cannot delete images' })
  @ApiResponse({ status: 404, description: 'Saved property not found' })
  deleteIntegrationImages(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: DeleteIntegrationImagesDto,
  ) {
    return this.userPropertiesService.deleteIntegrationImages(
      userId,
      id,
      dto.image_ids,
    );
  }

  @Post(':id/create-integration-images')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(AuthRole.ADMIN)
  @ApiOperation({
    summary:
      'Upload selected Property.images into CMS via the linked integration adapter (admin only)',
  })
  @ApiResponse({ status: 200, type: UserPropertyEntity })
  @ApiResponse({ status: 400, description: 'Cannot create images' })
  @ApiResponse({ status: 403, description: 'Admin only' })
  @ApiResponse({ status: 404, description: 'Saved property not found' })
  createIntegrationImages(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: CreateIntegrationImagesDto,
  ) {
    return this.userPropertiesService.createIntegrationImages(
      userId,
      id,
      dto.image_indexes,
    );
  }

  @Post(':id/update-integration-images')
  @ApiOperation({
    summary:
      'Update EstateWeb visibility options for selected CMS images via the linked integration adapter',
  })
  @ApiResponse({ status: 200, type: UserPropertyEntity })
  @ApiResponse({ status: 400, description: 'Cannot update images' })
  @ApiResponse({ status: 404, description: 'Saved property not found' })
  updateIntegrationImages(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateIntegrationImagesDto,
  ) {
    return this.userPropertiesService.updateIntegrationImages(
      userId,
      id,
      dto.image_ids,
      {
        show_on_site: dto.show_on_site,
        show_on_groups: dto.show_on_groups,
        show_on_foreign_agents: dto.show_on_foreign_agents,
      },
    );
  }

  @Post(':id/remove-watermark-images')
  @ApiOperation({
    summary:
      'Enqueue background watermark removal for selected EstateWeb CRM images',
  })
  @ApiResponse({ status: 200, type: RemoveWatermarkImagesResponseEntity })
  @ApiResponse({ status: 400, description: 'Cannot enqueue watermark removal' })
  @ApiResponse({ status: 404, description: 'Saved property not found' })
  removeWatermarkImages(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: RemoveWatermarkImagesDto,
  ) {
    return this.userPropertiesService.enqueueRemoveWatermarkImages(
      userId,
      id,
      dto,
    );
  }

  @Delete(':id')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(AuthRole.ADMIN)
  @ApiOperation({ summary: 'Delete a saved property (admin only)' })
  @ApiResponse({ status: 200, description: 'Deleted' })
  @ApiResponse({ status: 403, description: 'Admin only' })
  @ApiResponse({ status: 404, description: 'Saved property not found' })
  remove(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.userPropertiesService.remove(userId, id);
  }
}
