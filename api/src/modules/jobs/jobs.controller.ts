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
import { AuthRole, JobStatus } from 'generated/prisma';
import { ZodValidationPipe } from '@/shared/pipes/zod.validation.pipe';
import { JobsService } from './jobs.service';
import { JobLogQuerySchema, JobLogQueryType } from './dto/job-log-query.schema';
import { DeleteJobLogsDto } from './dto/delete-job-logs.dto';
import { JobLog } from './entities/job-log.entity';

@ApiTags('Jobs')
@ApiBearerAuth()
@Controller('admin/jobs')
@UseGuards(JwtGuard, RolesGuard)
@Roles(AuthRole.ADMIN, AuthRole.SUPPORT)
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get()
  @ApiOperation({ summary: 'List job logs (paginated, filterable)' })
  @ApiResponse({ status: 200, description: 'Paginated job log list' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: JobStatus })
  @ApiQuery({ name: 'queue_name', required: false, type: String })
  @ApiQuery({ name: 'date_from', required: false, type: String })
  @ApiQuery({ name: 'date_to', required: false, type: String })
  findAll(
    @Query(new ZodValidationPipe(JobLogQuerySchema)) query: JobLogQueryType,
  ) {
    return this.jobsService.findAll(query);
  }

  @Post('bulk-delete')
  @Roles(AuthRole.ADMIN)
  @ApiOperation({ summary: 'Delete multiple job logs' })
  @ApiResponse({ status: 200, description: 'Job logs deleted' })
  @ApiResponse({ status: 400, description: 'One or more jobs are active' })
  @ApiResponse({ status: 404, description: 'One or more job logs not found' })
  removeMany(@Body() dto: DeleteJobLogsDto) {
    return this.jobsService.removeMany(dto.job_ids);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one job log' })
  @ApiResponse({ status: 200, type: JobLog })
  @ApiResponse({ status: 404, description: 'Job log not found' })
  findOne(@Param('id') id: string) {
    return this.jobsService.findOne(id);
  }

  @Post(':id/retry')
  @Roles(AuthRole.ADMIN)
  @ApiOperation({ summary: 'Retry a failed or completed job' })
  @ApiResponse({ status: 200, type: JobLog })
  @ApiResponse({ status: 404, description: 'Job log not found' })
  retry(@Param('id') id: string) {
    return this.jobsService.retry(id);
  }

  @Post(':id/stop')
  @Roles(AuthRole.ADMIN)
  @ApiOperation({ summary: 'Stop a queued or running job' })
  @ApiResponse({ status: 200, type: JobLog })
  @ApiResponse({ status: 400, description: 'Job is not stoppable' })
  @ApiResponse({ status: 404, description: 'Job log not found' })
  stop(@Param('id') id: string) {
    return this.jobsService.stop(id);
  }

  @Delete(':id')
  @Roles(AuthRole.ADMIN)
  @ApiOperation({ summary: 'Delete a job log' })
  @ApiResponse({ status: 200, description: 'Deleted' })
  @ApiResponse({ status: 400, description: 'Job is still active' })
  @ApiResponse({ status: 404, description: 'Job log not found' })
  remove(@Param('id') id: string) {
    return this.jobsService.remove(id);
  }
}
