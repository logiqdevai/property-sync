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
import { AuthRole, AuthType, IntegrationType } from 'generated/prisma';
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
@Roles(AuthRole.ADMIN, AuthRole.SUPPORT)
export class IntegrationTargetsController {
  constructor(
    private readonly integrationTargetsService: IntegrationTargetsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List integration targets' })
  @ApiResponse({ status: 200, description: 'Paginated integration targets' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'integration_type', required: false, enum: IntegrationType })
  @ApiQuery({ name: 'auth_type', required: false, enum: AuthType })
  @ApiQuery({ name: 'is_visible', required: false, enum: ['true', 'false'] })
  @ApiQuery({ name: 'is_enabled', required: false, enum: ['true', 'false'] })
  findAll(
    @Query(new ZodValidationPipe(IntegrationTargetQuerySchema))
    query: IntegrationTargetQueryType,
  ) {
    return this.integrationTargetsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get integration target with connected accounts' })
  @ApiResponse({ status: 200, type: IntegrationTarget })
  @ApiResponse({ status: 404, description: 'Integration target not found' })
  findOne(@Param('id') id: string) {
    return this.integrationTargetsService.findOne(id);
  }

  @Post()
  @Roles(AuthRole.ADMIN)
  @ApiOperation({ summary: 'Create an integration target' })
  @ApiResponse({ status: 201, type: IntegrationTarget })
  create(@Body() dto: CreateIntegrationTargetDto) {
    return this.integrationTargetsService.create(dto);
  }

  @Patch(':id')
  @Roles(AuthRole.ADMIN)
  @ApiOperation({ summary: 'Update an integration target' })
  @ApiResponse({ status: 200, type: IntegrationTarget })
  update(@Param('id') id: string, @Body() dto: UpdateIntegrationTargetDto) {
    return this.integrationTargetsService.update(id, dto);
  }

  @Patch(':id/visibility')
  @Roles(AuthRole.ADMIN)
  @ApiOperation({ summary: 'Toggle integration target visibility' })
  @ApiResponse({ status: 200, type: IntegrationTarget })
  updateVisibility(
    @Param('id') id: string,
    @Body() dto: UpdateIntegrationTargetVisibilityDto,
  ) {
    return this.integrationTargetsService.updateVisibility(id, dto);
  }

  @Post(':id/accounts')
  @Roles(AuthRole.ADMIN)
  @ApiOperation({ summary: 'Create a user connection on behalf of a user' })
  @ApiResponse({ status: 201, type: MaskedUserIntegrationEntity })
  createAccount(
    @Param('id') id: string,
    @Body() dto: CreateUserIntegrationAccountDto,
  ) {
    return this.integrationTargetsService.createAccount(id, dto);
  }

  @Patch(':id/accounts/:userIntegrationId')
  @Roles(AuthRole.ADMIN)
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
  @Roles(AuthRole.ADMIN)
  @ApiOperation({ summary: 'Delete an integration target without connections' })
  @ApiResponse({ status: 200, description: 'Deleted' })
  @ApiResponse({ status: 404, description: 'Integration target not found' })
  @ApiResponse({ status: 409, description: 'Target still has connections' })
  remove(@Param('id') id: string) {
    return this.integrationTargetsService.remove(id);
  }
}
