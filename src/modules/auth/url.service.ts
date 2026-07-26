// src/modules/auth/url.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class UrlService {
   constructor(private readonly cfg: ConfigService) {}

   private normalizeBase() {
      // Verification / reset links must open the FRONTEND app (which renders the
      // /verify-email and /reset-password pages), NOT the backend API. Using APP_URL
      // here sent users to the API host — and because `verify-email` is excluded from
      // the global `/api` prefix (see main.ts), an APP_URL ending in `/api` produced
      // `Cannot GET /api/verify-email` 404s. Fall back to APP_URL only for safety.
      const base =
         this.cfg.get('FRONTEND_URL') ?? this.cfg.get('APP_URL') ?? 'http://localhost:5173';
      return base.replace(/\/+$/, '');
   }

   normalizePrefix() {
      const apiPrefix = (this.cfg.get('API_PREFIX') ?? '').replace(/\/+$/, '');
      return apiPrefix ? (apiPrefix.startsWith('/') ? apiPrefix : `/${apiPrefix}`) : '';
   }

   build(path: string, token?: string) {
      const base = this.normalizeBase();
      const isExcluded = ['verify-email', 'reset-password'].includes(path);
      const prefix = isExcluded ? '' : this.normalizePrefix();
      const p = path.startsWith('/') ? path.slice(1) : path;
      const q = token ? `?token=${encodeURIComponent(token)}` : '';
      return `${base}/${p}${q}`;
   }

   verificationUrl(token: string) {
      return this.build('verify-email', token);
   }

   resetUrl(token: string) {
      return this.build('reset-password', token);
   }
}
export default UrlService;
