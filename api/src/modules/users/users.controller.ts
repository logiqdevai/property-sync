import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtGuard } from '@/shared/guards/jwt.guard';
import { CurrentUser } from '@/shared/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { UpdateMeDto } from './dto/update-me.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtGuard)
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    @Get('me')
    @ApiOperation({ summary: 'Get the currently authenticated user' })
    @ApiResponse({ status: 200, description: 'Current user', type: User })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async me(@CurrentUser('id') id: string) {
        return this.usersService.findById(id);
    }

    @Patch('me')
    @ApiOperation({ summary: 'Update the currently authenticated user profile' })
    @ApiResponse({ status: 200, description: 'Updated user', type: User })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async updateMe(@CurrentUser('id') id: string, @Body() dto: UpdateMeDto) {
        return this.usersService.updateMe(id, dto);
    }

    @Post('me/change-password')
    @ApiOperation({ summary: 'Change password for the currently authenticated user' })
    @ApiResponse({ status: 200, description: 'Password changed' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async changePassword(@CurrentUser('id') id: string, @Body() dto: ChangePasswordDto) {
        return this.usersService.changePassword(id, dto);
    }
}
