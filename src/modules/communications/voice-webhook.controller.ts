import { Body, Controller, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Response } from 'express';

@ApiExcludeController()
@Controller('communications/voice')
export class VoiceWebhookController {
   private escapeXml(value: string) {
      return value
         .replace(/&/g, '&amp;')
         .replace(/</g, '&lt;')
         .replace(/>/g, '&gt;')
         .replace(/"/g, '&quot;')
         .replace(/'/g, '&apos;');
   }

   @Post('twiml')
   @HttpCode(HttpStatus.OK)
   twiml(@Body() body: Record<string, any>, @Res() res: Response) {
      const to = typeof body?.To === 'string' ? body.To.trim() : '';
      const safeTo = this.escapeXml(to);

      const twiml = safeTo
         ? `<?xml version="1.0" encoding="UTF-8"?><Response><Dial><Client>${safeTo}</Client></Dial></Response>`
         : `<?xml version="1.0" encoding="UTF-8"?><Response><Reject reason="busy" /></Response>`;

      res.type('text/xml').send(twiml);
   }
}
