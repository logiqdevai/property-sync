import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { InternalAiService } from './ai.service';
import { CreateAiDto } from './dto/create-ai.dto';
import { Roles } from '@/shared/decorators/roles.decorator';
import { JwtGuard } from '@/shared/guards/jwt.guard';
import { RolesGuard } from '@/shared/guards/roles.guard';
import { AuthRole } from 'generated/prisma';

@Controller('ai')
@UseGuards(JwtGuard, RolesGuard)
@Roles(AuthRole.ADMIN)
export class AiController {
  constructor(private readonly aiService: InternalAiService) { }

  @Post()
  create(@Body() createAiDto: CreateAiDto) {
    return this.aiService.create(createAiDto);
  }


}
