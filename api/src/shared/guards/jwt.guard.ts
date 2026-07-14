import { UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { JsonWebTokenError } from 'jsonwebtoken';

export class JwtGuard extends AuthGuard('jwt') {
    constructor() {
        super();
    }

    handleRequest(err: any, user: any, info: any, context: any, status: any) {
        if (info instanceof JsonWebTokenError) {
            throw new UnauthorizedException({
                message: 'Invalid token',
                code: 'invalid_token',
            });
        }

        if (err || !user) {
            throw new UnauthorizedException({
                message: 'Authentication required',
                code: 'authentication_required',
            });
        }

        return super.handleRequest(err, user, info, context, status);
    }
}