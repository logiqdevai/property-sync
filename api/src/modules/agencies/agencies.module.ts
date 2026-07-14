import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/databases/prisma/prisma.module';
import { AgenciesController } from './agencies.controller';
import { AgenciesService } from './agencies.service';

@Module({
    imports: [PrismaModule],
    controllers: [AgenciesController],
    providers: [AgenciesService],
    exports: [AgenciesService],
})
export class AgenciesModule { }
