import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from '@/shared/guards/jwt.guard';
import { RolesGuard } from '@/shared/guards/roles.guard';
import { Roles } from '@/shared/decorators/roles.decorator';
import { ZodValidationPipe } from '@/shared/pipes/zod.validation.pipe';
import { UsersService } from './users.service';
import { UserQuerySchema, UserQueryType } from './dto/user-query.schema';
import { User } from './entities/user.entity';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('admin/users')
@UseGuards(JwtGuard, RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
export class AdminUsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List users (paginated, searchable, filterable by role)' })
  @ApiResponse({ status: 200, description: 'Paginated user list' })
  findAll(@Query(new ZodValidationPipe(UserQuerySchema)) query: UserQueryType) {
    return this.usersService.findAllAdmin(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user with tracked agencies, saved properties, and integrations' })
  @ApiResponse({ status: 200, type: User })
  @ApiResponse({ status: 404, description: 'User not found' })
  findOne(@Param('id') id: string) {
    return this.usersService.findOneAdmin(id);
  }
}
