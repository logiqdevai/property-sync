import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthRole } from 'generated/prisma';
import { JwtGuard } from '@/shared/guards/jwt.guard';
import { RolesGuard } from '@/shared/guards/roles.guard';
import { Roles } from '@/shared/decorators/roles.decorator';
import { ZodValidationPipe } from '@/shared/pipes/zod.validation.pipe';
import {
  EstateWebCreatePropertyPayload,
  EstateWebUpdatePropertyPayload,
} from '@/integrations/estateweb/interfaces/estateweb-property.interface';
import { AdminEstateWebPropertiesService } from './admin-estateweb-properties.service';
import { AdminEstateWebPropertyImageDto } from './dto/admin-estateweb-property-image.dto';
import {
  AdminEstateWebPropertyListQuerySchema,
  AdminEstateWebPropertyListQueryType,
} from './dto/admin-estateweb-property-list-query.schema';
import { SetEstateWebSessionDto } from './dto/admin-estateweb-session.dto';

@ApiTags('Admin EstateWeb')
@ApiBearerAuth()
@Controller('admin/estateweb')
@UseGuards(JwtGuard, RolesGuard)
@Roles(AuthRole.ADMIN)
export class AdminEstateWebPropertiesController {
  constructor(
    private readonly adminEstateWebPropertiesService: AdminEstateWebPropertiesService,
  ) {}

  @Get('integrations')
  @ApiOperation({ summary: 'List EstateWeb user integrations' })
  @ApiQuery({ name: 'userId', required: false, type: String })
  listIntegrations(@Query('userId') userId?: string) {
    return this.adminEstateWebPropertiesService.listIntegrations(userId);
  }

  @Get('integrations/:userIntegrationId/session')
  @ApiOperation({ summary: 'Get EstateWeb session status for an integration' })
  getSessionStatus(@Param('userIntegrationId') userIntegrationId: string) {
    return this.adminEstateWebPropertiesService.getSessionStatus(
      userIntegrationId,
    );
  }

  @Post('integrations/:userIntegrationId/session')
  @ApiOperation({
    summary: 'Set EstateWeb session cookie and bearer token for an integration',
  })
  @ApiResponse({ status: 200, description: 'Session stored' })
  setSession(
    @Param('userIntegrationId') userIntegrationId: string,
    @Body() dto: SetEstateWebSessionDto,
  ) {
    return this.adminEstateWebPropertiesService.setSession(
      userIntegrationId,
      dto,
    );
  }

  @Delete('integrations/:userIntegrationId/session')
  @ApiOperation({ summary: 'Invalidate stored EstateWeb session' })
  invalidateSession(@Param('userIntegrationId') userIntegrationId: string) {
    return this.adminEstateWebPropertiesService.invalidateSession(
      userIntegrationId,
    );
  }

  @Post('integrations/:userIntegrationId/session/test')
  @ApiOperation({
    summary: 'Test EstateWeb connection via stored email/password login',
  })
  testConnection(@Param('userIntegrationId') userIntegrationId: string) {
    return this.adminEstateWebPropertiesService.testConnection(
      userIntegrationId,
    );
  }

  @Get('catalog/fields')
  @ApiOperation({ summary: 'Get EstateWeb init field definitions' })
  getInitFields() {
    return this.adminEstateWebPropertiesService.getInitFields();
  }

  @Get('catalog/property-types')
  @ApiOperation({ summary: 'Get EstateWeb init property type tree' })
  getInitPropertyTypes() {
    return this.adminEstateWebPropertiesService.getInitPropertyTypes();
  }

  @Get('catalog/locations')
  @ApiOperation({
    summary: 'Get EstateWeb location catalog (id + human-readable path)',
  })
  @ApiResponse({ status: 200, description: 'EstateWeb location catalog' })
  getLocationCatalog() {
    return this.adminEstateWebPropertiesService.getLocationCatalog();
  }

  @Get('catalog/floors')
  @ApiOperation({ summary: 'Get EstateWeb floor option catalog' })
  getFloorCatalog() {
    return this.adminEstateWebPropertiesService.getFloorCatalog();
  }

  @Get('catalog/energy-classes')
  @ApiOperation({ summary: 'Get EstateWeb energy class option catalog' })
  getEnergyClassCatalog() {
    return this.adminEstateWebPropertiesService.getEnergyClassCatalog();
  }

  @Get('catalog/road-types')
  @ApiOperation({ summary: 'Get EstateWeb road type option catalog' })
  getRoadTypeCatalog() {
    return this.adminEstateWebPropertiesService.getRoadTypeCatalog();
  }

  @Get('catalog/listing-types')
  @ApiOperation({ summary: 'Get listing type catalog' })
  getListingTypeCatalog() {
    return this.adminEstateWebPropertiesService.getListingTypeCatalog();
  }

