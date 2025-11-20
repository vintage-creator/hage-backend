// src/modules/profile/profile.controller.ts
import { Controller, Get, Post, Delete, UseGuards, Req, UploadedFile, UseInterceptors, BadRequestException } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import * as path from "path";
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiResponse, ApiTags, ApiBody } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { ProfileService } from "./profile.service";

type FileFilterCallback = (error: Error | null, acceptFile: boolean) => void;

const imageFileFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
	const ext = path.extname(file.originalname).toLowerCase();
	const allowedExts = [".jpg", ".jpeg", ".png", ".webp"];
	const allowedMimes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

	if (allowedExts.includes(ext) && allowedMimes.includes(file.mimetype)) {
		cb(null, true);
	} else {
		cb(new BadRequestException("Only JPEG, PNG, and WebP images are allowed"), false);
	}
};

@ApiTags("profile")
@Controller("profile")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth("access-token")
export class ProfileController {
	constructor(private readonly profileService: ProfileService) {}

	@Get()
	@ApiOperation({ summary: "Get current user profile and company information" })
	@ApiResponse({
		status: 200,
		description: "Returns user profile with company details",
	})
	async getProfile(@Req() req: Request) {
		const user = (req as any).user;
		return this.profileService.getProfile(user.sub);
	}

	@Post("picture")
	@ApiOperation({ summary: "Upload or update profile picture" })
	@ApiConsumes("multipart/form-data")
	@ApiResponse({
		status: 200,
		description: "Profile picture updated successfully",
	})
	@ApiBody({
		schema: {
			type: "object",
			properties: {
				profilePicture: {
					type: "string",
					format: "binary",
					description: "Profile picture file (JPEG, PNG, or WebP, max 5MB)",
				},
			},
			required: ["profilePicture"],
		},
	})
	@UseInterceptors(
		FileInterceptor("profilePicture", {
			storage: memoryStorage(),
			fileFilter: imageFileFilter,
			limits: {
				fileSize: 5 * 1024 * 1024, // 5 MB
			},
		})
	)
	async updateProfilePicture(@Req() req: Request, @UploadedFile() file: Express.Multer.File) {
		if (!file) {
			throw new BadRequestException("Profile picture file is required");
		}

		const user = (req as any).user;
		return this.profileService.updateProfilePicture(user.sub, file);
	}
}
