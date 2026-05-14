import { Module } from "@nestjs/common";
import { ShipmentsController } from "./shipments.controller";
import { ShipmentsService } from "./shipments.service";
import { PrismaModule } from "../../prisma/prisma.module";
import { CloudinaryService } from "../../common/storage/cloudinary.service";
import UrlService from "../auth/url.service";

@Module({
	imports: [PrismaModule],
	controllers: [ShipmentsController],
	providers: [ShipmentsService, UrlService, { provide: "StorageService", useClass: CloudinaryService }],
	exports: [ShipmentsService],
})
export class ShipmentsModule {}
