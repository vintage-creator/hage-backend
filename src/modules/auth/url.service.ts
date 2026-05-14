// src/modules/auth/url.service.ts
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class UrlService {
	constructor(private readonly cfg: ConfigService) {}

	private normalizeBase() {
		return (this.cfg.get("APP_URL") ?? "http://localhost:3000").replace(/\/+$/, "");
	}

	normalizePrefix() {
		const apiPrefix = (this.cfg.get("API_PREFIX") ?? "").replace(/\/+$/, "");
		return apiPrefix ? (apiPrefix.startsWith("/") ? apiPrefix : `/${apiPrefix}`) : "";
	}

	/** Email links (verify / reset) are pages on APP_URL, not under API_PREFIX. */
	private appPage(path: string, token?: string) {
		const base = this.normalizeBase();
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
