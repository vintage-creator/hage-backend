import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsUUID, IsOptional, IsString } from "class-validator";

export class AssignShipmentDto {
  @ApiPropertyOptional({
    description:
      "ID of the transporter (user.id). Must be a user with role = TRANSPORTER.",
    example: "user_transporter_id_123",
  })
  @IsOptional()
  @IsString()
  transporterId?: string;

  @ApiPropertyOptional({
    description:
      "ID of the warehouse where this shipment will be stored/processed.",
    example: "warehouse_id_456",
  })
  @IsOptional()
  @IsString()
  warehouseId?: string;
}
