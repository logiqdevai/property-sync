import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
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
import { DiagnosticsService } from './diagnostics.service';
import {
  DiagnosticsQuerySchema,
  DiagnosticsQueryType,
} from './dto/diagnostics-query.schema';

@ApiTags('Diagnostics')
@ApiBearerAuth()
@Controller('admin/diagnostics')
@UseGuards(JwtGuard, RolesGuard)
@Roles(AuthRole.ADMIN, AuthRole.SUPPORT)
export class DiagnosticsController {
  constructor(private readonly diagnosticsService: DiagnosticsService) {}

  @Get()
  @ApiOperation({
    summary: 'List diagnostics packages (paginated, filterable)',
  })
  @ApiResponse({ status: 200, description: 'Paginated diagnostics package list' })
  findAll(
    @Query(new ZodValidationPipe(DiagnosticsQuerySchema))
    query: DiagnosticsQueryType,
  ) {
    return this.diagnosticsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get one diagnostics package with signed artifact URLs',
  })
  @ApiResponse({ status: 404, description: 'Diagnostics package not found' })
  findOne(@Param('id') id: string) {
    return this.diagnosticsService.findOne(id);
  }
}
