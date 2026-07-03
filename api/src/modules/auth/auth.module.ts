import { Logger, Module } from '@nestjs/common';
import { EmailAuthService } from './services/email.service';
import { EmailAuthController } from './controllers/email.controller';
import { PrismaModule } from '@/core/databases/prisma/prisma.module';
import { CreateJwtServiceModule } from '@/shared/utils/jwt/jwt.module';
import { JwtStrategy } from './strategies/jwt.strategy';
import { ResendModule } from '@/integrations/notifications/resend/resend.module';

@Module({
  imports: [
    PrismaModule,
    CreateJwtServiceModule,
    ResendModule,
  ],
  providers: [EmailAuthService, JwtStrategy, Logger],
  controllers: [EmailAuthController],
})
export class AuthModule { }
