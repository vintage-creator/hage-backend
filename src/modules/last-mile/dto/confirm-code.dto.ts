import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';

export class ConfirmCodeDto {
   @ApiProperty({ description: 'The 4-digit delivery code entered by the driver on the "Confirm Code" screen', example: '4821' })
   @IsString()
   @IsNotEmpty()
   @Length(4, 4)
   code!: string;
}
