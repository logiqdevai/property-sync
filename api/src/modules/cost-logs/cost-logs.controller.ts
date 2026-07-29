import { Controller, Get, Query, UseGuards } from '@nestjs/common';
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
import { AuthRole, CostOperationType, IntegrationType } from 'generated/prisma';
import { ZodValidationPipe } from '@/shared/pipes/zod.validation.pipe';
import { CostLogsService } from './cost-logs.service';
import { CostLogQuerySchema, CostLogQueryType } from './dto/cost-log-query.schema';

@ApiTags('Cost Logs')
@ApiBearerAuth()
@Controller('admin/cost-logs')
@UseGuards(JwtGuard, RolesGuard)
@Roles(AuthRole.ADMIN, AuthRole.SUPPORT)
export class CostLogsController {
  constructor(private readonly costLogsService: CostLogsService) {}

  @Get()
  @ApiOperation({ summary: 'List cost logs (paginated, filterable)' })
  @ApiResponse({ status: 200, description: 'Paginated cost log list' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'user_id', required: false, type: String })
  @ApiQuery({ name: 'operation_type', required: false, enum: CostOperationType })
  @ApiQuery({ name: 'provider', required: false, enum: IntegrationType })
  @ApiQuery({ name: 'date_from', required: false, type: String })
  @ApiQuery({ name: 'date_to', required: false, type: String })
  findAll(
    @Query(new ZodValidationPipe(CostLogQuerySchema)) query: CostLogQueryType,
  ) {
    return this.costLogsService.findAll(query);
  }
}
