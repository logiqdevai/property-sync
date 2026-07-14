import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/databases/prisma/prisma.module';
import { ScrapersController } from './scrapers.controller';
import { ScrapersService } from './scrapers.service';

@Module({
  imports: [PrismaModule],
  controllers: [ScrapersController],
  providers: [ScrapersService],
  exports: [ScrapersService],
})
export class ScrapersModule {}
