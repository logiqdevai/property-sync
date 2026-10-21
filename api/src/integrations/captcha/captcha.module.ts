import { Module } from '@nestjs/common';
import { CaptchaConfig } from './config/captcha.config';
import { CaptchaClientService } from './services/captcha-client.service';
import { CaptchaSolverService } from './services/captcha-solver.service';

@Module({
  providers: [CaptchaConfig, CaptchaClientService, CaptchaSolverService],
  exports: [CaptchaConfig, CaptchaSolverService],
})
export class CaptchaModule {}
