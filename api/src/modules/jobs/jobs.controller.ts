import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtGuard } from '@/shared/guards/jwt.guard';
import { RolesGuard } from '@/shared/guards/roles.guard';
import { Roles } from '@/shared/decorators/roles.decorator';
import { ZodValidationPipe } from '@/shared/pipes/zod.validation.pipe';
import { JobsService } from './jobs.service';
import {
  JobLogQuerySchema,
  JobLogQueryType,
} from './dto/job-log-query.schema';
import { JobLog } from './entities/job-log.entity';

@ApiTags('Jobs')
@ApiBearerAuth()
@Controller('admin/jobs')
@UseGuards(JwtGuard, RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get()
  @ApiOperation({ summary: 'List job logs (paginated, filterable)' })
  @ApiResponse({ status: 200, description: 'Paginated job log list' })
  findAll(
    @Query(new ZodValidationPipe(JobLogQuerySchema)) query: JobLogQueryType,
  ) {
    return this.jobsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one job log' })
  @ApiResponse({ status: 200, type: JobLog })
  @ApiResponse({ status: 404, description: 'Job log not found' })
  findOne(@Param('id') id: string) {
    return this.jobsService.findOne(id);
  }

  @Post(':id/retry')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Retry a failed or completed job' })
  @ApiResponse({ status: 200, type: JobLog })
  @ApiResponse({ status: 404, description: 'Job log not found' })
  retry(@Param('id') id: string) {
    return this.jobsService.retry(id);
  }
}
