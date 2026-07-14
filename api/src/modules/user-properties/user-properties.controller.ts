import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from '@/shared/guards/jwt.guard';
import { CurrentUser } from '@/shared/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/shared/pipes/zod.validation.pipe';
import { UserPropertiesService } from './user-properties.service';
import { UpdateUserPropertyDto } from './dto/update-user-property.dto';
import {
  UserPropertyQuerySchema,
  UserPropertyQueryType,
} from './dto/user-property-query.schema';
import { UserPropertyEntity } from './entities/user-property.entity';

@ApiTags('User Properties')
@ApiBearerAuth()
@Controller('properties')
@UseGuards(JwtGuard)
export class UserPropertiesController {
  constructor(private readonly userPropertiesService: UserPropertiesService) {}

  @Get()
  @ApiOperation({ summary: 'List the current user saved properties' })
  findAll(
    @CurrentUser('id') userId: string,
    @Query(new ZodValidationPipe(UserPropertyQuerySchema))
    query: UserPropertyQueryType,
  ) {
    return this.userPropertiesService.findAll(userId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one saved property with canonical history' })
  @ApiResponse({ status: 200, type: UserPropertyEntity })
  findOne(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.userPropertiesService.findOne(userId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a saved property copy' })
  update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateUserPropertyDto,
  ) {
    return this.userPropertiesService.update(userId, id, dto);
  }

  @Post(':id/resync')
  @ApiOperation({ summary: 'Overwrite local edits from canonical property' })
  resync(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.userPropertiesService.resync(userId, id);
  }
}
