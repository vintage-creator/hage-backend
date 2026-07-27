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
      // the global `/api` prefix (see main.ts), a base ending in `/api` produced
      // `Cannot GET /api/verify-email` 404s. Fall back to APP_URL only for safety.
      // Truthy fallback (not ??): an empty-string FRONTEND_URL (as set in some
      // environments) must fall through to APP_URL, otherwise the base is "" and
      // links become relative/broken.
      const base =
         this.cfg.get<string>('FRONTEND_URL')?.trim() || this.cfg.get<string>('APP_URL')?.trim() || 'http://localhost:5173';
      // Defensive: these are frontend page URLs, never under the API prefix. If the
      // configured origin is accidentally set to the API path (e.g.
      // https://tryhage.com/api), strip the trailing /api so we don't emit
      // /api/verify-email — which the app proxies to a non-existent backend route.
      return base.replace(/\/api\/?$/i, '').replace(/\/+$/, '');
   }

   normalizePrefix() {
      const apiPrefix = (this.cfg.get('API_PREFIX') ?? '').replace(/\/+$/, '');
      return apiPrefix ? (apiPrefix.startsWith('/') ? apiPrefix : `/${apiPrefix}`) : '';
   }

   build(path: string, token?: string) {
      // Frontend page links deliberately do NOT include the API prefix — these paths
      // (/verify-email, /reset-password) are excluded from it in main.ts.
      const base = this.normalizeBase();
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
