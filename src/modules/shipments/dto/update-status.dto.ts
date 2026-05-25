import { IsEnum, IsOptional, IsString } from 'class-validator';

export enum ShipmentStatus {
   PENDING = 'PENDING',
   IN_WAREHOUSE = 'IN_WAREHOUSE',
}

export class UpdateStatusDto {
   @IsEnum(ShipmentStatus)
   status!: ShipmentStatus;

   @IsString()
   @IsOptional()
   note?: string;
}
