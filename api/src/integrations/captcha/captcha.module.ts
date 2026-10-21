import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/databases/prisma/prisma.module';
import { CaptchaConfig } from './config/captcha.config';
import { CaptchaClientService } from './services/captcha-client.service';
import { CaptchaSolverService } from './services/captcha-solver.service';
import { PageCaptchaSolverService } from './services/page-captcha-solver.service';

@Module({
  imports: [PrismaModule],
  providers: [
    CaptchaConfig,
    CaptchaClientService,
    CaptchaSolverService,
    PageCaptchaSolverService,
  ],
  exports: [CaptchaConfig, CaptchaSolverService, PageCaptchaSolverService],
})
export class CaptchaModule {}
