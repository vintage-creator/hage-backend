import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import fs from "fs";
import path from "path";
import Handlebars from "handlebars";
import mjml2html from "mjml";
import juice from "juice";
import nodemailer, { Transporter } from "nodemailer";

@Injectable()
export class MailService {
  private transporter: Transporter;
  private logger = new Logger(MailService.name);
  private templatesDir: string;

  /** App Runner injects into `process.env`; ConfigService usually matches, but keep a fallback. */
  private mailEnv(name: string): string | undefined {
    const raw = this.cfg.get<string>(name) ?? process.env[name];
    if (raw === undefined || raw === null) return undefined;
    const s = String(raw).trim();
    return s.length ? s : undefined;
  }

  constructor(private cfg: ConfigService) {
    this.templatesDir = this.findTemplatesDir();
    this.logger.log(`Using templates directory: ${this.templatesDir}`);

    const host = this.mailEnv("MAIL_HOST");
    const port = Number(this.mailEnv("MAIL_PORT") ?? "587");
    const user = this.mailEnv("MAIL_USER");
    const pass = this.mailEnv("MAIL_PASS");

    if (!host || !user || !pass) {
      this.logger.warn(
        "Mailtrap SMTP config missing. Set MAIL_HOST, MAIL_PORT, MAIL_USER and MAIL_PASS."
      );
    }

    this.transporter = nodemailer.createTransport({
      host: host ?? "live.smtp.mailtrap.io",
      port,
      secure: port === 465,
      auth: {
        user: user ?? "",
        pass: pass ?? "",
      },
      requireTLS: port !== 465,
    });

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
        this.logger.log(
          `Found templates directory with files: ${files.join(", ")}`
        );
        return dirPath;
      }
    }

    throw new Error(
      `Could not find templates directory. Checked: ${possiblePaths.join(", ")}`
    );
  }

  private async testConnection() {
    const host = this.mailEnv("MAIL_HOST");
    const user = this.mailEnv("MAIL_USER");
    const pass = this.mailEnv("MAIL_PASS");

    if (!host || !user || !pass) {
      this.logger.error(
        "Mailtrap SMTP credentials missing. Emails will fail until configured."
      );
      return;
    }

    try {
      await this.transporter.verify();
      this.logger.log(
        "Mailtrap SMTP configured successfully. SMTP connection verified."
      );
    } catch (error: any) {
      this.logger.error(
        `Mailtrap SMTP verification failed: ${error?.message ?? error}`
      );
    }
  }

  private loadTemplate(templateName: string) {
    try {
      const mjmlPath = path.join(this.templatesDir, `${templateName}.mjml`);
      const txtPath = path.join(
        this.templatesDir,
        "text",
        `${templateName}.txt.hbs`
      );

      this.logger.log(`Loading MJML from: ${mjmlPath}`);
      this.logger.log(`Loading text template from: ${txtPath}`);

      if (!fs.existsSync(mjmlPath)) {
        throw new Error(`MJML template not found: ${mjmlPath}`);
      }

      const mjmlSource = fs.readFileSync(mjmlPath, "utf8");
      const txtSource = fs.existsSync(txtPath)
        ? fs.readFileSync(txtPath, "utf8")
        : "";

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
        logoUrl:
          this.cfg.get("APP_LOGO") ?? `${this.cfg.get("APP_URL")}/logo.png`,
        supportText:
          this.cfg.get("SUPPORT_TEXT") ?? "Need help? Contact hello@tryhage.com",
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

      const text = txtSource
        ? this.compile(txtSource, fullCtx)
        : this.stripHtmlToText(inlined);

      const from = this.mailEnv("MAIL_FROM");

      if (!from) {
        throw new Error("MAIL_FROM is not configured");
      }

      const result = await this.transporter.sendMail({
        from,
        to,
        subject,
        html: inlined,
        text,
      });

      this.logger.verbose(
        `Email sent to ${to} via Mailtrap SMTP. messageId=${result.messageId}`
      );

      return result;
    } catch (err) {
      this.logger.error(
        `Failed to send email [template=${templateName}, to=${to}]: ${
          (err as any).message
        }`
      );
      throw err;
    }
  }

  private stripHtmlToText(html: string) {
    return html.replace(/<\/?[^>]+(>|$)/g, "").replace(/\s+/g, " ").trim();
  }

  async sendVerificationEmail(email: string, context: any) {
    const subject = `${this.cfg.get("APP_NAME")}: Verify your email`;
    return this.sendFromTemplate(email, subject, "verification", context);
  }

  async sendResetPasswordEmail(email: string, context: any) {
    const subject = `${this.cfg.get("APP_NAME")}: Reset your password`;
    return this.sendFromTemplate(email, subject, "reset-password", context);
  }

  async sendShipmentCreated(email: string, context: any) {
    const subject = `${this.cfg.get("APP_NAME")}: Shipment ${
      context.trackingNumber
    } created`;
    return this.sendFromTemplate(email, subject, "shipment-created", context);
  }

  async sendShipmentStatusUpdate(email: string, context: any) {
    const subject = `${this.cfg.get("APP_NAME")}: Shipment ${
      context.trackingNumber
    } status updated`;
    return this.sendFromTemplate(
      email,
      subject,
      "shipment-status-update",
      context
    );
  }

  async sendWaitlistAdminNotification(to: string, context: any) {
    const subject = `${this.cfg.get("APP_NAME")}: New Marketplace Waitlist Entry`;
    return this.sendFromTemplate(to, subject, "join-waitlist", context);
  }
}