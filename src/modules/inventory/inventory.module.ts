import { Module } from "@nestjs/common";
import { InventoryController } from "./inventory.controller";
import { InventoryService } from "./inventory.service";
import { PrismaModule } from "../../prisma/prisma.module";
import UrlService from "../auth/url.service";

@Module({
	imports: [PrismaModule],
	controllers: [InventoryController],
	providers: [InventoryService, UrlService],
	exports: [InventoryService],
})
export class InventoryModule {}
