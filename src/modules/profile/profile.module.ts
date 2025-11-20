// src/modules/profile/profile.module.ts
import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ProfileController } from "./profile.controller";
import { ProfileService } from "./profile.service";
import { PrismaModule } from "../../prisma/prisma.module";
import { CloudinaryService } from "../../common/storage/cloudinary.service";

@Module({
	imports: [
		PrismaModule,
		JwtModule.registerAsync({
			imports: [ConfigModule],
			useFactory: (cfg: ConfigService) => ({
				secret: cfg.get("JWT_SECRET"),
				signOptions: {
					expiresIn: cfg.get("JWT_EXPIRES_IN") ?? "30m",
				},
			}),
			inject: [ConfigService],
		}),
	],
	controllers: [ProfileController],
	providers: [ProfileService, { provide: "StorageService", useClass: CloudinaryService }],
	exports: [ProfileService],
})
export class ProfileModule {}
