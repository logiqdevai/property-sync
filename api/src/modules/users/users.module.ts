import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/databases/prisma/prisma.module';
import { UsersController } from './users.controller';
import { AdminUsersController } from './admin-users.controller';
import { UsersService } from './users.service';

@Module({
    imports: [PrismaModule],
    controllers: [UsersController, AdminUsersController],
    providers: [UsersService],
    exports: [UsersService],
})
export class UsersModule { }
