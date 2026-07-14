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
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtGuard } from '@/shared/guards/jwt.guard';
import { RolesGuard } from '@/shared/guards/roles.guard';
import { Roles } from '@/shared/decorators/roles.decorator';
import { ZodValidationPipe } from '@/shared/pipes/zod.validation.pipe';
import { IntegrationTargetsService } from './integration-targets.service';
import {
  CreateIntegrationTargetDto,
  CreateUserIntegrationAccountDto,
  UpdateIntegrationTargetDto,
  UpdateIntegrationTargetVisibilityDto,
  UpdateUserIntegrationAccountDto,
} from './dto/integration-target.dto';
import {
  IntegrationTargetQuerySchema,
  IntegrationTargetQueryType,
} from './dto/integration-target-query.schema';
import { IntegrationTarget } from './entities/integration-target.entity';
import { MaskedUserIntegrationEntity } from './entities/user-integration.entity';

@ApiTags('Integration Targets')
@ApiBearerAuth()
@Controller('admin/integration-targets')
@UseGuards(JwtGuard, RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
export class IntegrationTargetsController {
  constructor(
    private readonly integrationTargetsService: IntegrationTargetsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List integration targets' })
  @ApiResponse({ status: 200, description: 'Paginated integration targets' })
  findAll(
    @Query(new ZodValidationPipe(IntegrationTargetQuerySchema))
    query: IntegrationTargetQueryType,
  ) {
    return this.integrationTargetsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get integration target with connected accounts' })
  @ApiResponse({ status: 200, type: IntegrationTarget })
  findOne(@Param('id') id: string) {
    return this.integrationTargetsService.findOne(id);
  }

  @Post()
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Create an integration target' })
  @ApiResponse({ status: 201, type: IntegrationTarget })
  create(@Body() dto: CreateIntegrationTargetDto) {
    return this.integrationTargetsService.create(dto);
  }

  @Patch(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Update an integration target' })
  @ApiResponse({ status: 200, type: IntegrationTarget })
  update(@Param('id') id: string, @Body() dto: UpdateIntegrationTargetDto) {
    return this.integrationTargetsService.update(id, dto);
  }

  @Patch(':id/visibility')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Toggle integration target visibility' })
  @ApiResponse({ status: 200, type: IntegrationTarget })
  updateVisibility(
    @Param('id') id: string,
    @Body() dto: UpdateIntegrationTargetVisibilityDto,
  ) {
    return this.integrationTargetsService.updateVisibility(id, dto);
  }

  @Post(':id/accounts')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Create a user connection on behalf of a user' })
  @ApiResponse({ status: 201, type: MaskedUserIntegrationEntity })
  createAccount(
    @Param('id') id: string,
    @Body() dto: CreateUserIntegrationAccountDto,
  ) {
    return this.integrationTargetsService.createAccount(id, dto);
  }

  @Patch(':id/accounts/:userIntegrationId')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Update a user connection on behalf of a user' })
  @ApiResponse({ status: 200, type: MaskedUserIntegrationEntity })
  updateAccount(
    @Param('id') id: string,
    @Param('userIntegrationId') userIntegrationId: string,
    @Body() dto: UpdateUserIntegrationAccountDto,
  ) {
    return this.integrationTargetsService.updateAccount(id, userIntegrationId, dto);
  }

  @Delete(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Delete an integration target without connections' })
  @ApiResponse({ status: 200, description: 'Deleted' })
  remove(@Param('id') id: string) {
    return this.integrationTargetsService.remove(id);
  }
}
