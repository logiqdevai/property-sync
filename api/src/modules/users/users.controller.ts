import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtGuard } from '@/shared/guards/jwt.guard';
import { CurrentUser } from '@/shared/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';

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
}
