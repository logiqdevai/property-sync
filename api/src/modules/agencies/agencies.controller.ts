import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from '@/shared/guards/jwt.guard';
import { RolesGuard } from '@/shared/guards/roles.guard';
import { Roles } from '@/shared/decorators/roles.decorator';
import { ZodValidationPipe } from '@/shared/pipes/zod.validation.pipe';
import { AgenciesService } from './agencies.service';
import { CreateAgencyDto } from './dto/create-agency.dto';
import { UpdateAgencyDto } from './dto/update-agency.dto';
import { UpdateAgencyVisibilityDto } from './dto/update-agency-visibility.dto';
import { UpdateTrackerAdminSettingsDto } from './dto/update-tracker-admin-settings.dto';
import { AgencyQuerySchema, AgencyQueryType } from './dto/agency-query.schema';
import { Agency } from './entities/agency.entity';

@ApiTags('Agencies')
@ApiBearerAuth()
@Controller('admin/agencies')
@UseGuards(JwtGuard, RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
export class AgenciesController {
    constructor(private readonly agenciesService: AgenciesService) { }

    @Get()
    @ApiOperation({ summary: 'List agencies (paginated, searchable, filterable)' })
    @ApiResponse({ status: 200, description: 'Paginated agency list' })
    findAll(@Query(new ZodValidationPipe(AgencyQuerySchema)) query: AgencyQueryType) {
        return this.agenciesService.findAll(query);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get one agency with related counts' })
    @ApiResponse({ status: 200, type: Agency })
    @ApiResponse({ status: 404, description: 'Agency not found' })
    findOne(@Param('id') id: string) {
        return this.agenciesService.findOne(id);
    }

    @Post()
    @Roles('ADMIN', 'SUPER_ADMIN')
    @ApiOperation({ summary: 'Create an agency' })
    @ApiResponse({ status: 201, type: Agency })
    @ApiResponse({ status: 409, description: 'base_url already exists' })
    create(@Body() dto: CreateAgencyDto) {
        return this.agenciesService.create(dto);
    }

    @Patch(':id/trackers/:userId')
    @Roles('ADMIN', 'SUPER_ADMIN')
    @ApiOperation({ summary: "Update admin-only tracker settings for a user's tracked agency" })
    @ApiResponse({ status: 200, description: 'Updated UserTrackedAgency' })
    @ApiResponse({ status: 404, description: 'User does not track this agency' })
    updateTrackerAdminSettings(
        @Param('id') id: string,
        @Param('userId') userId: string,
        @Body() dto: UpdateTrackerAdminSettingsDto,
    ) {
        return this.agenciesService.updateTrackerAdminSettings(id, userId, dto);
    }

    @Patch(':id')
    @Roles('ADMIN', 'SUPER_ADMIN')
    @ApiOperation({ summary: 'Update an agency' })
    @ApiResponse({ status: 200, type: Agency })
    @ApiResponse({ status: 404, description: 'Agency not found' })
    update(@Param('id') id: string, @Body() dto: UpdateAgencyDto) {
        return this.agenciesService.update(id, dto);
    }

    @Patch(':id/visibility')
    @Roles('ADMIN', 'SUPER_ADMIN')
    @ApiOperation({ summary: 'Update agency visibility flags' })
    @ApiResponse({ status: 200, type: Agency })
    updateVisibility(@Param('id') id: string, @Body() dto: UpdateAgencyVisibilityDto) {
        return this.agenciesService.updateVisibility(id, dto);
    }

    @Delete(':id')
    @Roles('ADMIN', 'SUPER_ADMIN')
    @ApiOperation({ summary: 'Delete an agency (only if no scrapers/crawl runs exist)' })
    @ApiResponse({ status: 200, description: 'Deleted' })
    @ApiResponse({ status: 409, description: 'Agency has dependent scrapers or crawl runs' })
    remove(@Param('id') id: string) {
        return this.agenciesService.remove(id);
    }
}
