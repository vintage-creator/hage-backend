import { Module } from "@nestjs/common";
import { InventoryController } from "./inventory.controller";
import { InventoryService } from "./inventory.service";
import { PrismaModule } from "../../prisma/prisma.module";
import { MailService } from "../../common/mail/mail.service";
import UrlService from "../auth/url.service";

@Module({
	imports: [PrismaModule],
	controllers: [InventoryController],
	providers: [InventoryService, MailService, UrlService],
	exports: [InventoryService],
})
export class InventoryModule {}
