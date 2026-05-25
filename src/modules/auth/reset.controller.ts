import { Controller, Get, Post, Body, Query, BadRequestException } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Controller()
export class ResetController {
   constructor(private readonly auth: AuthService) {}

   @Post('reset-password')
   @ApiOperation({ summary: 'Reset password using token from email' })
   @ApiResponse({ status: 200, description: 'Password reset successfully' })
   async resetPassword(@Body() dto: ResetPasswordDto) {
      return this.auth.resetPassword(dto.token, dto.password, dto.retypePassword);
   }

   @Get('reset-password')
   @ApiOperation({
      summary: 'Verify the password reset token and return token details if valid',
   })
   async verifyReset(@Query('token') token: string) {
      return this.auth.verifyResetToken(token);
   }
}
