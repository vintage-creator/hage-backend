import { IsString, IsEmail, IsOptional, IsNotEmpty, IsNumber, IsEnum, Min, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

export class LocationDto {
	@IsString({ message: "Country must be a string" })
	@IsNotEmpty({ message: "Country is required" })
	country!: string;

	@IsString({ message: "State must be a string" })
	@IsNotEmpty({ message: "State is required" })
	state!: string;

	@IsString({ message: "Address must be a string" })
	@IsNotEmpty({ message: "Address is required" })
	address!: string;

	@IsString({ message: "Phone number must be a string" })
	@IsOptional()
	phone!: string;
}

export class CreateShipmentDto {
	// Tracking / Order Info
	@IsString({ message: "Order ID must be a string" })
	@IsOptional()
	orderId!: string; // e.g. SHP-2025-12345

	@IsString({ message: "Tracking ID must be a string" })
	@IsOptional()
	trackingId?: string; // optional unique tracking reference

	// Client Details
	@IsString({ message: "Client name must be a string" })
	@IsNotEmpty({ message: "Client name is required" })
	clientName!: string;

	@IsEmail({}, { message: "Please provide a valid email address" })
	@IsOptional()
	email?: string;

	@IsString({ message: "Phone number must be a string" })
	@IsOptional()
	phone?: string;

	// Cargo Details
	@IsString({ message: "Cargo type must be a string" })
	@IsNotEmpty({ message: "Cargo type is required" })
	cargoType!: string;

	@IsOptional()
	@Type(() => Number)
	@IsNumber({}, { message: "Tons must be a valid number" })
	tons?: number;

	@IsNumber({}, { message: "Weight must be a valid number" })
	@Min(0.1, { message: "Weight must be greater than 0" })
	@Type(() => Number)
	weight!: number;

	@IsString({ message: "Handling instructions must be a string" })
	@IsOptional()
	handlingInstructions?: string;

	// Origin & Destination
	@ValidateNested({ message: "Origin must be a valid location object" })
	@Type(() => LocationDto)
	@IsNotEmpty({ message: "Origin is required" })
	origin!: LocationDto;

	@ValidateNested({ message: "Destination must be a valid location object" })
	@Type(() => LocationDto)
	@IsNotEmpty({ message: "Destination is required" })
	destination!: LocationDto;

	// Pickup & Delivery
	@IsNotEmpty({ message: "Pickup mode is required" })
	pickupMode!: string;

	@IsOptional()
	pickupDate?: string;

	@IsOptional()
	deliveryDate?: string;

	// Service & Pricing
	@IsNotEmpty({ message: "Service type is required" })
	serviceType!: string;

	@IsNumber({}, { message: "Base freight must be a valid number" })
	@Min(0, { message: "Base freight cannot be negative" })
	@Type(() => Number)
	baseFrieght!: number;

	@IsNumber({}, { message: "Handling fee must be a valid number" })
	@Min(0, { message: "Handling fee cannot be negative" })
	@Type(() => Number)
	handlingFee!: number;

	@IsNumber({}, { message: "Insurance fee must be a valid number" })
	@Min(0, { message: "Insurance fee cannot be negative" })
	@Type(() => Number)
	@IsOptional()
	insuranceFee?: number;
}
