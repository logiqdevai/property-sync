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
  @ApiQuery({ name: 'city', required: false, type: String })
  @ApiQuery({ name: 'price_min', required: false, type: Number })
  @ApiQuery({ name: 'price_max', required: false, type: Number })
  @ApiQuery({ name: 'agency_id', required: false, type: String })
  @ApiQuery({ name: 'user_tracked_agency_id', required: false, type: String })
  findAll(
    @CurrentUser('id') userId: string,
    @Query(new ZodValidationPipe(UserPropertyQuerySchema))
    query: UserPropertyQueryType,
  ) {
    return this.userPropertiesService.findAll(userId, query);
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
