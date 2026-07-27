import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty } from 'class-validator';

export class SetAvailabilityDto {
   @ApiProperty({ description: 'true = Online (available for deliveries), false = Offline', example: true })
   @IsBoolean()
   @IsNotEmpty()
   isAvailable!: boolean;
}
