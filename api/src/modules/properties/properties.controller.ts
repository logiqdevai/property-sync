import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtGuard } from '@/shared/guards/jwt.guard';
import { RolesGuard } from '@/shared/guards/roles.guard';
import { Roles } from '@/shared/decorators/roles.decorator';
import { AuthRole } from 'generated/prisma';
import { ZodValidationPipe } from '@/shared/pipes/zod.validation.pipe';
import { PropertiesService } from './properties.service';
import {
  PropertyQuerySchema,
  PropertyQueryType,
} from './dto/property-query.schema';
import { MergePropertiesDto } from './dto/merge-properties.dto';
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
  findAll(
    @Query(new ZodValidationPipe(PropertyQuerySchema)) query: PropertyQueryType,
  ) {
    return this.propertiesService.findAll(query);
  }

  @Post('merge')
  @Roles(AuthRole.ADMIN)
  @ApiOperation({ summary: 'Merge properties into a duplicate group' })
  merge(@Body() dto: MergePropertiesDto) {
    return this.propertiesService.merge(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get property with source links and history' })
  @ApiResponse({ status: 200, type: PropertyEntity })
  findOne(@Param('id') id: string) {
    return this.propertiesService.findOne(id);
  }

  @Post(':id/split')
  @Roles(AuthRole.ADMIN)
  @ApiOperation({ summary: 'Remove property from its duplicate group' })
  split(@Param('id') id: string) {
    return this.propertiesService.split(id);
  }
}