  @Get('catalog/estateweb-property-types')
  @ApiOperation({
    summary: 'Get EstateWeb property type catalog (id + human-readable path)',
  })
  getInitPropertyTypeCatalog() {
    return this.adminEstateWebPropertiesService.getInitPropertyTypeCatalog();
  }
  @Get('catalog/features')
  @ApiOperation({ summary: 'Get EstateWeb feature catalog' })
  getFeaturesCatalog() {
    return this.adminEstateWebPropertiesService.getFeaturesCatalog();
  }

  @Get('catalog/ai-fields')
  @ApiOperation({ summary: 'Get compact AI field catalog' })
  @ApiQuery({ name: 'propertyTypeId', required: false, type: Number })
  getAiFieldCatalog(@Query('propertyTypeId') propertyTypeId?: string) {
    const parsed =
      propertyTypeId !== undefined ? Number(propertyTypeId) : undefined;
    return this.adminEstateWebPropertiesService.getAiFieldCatalog(
      Number.isFinite(parsed) ? parsed : undefined,
    );
  }

  @Get('catalog/ai-property-types')
  @ApiOperation({ summary: 'Get compact AI property type catalog' })
  getAiPropertyTypeCatalog() {
    return this.adminEstateWebPropertiesService.getAiPropertyTypeCatalog();
  }

  @Get('integrations/:userIntegrationId/properties')
  @ApiOperation({ summary: 'List properties from EstateWeb CRM' })
  listProperties(
    @Param('userIntegrationId') userIntegrationId: string,
    @Query(new ZodValidationPipe(AdminEstateWebPropertyListQuerySchema))
    query: AdminEstateWebPropertyListQueryType,
  ) {
    return this.adminEstateWebPropertiesService.listProperties(
      userIntegrationId,
      query,
    );
  }

  @Get('integrations/:userIntegrationId/properties/:propertyId')
  @ApiOperation({ summary: 'Get a property from EstateWeb CRM' })
  getProperty(
    @Param('userIntegrationId') userIntegrationId: string,
    @Param('propertyId') propertyId: string,
  ) {
    return this.adminEstateWebPropertiesService.getProperty(
      userIntegrationId,
      propertyId,
    );
  }

  @Post('integrations/:userIntegrationId/properties')
  @ApiOperation({ summary: 'Create a property in EstateWeb CRM' })
  createProperty(
    @Param('userIntegrationId') userIntegrationId: string,
    @Body() payload: EstateWebCreatePropertyPayload,
  ) {
    return this.adminEstateWebPropertiesService.createProperty(
      userIntegrationId,
      payload,
    );
  }

  @Patch('integrations/:userIntegrationId/properties/:propertyId')
  @ApiOperation({ summary: 'Update a property in EstateWeb CRM' })
  updateProperty(
    @Param('userIntegrationId') userIntegrationId: string,
    @Param('propertyId') propertyId: string,
    @Body() payload: EstateWebUpdatePropertyPayload,
  ) {
    return this.adminEstateWebPropertiesService.updateProperty(
      userIntegrationId,
      propertyId,
      payload,
    );
  }

  @Post('integrations/:userIntegrationId/properties/:propertyId/images')
  @ApiOperation({ summary: 'Upload a property image to EstateWeb CRM' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'filename'],
      properties: {
        file: { type: 'string', format: 'binary' },
        filename: { type: 'string' },
        show_on_site: { type: 'integer', enum: [0, 1] },
        show_on_groups: { type: 'integer', enum: [0, 1] },
        show_on_foreign_agents: { type: 'integer', enum: [0, 1] },
        zindex: { type: 'integer' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  uploadPropertyImage(
    @Param('userIntegrationId') userIntegrationId: string,
    @Param('propertyId') propertyId: string,
    @UploadedFile()
    file: { buffer: Buffer; mimetype: string } | undefined,
    @Body() dto: AdminEstateWebPropertyImageDto,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Image file is required');
    }

    return this.adminEstateWebPropertiesService.uploadPropertyImage(
      userIntegrationId,
      propertyId,
      file.buffer,
      {
        filename: dto.filename,
        show_on_site: dto.show_on_site,
        show_on_groups: dto.show_on_groups,
        show_on_foreign_agents: dto.show_on_foreign_agents,
        zindex: dto.zindex,
      },
      file.mimetype,
    );
  }

  @Delete('integrations/:userIntegrationId/images/:imageId')
  @ApiOperation({ summary: 'Delete a property image from EstateWeb CRM' })
  @ApiResponse({ status: 200, description: 'Deleted image id' })
  deletePropertyImage(
    @Param('userIntegrationId') userIntegrationId: string,
    @Param('imageId') imageId: string,
  ) {
    return this.adminEstateWebPropertiesService.deletePropertyImage(
      userIntegrationId,
      imageId,
    );
  }
}
