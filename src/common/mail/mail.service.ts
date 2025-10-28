// src/common/mail/mail.service.ts
import { Injectable, Logger } from "@nestjs/common";
import nodemailer from "nodemailer";
import { ConfigService } from "@nestjs/config";
import fs from "fs";
import path from "path";
import Handlebars from "handlebars";
import mjml2html from "mjml";
import juice from "juice";

@Injectable()
export class MailService {
  private transporter;
  private logger = new Logger(MailService.name);
  private templatesDir = path.join(__dirname, "templates");

  constructor(private cfg: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: cfg.get("SMTP_HOST"),
      port: Number(cfg.get("SMTP_PORT") ?? 587),
      secure: cfg.get("SMTP_SECURE") === "true",
      auth: {
        user: cfg.get("SMTP_USER"),
        pass: cfg.get("SMTP_PASS"),
      },
    });
    this.transporter.verify((err, success) => {
      if (err) {
        this.logger.error("SMTP verify failed: " + (err.message ?? err));
      } else {
        this.logger.verbose("SMTP transporter verified and ready");
      }
    });
  }

  private loadTemplate(templateName: string) {
    try {
      const mjmlPath = path.join(this.templatesDir, `${templateName}.mjml`);
      const txtPath = path.join(
        this.templatesDir,
        "text",
        `${templateName}.txt.hbs`
      );
      const mjmlSource = fs.readFileSync(mjmlPath, "utf8");
      const txtSource = fs.existsSync(txtPath)
        ? fs.readFileSync(txtPath, "utf8")
        : "";
      return { mjmlSource, txtSource };
    } catch (err) {
      this.logger.error(
        `Failed loading email template "${templateName}": ${
          (err as any).message
        }`
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

      // build context with defaults
      const fullCtx = {
        year: new Date().getFullYear(),
        appName: this.cfg.get("APP_NAME") ?? "Hage Logistics",
        logoUrl:
          this.cfg.get("APP_LOGO") ?? `${this.cfg.get("APP_URL")}/logo.png`,
        supportText:
          this.cfg.get("SUPPORT_TEXT") ??
          "Need help? Contact hello@tryhage.com",
        ...context,
      };

      const mjmlWithVars = this.compile(mjmlSource, fullCtx);

      // convert to HTML
      const { html, errors } = mjml2html(mjmlWithVars, {
        validationLevel: "soft",
      });
      if (errors && errors.length) {
        this.logger.warn("MJML warnings: " + JSON.stringify(errors));
      }

      // optional: inline CSS (MJML already produces email-friendly HTML but juice can help for extra inlining)
      const inlined = juice(html);

      // compile plain text
      const text = txtSource
        ? this.compile(txtSource, fullCtx)
        : this.stripHtmlToText(inlined);

      // send email
      const mail = {
        from: this.cfg.get("MAIL_FROM"),
        to,
        subject,
        html: inlined,
        text,
      };

      const info = await this.transporter.sendMail(mail);
      this.logger.verbose(`Email sent to ${to} (${info.messageId})`);
      return info;
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
    // simple fallback: remove tags and collapse whitespace
    return html
      .replace(/<\/?[^>]+(>|$)/g, "")
      .replace(/\s+/g, " ")
      .trim();
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
}
