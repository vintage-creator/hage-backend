// src/common/guards/jwt-auth.guard.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TokenExpiredError } from 'jsonwebtoken';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
   handleRequest(err: any, user: any, info: any) {
      if (info instanceof TokenExpiredError) {
         throw new UnauthorizedException('Token expired');
      }

      if (err || !user) {
         throw new UnauthorizedException(info?.message || 'Unauthorized');
      }

      return user;
   }
}
