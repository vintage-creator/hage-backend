import { IsString, IsOptional, IsNotEmpty, IsNumber, IsEnum, IsArray, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum ShipmentTypeEnum {
   INLAND = 'INLAND',
   CROSS_BORDER = 'CROSS_BORDER',
}

export enum VisibilityEnum {
   PUBLIC = 'PUBLIC',
   PRIVATE = 'PRIVATE',
   ASSIGNED = 'ASSIGNED',
}

export enum FreightTypeEnum {
   SEA_FREIGHT = 'SEA_FREIGHT',
   AIR_FREIGHT = 'AIR_FREIGHT',
}

export class LocationDto {
   @ApiPropertyOptional()
   @IsString()
   @IsOptional()
   country?: string;

   @ApiPropertyOptional()
   @IsString()
   @IsOptional()
   state?: string;

   @ApiPropertyOptional()
   @IsString()
   @IsOptional()
   address?: string;

   @ApiPropertyOptional()
   @IsString()
   @IsOptional()
   phone?: string;
}

export class CreateShipmentDto {
   // ─── TYPE & VISIBILITY ─────────────────────────────────────────────────
   @ApiProperty({ enum: ShipmentTypeEnum, default: ShipmentTypeEnum.INLAND })
   @IsEnum(ShipmentTypeEnum)
   @IsNotEmpty()
   shipmentType!: ShipmentTypeEnum;

   @ApiPropertyOptional({ enum: VisibilityEnum, default: VisibilityEnum.PUBLIC })
   @IsEnum(VisibilityEnum)
   @IsOptional()
   visibility?: VisibilityEnum;

   @ApiPropertyOptional({ enum: FreightTypeEnum, description: 'Cross-border only' })
   @IsEnum(FreightTypeEnum)
   @IsOptional()
   freightType?: FreightTypeEnum;

   // ─── CLIENT DETAILS ────────────────────────────────────────────────────
   @ApiPropertyOptional()
   @IsString()
   @IsOptional()
   orderId?: string;

   @ApiPropertyOptional()
   @IsString()
   @IsOptional()
   clientName?: string;

   @ApiPropertyOptional()
   @IsString()
   @IsOptional()
   email?: string;

   @ApiPropertyOptional()
   @IsString()
   @IsOptional()
   phone?: string;

   // ─── ITEM & CUSTOMER DETAILS ───────────────────────────────────────────
   @ApiPropertyOptional({ description: 'Name of item being shipped' })
   @IsString()
   @IsOptional()
   nameOfItem?: string;

   @ApiPropertyOptional()
   @IsString()
   @IsOptional()
   customerName?: string;

   @ApiPropertyOptional()
   @IsString()
   @IsOptional()
   customerPhone?: string;

   @ApiPropertyOptional()
   @IsString()
   @IsOptional()
   additionalNote?: string;

   // ─── CARGO DETAILS ─────────────────────────────────────────────────────
   @ApiPropertyOptional()
   @IsString()
   @IsOptional()
   cargoType?: string;

   @ApiPropertyOptional()
   @IsString()
   @IsOptional()
   tonnage?: string;

   @ApiPropertyOptional()
   @IsNumber()
   @Min(0)
   @Type(() => Number)
   @IsOptional()
   shippingCost?: string;

   @ApiPropertyOptional()
   @IsNumber()
   @Min(0)
   @Type(() => Number)
   @IsOptional()
   tons?: number;

   @ApiPropertyOptional()
   @IsNumber()
   @Min(0)
   @Type(() => Number)
   @IsOptional()
   weight?: number;

   @ApiPropertyOptional()
   @IsString()
   @IsOptional()
   handlingInstructions?: string;

   // ─── INLAND-SPECIFIC ───────────────────────────────────────────────────
   @ApiPropertyOptional({ description: 'e.g. Tipper, Flatbed' })
   @IsString()
   @IsOptional()
   truckType?: string;

   @ApiPropertyOptional({ description: 'e.g. 20 Tons' })
   @IsString()
   @IsOptional()
   truckSize?: string;

   // ─── CROSS-BORDER SPECIFIC ─────────────────────────────────────────────
   @ApiPropertyOptional()
   @IsString()
   @IsOptional()
   destinationCountry?: string;

   @ApiPropertyOptional({ type: [String] })
   @IsArray()
   @IsString({ each: true })
   @IsOptional()
   customDocumentUrls?: string[];

   @ApiPropertyOptional()
   @IsNumber()
   @Min(0)
   @Type(() => Number)
   @IsOptional()
   cargoDuty?: number;

   // ─── ORIGIN & DESTINATION ──────────────────────────────────────────────
   @ApiPropertyOptional({ type: LocationDto })
   @ValidateNested()
   @Type(() => LocationDto)
   @IsOptional()
   origin?: LocationDto;

   @ApiPropertyOptional({ type: LocationDto })
   @ValidateNested()
   @Type(() => LocationDto)
   @IsOptional()
   destination?: LocationDto;

   // ─── COORDINATES ───────────────────────────────────────────────────────
   @ApiPropertyOptional({ description: 'Pickup latitude from Google Maps geocoding' })
   @IsNumber()
   @Type(() => Number)
   @IsOptional()
   pickupLat?: number;

   @ApiPropertyOptional({ description: 'Pickup longitude from Google Maps geocoding' })
   @IsNumber()
   @Type(() => Number)
   @IsOptional()
   pickupLng?: number;

   @ApiPropertyOptional({ description: 'Delivery latitude from Google Maps geocoding' })
   @IsNumber()
   @Type(() => Number)
   @IsOptional()
   deliveryLat?: number;

   @ApiPropertyOptional({ description: 'Delivery longitude from Google Maps geocoding' })
   @IsNumber()
   @Type(() => Number)
   @IsOptional()
   deliveryLng?: number;

   // ─── PICKUP & DELIVERY ─────────────────────────────────────────────────
   @ApiPropertyOptional({ enum: ['AIR_FREIGHT', 'SEA_FREIGHT', 'ROAD'], default: 'ROAD' })
   @IsString()
   @IsOptional()
   pickupMode?: string;

   @ApiPropertyOptional()
   @IsString()
   @IsOptional()
   pickupDate?: string;

   @ApiPropertyOptional({ description: 'e.g. Morning, Afternoon, Evening' })
   @IsString()
   @IsOptional()
   pickupTimeslot?: string;

   @ApiPropertyOptional()
   @IsString()
   @IsOptional()
   bookingOfficerPhone?: string;

   @ApiPropertyOptional()
   @IsString()
   @IsOptional()
   waybillUrl?: string;

   @ApiPropertyOptional()
   @IsString()
   @IsOptional()
   deliveryDate?: string;

   @ApiPropertyOptional()
   @IsString()
   @IsOptional()
   orderNumber?: string;

   // ─── PRICING ───────────────────────────────────────────────────────────
   @ApiPropertyOptional()
   @IsString()
   @IsOptional()
   serviceType?: string;

   @ApiPropertyOptional()
   @IsNumber()
   @Min(0)
   @Type(() => Number)
   @IsOptional()
   baseFrieght?: number;

   @ApiPropertyOptional()
   @IsNumber()
   @Min(0)
   @Type(() => Number)
   @IsOptional()
   handlingFee?: number;

   @ApiPropertyOptional()
   @IsNumber()
   @Min(0)
   @Type(() => Number)
   @IsOptional()
   insuranceFee?: number;

   @ApiPropertyOptional()
   @IsNumber()
   @Min(0)
   @Type(() => Number)
   @IsOptional()
   transactionFee?: number;

   // ─── TRANSPORTER (PRIVATE/ASSIGNED) ───────────────────────────────────
   @ApiPropertyOptional({ description: 'Pre-select a transporter (for PRIVATE/ASSIGNED visibility)' })
   @IsString()
   @IsOptional()
   transporterId?: string;
}
