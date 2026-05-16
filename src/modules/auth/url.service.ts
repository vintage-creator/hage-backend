// src/modules/auth/url.service.ts
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class UrlService {
	constructor(private readonly cfg: ConfigService) {}

	private normalizeBase() {
		return (this.cfg.get("APP_URL") ?? "http://localhost:3000").replace(/\/+$/, "");
	}

	/**
	 * Public site origin for email links (verify / reset).
	 * Prefers FRONTEND_URL; never appends API_PREFIX.
	 * Strips a trailing /api segment when APP_URL was mis-set to the API path.
	 */
	private normalizePublicBase() {
		const raw =
			this.cfg.get<string>("FRONTEND_URL")?.trim() ||
			this.cfg.get<string>("APP_URL")?.trim() ||
			"http://localhost:3000";
		return raw.replace(/\/api\/?$/i, "").replace(/\/+$/, "");
	}

	normalizePrefix() {
		const apiPrefix = (this.cfg.get("API_PREFIX") ?? "").replace(/\/+$/, "");
		return apiPrefix ? (apiPrefix.startsWith("/") ? apiPrefix : `/${apiPrefix}`) : "";
	}

	private appPage(path: string, token?: string) {
		const base = this.normalizePublicBase();
		const p = path.startsWith("/") ? path.slice(1) : path;
		const q = token ? `?token=${encodeURIComponent(token)}` : "";
		return `${base}/${p}${q}`;
	}

	build(path: string, token?: string) {
		const base = this.normalizeBase();
		const prefix = this.normalizePrefix();
		const p = path.startsWith("/") ? path.slice(1) : path;
		const q = token ? `?token=${encodeURIComponent(token)}` : "";
		return `${base}${prefix}/${p}${q}`;
	}

	verificationUrl(token: string) {
		return this.appPage("verify-email", token);
	}

	resetUrl(token: string) {
		return this.appPage("reset-password", token);
	}
}
export default UrlService;
