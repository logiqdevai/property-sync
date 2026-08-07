import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
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
import { CurrentUser } from '@/shared/decorators/current-user.decorator';
import { AuthRole } from 'generated/prisma';
import { UserIntegrationsService } from './user-integrations.service';
import {
  CreateUserIntegrationDto,
  UpdateUserIntegrationDto,
  UpdateUserIntegrationDefaultDto,
  UpdateUserIntegrationStatusDto,
} from './dto/user-integration.dto';
import { UpdateUserIntegrationSettingsDto } from './dto/user-integration-settings.dto';
import {
  AvailableIntegrationTargetEntity,
  UserIntegrationConnectionEntity,
  UserIntegrationSecretsEntity,
  UserIntegrationSettingsEntity,
} from './entities/user-integration-connection.entity';

@ApiTags('Integrations')
@ApiBearerAuth()
@Controller('integrations')
@UseGuards(JwtGuard)
export class UserIntegrationsController {
  constructor(
    private readonly userIntegrationsService: UserIntegrationsService,
  ) {}

  @Get('targets')
  @ApiOperation({
    summary: 'List visible integration targets for the current user',
  })
  @ApiResponse({ status: 200, type: [AvailableIntegrationTargetEntity] })
  findVisibleTargets(@CurrentUser('id') userId: string) {
    return this.userIntegrationsService.findVisibleTargets(userId);
  }

  @Get('connections')
  @ApiOperation({ summary: 'List current user integration connections' })
  @ApiResponse({ status: 200, type: [UserIntegrationConnectionEntity] })
  findConnections(@CurrentUser('id') userId: string) {
    return this.userIntegrationsService.findUserConnections(userId);
  }

  @Post('connections')
  @ApiOperation({ summary: 'Connect to an integration target' })
  @ApiResponse({ status: 201, type: UserIntegrationConnectionEntity })
  @ApiResponse({ status: 404, description: 'Integration target not found' })
  @ApiResponse({ status: 409, description: 'Connection already exists' })
  createConnection(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: AuthRole,
    @Body() dto: CreateUserIntegrationDto,
  ) {
    return this.userIntegrationsService.createConnection(userId, role, dto);
  }

  @Patch('connections/:id')
  @ApiOperation({ summary: 'Update an integration connection' })
  @ApiResponse({ status: 200, type: UserIntegrationConnectionEntity })
  @ApiResponse({ status: 404, description: 'Connection not found' })
  updateConnection(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: AuthRole,
    @Param('id') id: string,
    @Body() dto: UpdateUserIntegrationDto,
  ) {
    return this.userIntegrationsService.updateConnection(userId, role, id, dto);
  }

  @Patch('connections/:id/status')
  @ApiOperation({ summary: 'Enable or disable an integration connection' })
  @ApiResponse({ status: 200, type: UserIntegrationConnectionEntity })
  @ApiResponse({ status: 404, description: 'Connection not found' })
  updateConnectionStatus(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: AuthRole,
    @Param('id') id: string,
    @Body() dto: UpdateUserIntegrationStatusDto,
  ) {
    return this.userIntegrationsService.updateConnectionStatus(
      userId,
      role,
      id,
      dto.is_active,
    );
  }

  @Patch('connections/:id/default')
  @UseGuards(RolesGuard)
  @Roles(AuthRole.ADMIN)
  @ApiOperation({ summary: 'Set or clear the default integration connection' })
  @ApiResponse({ status: 200, type: UserIntegrationConnectionEntity })
  @ApiResponse({ status: 403, description: 'Admin only' })
  @ApiResponse({ status: 404, description: 'Connection not found' })
  updateConnectionDefault(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: AuthRole,
    @Param('id') id: string,
    @Body() dto: UpdateUserIntegrationDefaultDto,
  ) {
    return this.userIntegrationsService.updateConnectionDefault(
      userId,
      role,
      id,
      dto.is_default,
    );
  }

  @Get('targets/:targetId/settings')
  @ApiOperation({
    summary:
      'Get the shared configuration for the current user\'s connection to an integration target',
  })
  @ApiResponse({ status: 200, type: UserIntegrationSettingsEntity })
  @ApiResponse({ status: 404, description: 'Integration target not found' })
  getSettings(
    @CurrentUser('id') userId: string,
    @Param('targetId') targetId: string,
  ) {
    return this.userIntegrationsService.getSettings(userId, targetId);
  }

  @Patch('targets/:targetId/settings')
  @ApiOperation({
    summary:
      'Update the shared configuration for the current user\'s connection to an integration target',
  })
  @ApiResponse({ status: 200, type: UserIntegrationSettingsEntity })
  @ApiResponse({ status: 404, description: 'Integration target not found' })
  updateSettings(
    @CurrentUser('id') userId: string,
    @Param('targetId') targetId: string,
    @Body() dto: UpdateUserIntegrationSettingsDto,
  ) {
    return this.userIntegrationsService.updateSettings(userId, targetId, dto);
  }

  @Get('connections/:id/secrets')
  @UseGuards(RolesGuard)
  @Roles(AuthRole.ADMIN)
  @ApiOperation({
    summary: 'Reveal plaintext secrets for an integration connection (admin)',
  })
  @ApiResponse({ status: 200, type: UserIntegrationSecretsEntity })
  @ApiResponse({ status: 403, description: 'Admin only' })
  @ApiResponse({ status: 404, description: 'Connection not found' })
  revealConnectionSecrets(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: AuthRole,
    @Param('id') id: string,
  ) {
    return this.userIntegrationsService.revealConnectionSecrets(
      userId,
      role,
      id,
    );
  }

  @Delete('connections/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Disconnect an integration' })
  @ApiResponse({ status: 204, description: 'Deleted' })
  @ApiResponse({ status: 404, description: 'Connection not found' })
  async deleteConnection(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: AuthRole,
    @Param('id') id: string,
  ) {
    await this.userIntegrationsService.deleteConnection(userId, role, id);
  }
}
