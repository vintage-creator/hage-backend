import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
   constructor(cfg: ConfigService) {
      const sessionsNeverExpire = ['never', 'none', 'false', '0'].includes((cfg.get<string>('JWT_EXPIRES_IN') ?? '').trim().toLowerCase());
      super({
         jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
         ignoreExpiration: sessionsNeverExpire,
         secretOrKey: cfg.get<string>('JWT_SECRET') || 'unsafe-dev-secret',
      });
   }

   async validate(payload: any) {
      // Include everything needed by RolesGuard and the app
      return {
         id: payload.sub,
         sub: payload.sub,
         email: payload.email,
         role: payload.role,
         kind: payload.kind,
      };
   }
}
