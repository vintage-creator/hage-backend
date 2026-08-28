import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class LogoutDto {
   @ApiPropertyOptional({
      description: 'Optional refresh token string (if using token-in-body logout)',
   })
   @IsOptional()
   @IsString()
   refreshToken?: string;

   @ApiPropertyOptional({
      description: 'Optional refresh token DB id (if known)',
   })
   @IsOptional()
   @IsString()
   refreshTokenId?: string;
}
