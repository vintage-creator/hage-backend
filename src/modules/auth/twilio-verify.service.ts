import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class TwilioVerifyService {
   private readonly logger = new Logger(TwilioVerifyService.name);

   constructor(private readonly cfg: ConfigService) {}

   private getConfig() {
      const accountSid = this.cfg.get<string>('TWILIO_ACCOUNT_SID');
      const authToken = this.cfg.get<string>('TWILIO_AUTH_TOKEN');
      const serviceSid = this.cfg.get<string>('TWILIO_VERIFY_SERVICE_SID');

      if (!accountSid || !authToken || !serviceSid) {
         throw new BadRequestException('Phone verification is not configured');
      }

      return { accountSid, authToken, serviceSid };
   }

   private verifyUrl(path: string) {
      const { serviceSid } = this.getConfig();
      return `https://verify.twilio.com/v2/Services/${serviceSid}/${path}`;
   }

   async sendSmsCode(phoneNumber: string) {
      const { accountSid, authToken } = this.getConfig();
      const body = new URLSearchParams({
         To: phoneNumber,
         Channel: 'sms',
      });

      try {
         await axios.post(this.verifyUrl('Verifications'), body, {
            auth: { username: accountSid, password: authToken },
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
         });
      } catch (error: any) {
         const message = error?.response?.data?.message ?? error?.message ?? 'Failed to send phone verification code';
         this.logger.error(`Twilio verification send failed: ${message}`);
         throw new BadRequestException(`Failed to send phone verification code: ${message}`);
      }
   }

   async checkSmsCode(phoneNumber: string, code: string) {
      const { accountSid, authToken } = this.getConfig();
      const body = new URLSearchParams({
         To: phoneNumber,
         Code: code,
      });

      try {
         const response = await axios.post(this.verifyUrl('VerificationCheck'), body, {
            auth: { username: accountSid, password: authToken },
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
         });

         return response.data?.status === 'approved';
      } catch (error: any) {
         const message = error?.response?.data?.message ?? error?.message ?? 'Failed to verify phone code';
         this.logger.error(`Twilio verification check failed: ${message}`);
         return false;
      }
   }
}
