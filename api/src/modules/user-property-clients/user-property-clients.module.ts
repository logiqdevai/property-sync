import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/databases/prisma/prisma.module';
import { UserPropertyClientsController } from './user-property-clients.controller';
import { UserPropertyClientsService } from './user-property-clients.service';

@Module({
  imports: [PrismaModule],
  controllers: [UserPropertyClientsController],
  providers: [UserPropertyClientsService],
})
export class UserPropertyClientsModule {}
