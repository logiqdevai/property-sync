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
import { AuthRole, PropertyStatus } from 'generated/prisma';
import { ZodValidationPipe } from '@/shared/pipes/zod.validation.pipe';
import { SourcePropertiesService } from './source-properties.service';
import {
  SourcePropertyQuerySchema,
  SourcePropertyQueryType,
} from './dto/source-property-query.schema';
import { DeleteSourcePropertiesDto } from './dto/delete-source-properties.dto';
import { SourcePropertyEntity } from './entities/source-property.entity';

@ApiTags('Source Properties')
@ApiBearerAuth()
@Controller('admin/source-properties')
@UseGuards(JwtGuard, RolesGuard)
@Roles(AuthRole.ADMIN, AuthRole.SUPPORT)
export class SourcePropertiesController {
  constructor(
    private readonly sourcePropertiesService: SourcePropertiesService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List source properties (paginated, filterable)' })
  @ApiResponse({ status: 200, description: 'Paginated source property list' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: PropertyStatus })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'agency_id', required: false, type: String })
  @ApiQuery({ name: 'date_from', required: false, type: String })
  @ApiQuery({ name: 'date_to', required: false, type: String })
  @ApiQuery({
    name: 'order_by',
    required: false,
    enum: ['created_at', 'updated_at', 'price'],
  })
  @ApiQuery({
    name: 'order_direction',
    required: false,
    enum: ['asc', 'desc'],
  })
  findAll(
    @Query(new ZodValidationPipe(SourcePropertyQuerySchema))
    query: SourcePropertyQueryType,
  ) {
    return this.sourcePropertiesService.findAll(query);
  }

  @Get('count')
  @ApiOperation({ summary: 'Count source properties matching filters' })
  @ApiResponse({ status: 200, description: 'Filtered source property total' })
  @ApiQuery({ name: 'status', required: false, enum: PropertyStatus })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'agency_id', required: false, type: String })
  @ApiQuery({ name: 'date_from', required: false, type: String })
  @ApiQuery({ name: 'date_to', required: false, type: String })
  count(
    @Query(new ZodValidationPipe(SourcePropertyQuerySchema))
    query: SourcePropertyQueryType,
  ) {
    return this.sourcePropertiesService.count(query);
  }

  @Post('bulk-delete')
  @Roles(AuthRole.ADMIN)
  @ApiOperation({ summary: 'Delete multiple source properties' })
  @ApiResponse({ status: 200, description: 'Source properties deleted' })
  @ApiResponse({ status: 400, description: 'Invalid source property ids' })
  removeMany(@Body() dto: DeleteSourcePropertiesDto) {
    return this.sourcePropertiesService.removeMany(dto.source_property_ids);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get source property with agency and links' })
  @ApiResponse({ status: 200, type: SourcePropertyEntity })
  @ApiResponse({ status: 404, description: 'Source property not found' })
  findOne(@Param('id') id: string) {
    return this.sourcePropertiesService.findOne(id);
  }

  @Delete(':id')
  @Roles(AuthRole.ADMIN)
  @ApiOperation({ summary: 'Delete a source property' })
  @ApiResponse({ status: 200, description: 'Deleted' })
  @ApiResponse({ status: 404, description: 'Source property not found' })
  remove(@Param('id') id: string) {
    return this.sourcePropertiesService.remove(id);
  }
}
