import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from '@/shared/guards/jwt.guard';
import { CurrentUser } from '@/shared/decorators/current-user.decorator';
import { Audited } from '@/modules/activity-logs/decorators/audited.decorator';
import { UserPropertyClientsService } from './user-property-clients.service';
import {
  AcknowledgeDelistedClientsDto,
  CreateUserPropertyClientDto,
  UpdateUserPropertyClientDto,
} from './dto/user-property-client.dto';

@ApiTags('User Property Clients')
@ApiBearerAuth()
@Controller('property-clients')
@UseGuards(JwtGuard)
export class UserPropertyClientsController {
  constructor(private readonly service: UserPropertyClientsService) {}

  @Get('known')
  @ApiOperation({ summary: 'Distinct clients already recorded on any property' })
  listKnown(@CurrentUser('id') userId: string) {
    return this.service.listKnownClients(userId);
  }

  @Get('delisted-alerts')
  @ApiOperation({
    summary: 'Delisted properties that have clients and are not yet acknowledged',
  })
  listDelistedAlerts(@CurrentUser('id') userId: string) {
    return this.service.listDelistedAlerts(userId);
  }

  @Audited({
    action: 'user_property_client.acknowledge_delisted',
    entity: 'UserPropertyClient',
    ids: { body: 'user_property_ids' },
  })
  @Post('delisted-alerts/acknowledge')
  @ApiOperation({ summary: 'Dismiss delisted-property alerts' })
  acknowledge(
    @CurrentUser('id') userId: string,
    @Body() dto: AcknowledgeDelistedClientsDto,
  ) {
    return this.service.acknowledgeDelisted(userId, dto.user_property_ids);
  }

  @Get('property/:userPropertyId')
  @ApiOperation({ summary: 'Clients a property was shown to' })
  list(
    @CurrentUser('id') userId: string,
    @Param('userPropertyId') userPropertyId: string,
  ) {
    return this.service.list(userId, userPropertyId);
  }

  @Audited({
    action: 'user_property_client.create',
    entity: 'UserPropertyClient',
    ids: { param: 'userPropertyId' },
  })
  @Post('property/:userPropertyId')
  @ApiOperation({ summary: 'Add a client the property was shown to' })
  create(
    @CurrentUser('id') userId: string,
    @Param('userPropertyId') userPropertyId: string,
    @Body() dto: CreateUserPropertyClientDto,
  ) {
    return this.service.create(userId, userPropertyId, dto);
  }

  @Audited({
    action: 'user_property_client.update',
    entity: 'UserPropertyClient',
    ids: { param: 'id' },
  })
  @Patch(':id')
  @ApiOperation({ summary: 'Edit a client' })
  update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateUserPropertyClientDto,
  ) {
    return this.service.update(userId, id, dto);
  }

  @Audited({
    action: 'user_property_client.delete',
    entity: 'UserPropertyClient',
    ids: { param: 'id' },
  })
  @Delete(':id')
  @ApiOperation({ summary: 'Remove a client' })
  remove(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.service.remove(userId, id);
  }
}
