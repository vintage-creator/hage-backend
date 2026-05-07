import { Injectable, Logger } from "@nestjs/common";
import { Resend } from "resend";
import { ConfigService } from "@nestjs/config";
import fs from "fs";
import path from "path";
import Handlebars from "handlebars";
import mjml2html from "mjml";
import juice from "juice";

@Injectable()
export class MailService {
  private resend: Resend | null = null;
  private logger = new Logger(MailService.name);
  private templatesDir: string;

  constructor(private cfg: ConfigService) {
    this.templatesDir = this.findTemplatesDir();
    this.logger.log(`Using templates directory: ${this.templatesDir}`);

    const apiKey = this.cfg.get<string>("RESEND_API_KEY");
    if (!apiKey) {
      this.logger.warn("RESEND_API_KEY not set — emails will fail until configured");
      this.resend = null;
    } else {
      this.resend = new Resend(apiKey);
    }

    this.testConnection();
  }

  private findTemplatesDir(): string {
    const possiblePaths = [
      path.join(process.cwd(), "src", "common", "mail", "templates"),
      path.join(process.cwd(), "dist", "common", "mail", "templates"),
      path.join(__dirname, "templates"),
      path.join(process.cwd(), "common", "mail", "templates"),
    ];

    for (const dirPath of possiblePaths) {
      this.logger.log(`Checking for templates at: ${dirPath}`);
      if (fs.existsSync(dirPath)) {
        const files = fs.readdirSync(dirPath);
        this.logger.log(`Found templates directory with files: ${files.join(", ")}`);
        return dirPath;
      }
    }

    throw new Error(
      `Could not find templates directory. Checked: ${possiblePaths.join(", ")}`
    );
  }

  private testConnection() {
    const apiKey = this.cfg.get<string>("RESEND_API_KEY");
    if (!apiKey) {
      this.logger.error("Resend API key missing (RESEND_API_KEY). Set it in environment.");
    } else {
      // We don't send a test email automatically to avoid spamming.
      this.logger.log("Resend configured (RESEND_API_KEY present). Verify sending domain in Resend dashboard.");
    }
  }

  private loadTemplate(templateName: string) {
    try {
      const mjmlPath = path.join(this.templatesDir, `${templateName}.mjml`);
      const txtPath = path.join(this.templatesDir, "text", `${templateName}.txt.hbs`);

      this.logger.log(`Loading MJML from: ${mjmlPath}`);
      this.logger.log(`Loading text template from: ${txtPath}`);

      if (!fs.existsSync(mjmlPath)) {
        throw new Error(`MJML template not found: ${mjmlPath}`);
      }

      const mjmlSource = fs.readFileSync(mjmlPath, "utf8");
      const txtSource = fs.existsSync(txtPath) ? fs.readFileSync(txtPath, "utf8") : "";

      this.logger.log(`Successfully loaded template: ${templateName}`);
      return { mjmlSource, txtSource };
    } catch (err) {
      this.logger.error(
        `Failed loading email template "${templateName}": ${(err as any).message}`
      );
      throw err;
    }
  }

  private compile(templateSource: string, ctx: any) {
    const template = Handlebars.compile(templateSource);
    return template(ctx);
  }

  async sendFromTemplate(
    to: string,
    subject: string,
    templateName: string,
    context: any
  ) {
    try {
      const { mjmlSource, txtSource } = this.loadTemplate(templateName);

      const fullCtx = {
        year: new Date().getFullYear(),
        appName: this.cfg.get("APP_NAME") ?? "Hage Logistics",
        logoUrl: this.cfg.get("APP_LOGO") ?? `${this.cfg.get("APP_URL")}/logo.png`,
        supportText: this.cfg.get("SUPPORT_TEXT") ?? "Need help? Contact hello@tryhage.com",
        ...context,
      };

      const mjmlWithVars = this.compile(mjmlSource, fullCtx);

      const { html, errors } = mjml2html(mjmlWithVars, {
        validationLevel: "soft",
      });
      if (errors && errors.length) {
        this.logger.warn("MJML warnings: " + JSON.stringify(errors));
      }

      const inlined = juice(html);

      const text = txtSource ? this.compile(txtSource, fullCtx) : this.stripHtmlToText(inlined);

      const from = this.cfg.get("MAIL_FROM");
      if (!from) {
        throw new Error("MAIL_FROM is not configured");
      }

      if (!this.resend) {
        throw new Error("Email provider not configured (missing RESEND_API_KEY)");
      }

      // Send via Resend SDK
      const { data, error } = await this.resend.emails.send({
        from,
        to: [to],
        subject,
        html: inlined,
        text,
      });

      if (error) {
        this.logger.error(`Resend error sending email: ${JSON.stringify(error)}`);
        throw new Error(error?.message ?? "Unknown resend error");
      }

      this.logger.verbose(`Email sent to ${to} (id=${data?.id})`);
      return data;
    } catch (err) {
      this.logger.error(
        `Failed to send email [template=${templateName}, to=${to}]: ${(err as any).message}`
      );
      throw err;
    }
  }

  private stripHtmlToText(html: string) {
    return html.replace(/<\/?[^>]+(>|$)/g, "").replace(/\s+/g, " ").trim();
  }

  // convenience helpers
  async sendVerificationEmail(email: string, context: any) {
    const subject = `${this.cfg.get("APP_NAME")}: Verify your email`;
    return this.sendFromTemplate(email, subject, "verification", context);
  }

  async sendResetPasswordEmail(email: string, context: any) {
    const subject = `${this.cfg.get("APP_NAME")}: Reset your password`;
    return this.sendFromTemplate(email, subject, "reset-password", context);
  }

  async sendShipmentCreated(email: string, context: any) {
    const subject = `${this.cfg.get("APP_NAME")}: Shipment ${context.trackingNumber} created`;
    return this.sendFromTemplate(email, subject, "shipment-created", context);
  }

  async sendShipmentStatusUpdate(email: string, context: any) {
    const subject = `${this.cfg.get("APP_NAME")}: Shipment ${context.trackingNumber} status updated`;
    return this.sendFromTemplate(email, subject, "shipment-status-update", context);
  }

  async sendWaitlistAdminNotification(to: string, context: any) {
    const subject = `${this.cfg.get("APP_NAME")}: New Marketplace Waitlist Entry`;
    return this.sendFromTemplate(to, subject, "join-waitlist", context);
  }  
}
