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
import { CurrentUser } from '@/shared/decorators/current-user.decorator';
import { UserIntegrationsService } from './user-integrations.service';
import {
  CreateUserIntegrationDto,
  UpdateUserIntegrationDto,
  UpdateUserIntegrationStatusDto,
} from './dto/user-integration.dto';
import {
  AvailableIntegrationTargetEntity,
  UserIntegrationConnectionEntity,
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
  @ApiOperation({ summary: 'List visible integration targets for the current user' })
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
  createConnection(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateUserIntegrationDto,
  ) {
    return this.userIntegrationsService.createConnection(userId, dto);
  }

  @Patch('connections/:id')
  @ApiOperation({ summary: 'Update an integration connection' })
  @ApiResponse({ status: 200, type: UserIntegrationConnectionEntity })
  updateConnection(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateUserIntegrationDto,
  ) {
    return this.userIntegrationsService.updateConnection(userId, id, dto);
  }

  @Patch('connections/:id/status')
  @ApiOperation({ summary: 'Enable or disable an integration connection' })
  @ApiResponse({ status: 200, type: UserIntegrationConnectionEntity })
  updateConnectionStatus(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateUserIntegrationStatusDto,
  ) {
    return this.userIntegrationsService.updateConnectionStatus(
      userId,
      id,
      dto.is_active,
    );
  }

  @Delete('connections/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Disconnect an integration' })
  @ApiResponse({ status: 204, description: 'Deleted' })
  async deleteConnection(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    await this.userIntegrationsService.deleteConnection(userId, id);
  }
}
