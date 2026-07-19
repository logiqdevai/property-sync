import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PASSWORD_RESET_PURPOSE } from '@/modules/auth/constants/password-reset.constants';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get('JWT_SECRET'),
    });
  }

  async validate(payload: { id: string; purpose?: string }) {
    if (payload.purpose === PASSWORD_RESET_PURPOSE) {
      throw new UnauthorizedException('Invalid token');
    }

    if (payload.id) {
      return payload;
    }

    throw new Error('Invalid token');
  }
}
