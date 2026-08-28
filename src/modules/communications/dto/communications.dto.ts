import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SendShipmentMessageDto {
   @ApiProperty({ example: 'Hello, can you share the current delivery update?' })
   @IsString()
   @MinLength(1)
   @MaxLength(2000)
   body!: string;
}

export class UpdateShipmentMessageDto {
   @ApiProperty({ example: 'Hello, can you share the latest delivery update?' })
   @IsString()
   @MinLength(1)
   @MaxLength(2000)
   body!: string;
}

export enum CallStatusDto {
   REQUESTED = 'REQUESTED',
   RINGING = 'RINGING',
   ONGOING = 'ONGOING',
   ENDED = 'ENDED',
   MISSED = 'MISSED',
   REJECTED = 'REJECTED',
   CANCELLED = 'CANCELLED',
}

export class StartShipmentCallDto {
   @ApiPropertyOptional({
      description: 'Frontend/Twilio provider call identifier, if available.',
      example: 'CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
   })
   @IsOptional()
   @IsString()
   providerCallId?: string;
}

export class UpdateShipmentCallDto {
   @ApiProperty({ enum: CallStatusDto, example: CallStatusDto.ONGOING })
   @IsEnum(CallStatusDto)
   status!: CallStatusDto;

   @ApiPropertyOptional({
      description: 'Frontend/Twilio provider call identifier, if available.',
      example: 'CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
   })
   @IsOptional()
   @IsString()
   providerCallId?: string;
}
