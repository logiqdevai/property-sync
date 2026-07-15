import { Controller, Post, Body, Get } from '@nestjs/common';
import { MailService } from './mail.service';
import { CreateMailDto } from './dto/create-mail.dto';
import { Roles } from 'src/shared/decorators/roles.decorator';
import { UseGuards } from '@nestjs/common';
import { JwtGuard } from 'src/shared/guards/jwt.guard';
import { RolesGuard } from 'src/shared/guards/roles.guard';
import { AuthRole } from 'generated/prisma';

@Controller('mail')
@UseGuards(JwtGuard, RolesGuard)
@Roles(AuthRole.ADMIN)
export class MailController {
  constructor(private readonly mailService: MailService) { }

  @Post('send-email')
  create(@Body() createMailDto: CreateMailDto) {
    return this.mailService.create(createMailDto);
  }




}
