import { Body, Controller, Delete, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from '@/shared/guards/jwt.guard';
import { RolesGuard } from '@/shared/guards/roles.guard';
import { Roles } from '@/shared/decorators/roles.decorator';
import { CurrentUser } from '@/shared/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/shared/pipes/zod.validation.pipe';
import { UsersService } from './users.service';
import { UserQuerySchema, UserQueryType } from './dto/user-query.schema';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';
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

  @Patch(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Update a user' })
  @ApiResponse({ status: 200, type: User })
  @ApiResponse({ status: 403, description: 'Cannot modify your own role' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 409, description: 'Email or phone already in use' })
  update(
    @Param('id') id: string,
    @CurrentUser('id') actorId: string,
    @Body() dto: UpdateAdminUserDto,
  ) {
    return this.usersService.updateAdmin(id, actorId, dto);
  }

  @Delete(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Delete a user' })
  @ApiResponse({ status: 200, description: 'User deleted' })
  @ApiResponse({ status: 403, description: 'Cannot delete your own account or a super admin account' })
  @ApiResponse({ status: 404, description: 'User not found' })
  remove(@Param('id') id: string, @CurrentUser('id') actorId: string) {
    return this.usersService.deleteAdmin(id, actorId);
  }
}
