import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from '@/shared/guards/jwt.guard';
import { CurrentUser } from '@/shared/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/shared/pipes/zod.validation.pipe';
import { CostOperationType, IntegrationType } from 'generated/prisma';
import { CostLogsService } from './cost-logs.service';
import { UserCostLogQuerySchema, UserCostLogQueryType } from './dto/cost-log-query.schema';

@ApiTags('Cost Logs')
@ApiBearerAuth()
@Controller('cost-logs')
@UseGuards(JwtGuard)
export class UserCostLogsController {
  constructor(private readonly costLogsService: CostLogsService) {}

  @Get()
  @ApiOperation({ summary: "List the current user's cost logs (paginated, filterable)" })
  @ApiResponse({ status: 200, description: 'Paginated cost log list scoped to the current user' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'operation_type', required: false, enum: CostOperationType })
  @ApiQuery({ name: 'provider', required: false, enum: IntegrationType })
  @ApiQuery({ name: 'date_from', required: false, type: String })
  @ApiQuery({ name: 'date_to', required: false, type: String })
  findAll(
    @Query(new ZodValidationPipe(UserCostLogQuerySchema)) query: UserCostLogQueryType,
    @CurrentUser('id') userId: string,
  ) {
    return this.costLogsService.findAllForUser(userId, query);
  }
}
