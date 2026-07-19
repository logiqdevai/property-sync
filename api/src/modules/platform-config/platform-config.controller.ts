import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtGuard } from '@/shared/guards/jwt.guard';
import { RolesGuard } from '@/shared/guards/roles.guard';
import { Roles } from '@/shared/decorators/roles.decorator';
import { AuthRole } from 'generated/prisma';
import { PlatformConfigService } from './platform-config.service';
import { UpdatePlatformConfigDto } from './dto/update-platform-config.dto';
import { PlatformConfig } from './entities/platform-config.entity';

@ApiTags('Platform Config')
@ApiBearerAuth()
@Controller('admin/platform-config')
@UseGuards(JwtGuard, RolesGuard)
@Roles(AuthRole.ADMIN, AuthRole.SUPPORT)
export class PlatformConfigController {
  constructor(private readonly platformConfigService: PlatformConfigService) {}

  @Get()
  @ApiOperation({
    summary: 'Get platform config (null fields fall back to defaults)',
  })
  @ApiResponse({ status: 200, type: PlatformConfig })
  findOne() {
    return this.platformConfigService.getRaw();
  }

  @Patch()
  @Roles(AuthRole.ADMIN)
  @ApiOperation({ summary: 'Update platform config' })
  @ApiResponse({ status: 200, type: PlatformConfig })
  update(@Body() dto: UpdatePlatformConfigDto) {
    return this.platformConfigService.update(dto);
  }
}
