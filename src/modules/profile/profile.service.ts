// src/modules/profile/profile.service.ts
import { Injectable, NotFoundException, BadRequestException, Inject, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import type { StorageService } from "../../common/storage/storage.interface";

@Injectable()
export class ProfileService {
	private readonly logger = new Logger(ProfileService.name);

	constructor(private readonly prisma: PrismaService, @Inject("StorageService") private readonly storage: StorageService) {}

	async getProfile(userId: string) {
		const user = await this.prisma.user.findUnique({
			where: { id: userId },
			include: {
				company: {
					select: {
						id: true,
						fullName: true,
						phoneNumber: true,
						emailAddress: true,
						businessName: true,
						businessAddress: true,
						role: true,
						createdAt: true,
					},
				},
			},
		});

		if (!user) {
			throw new NotFoundException("User not found");
		}

		return {
			id: user.id,
			email: user.email,
			phone: user.phone,
			profilePicture: user.profilePicture,
			kind: user.kind,
			isVerified: user.isVerified,
			createdAt: user.createdAt,
			company: user.company
				? {
						id: user.company.id,
						fullName: user.company.fullName,
						phoneNumber: user.company.phoneNumber,
						emailAddress: user.company.emailAddress,
						businessName: user.company.businessName,
						businessAddress: user.company.businessAddress,
						role: user.company.role,
						accountCreated: user.company.createdAt,
				  }
				: null,
		};
	}

	async getDashboard(userId: string) {
		const user = await this.prisma.user.findUnique({
			where: { id: userId },
			select: {
				id: true,
				kind: true,
				company: {
					select: {
						businessName: true,
						fullName: true,
					},
				},
			},
		});

		if (!user) {
			throw new NotFoundException("User not found");
		}

		// Count shipments by status for this user
		const [delivered, pending, failed] = await Promise.all([
			this.prisma.shipment.count({
				where: {
					createdBy: userId,
					status: { in: ["DELIVERED", "COMPLETED"] as any },
				},
			}),
			this.prisma.shipment.count({
				where: {
					createdBy: userId,
					status: "PENDING" as any,
				},
			}),
			this.prisma.shipment.count({
				where: {
					createdBy: userId,
					status: { in: ["FAILED", "CANCELLED"] as any },
				},
			}),
		]);

		return {
			businessName: user.company?.businessName ?? user.company?.fullName ?? null,
			kind: user.kind,
			dashboard: {
				delivered,
				pending,
				failed,
			},
		};
	}

	async updateProfilePicture(userId: string, file: Express.Multer.File) {
		if (!file) {
			throw new BadRequestException("Profile picture file is required");
		}

		const allowedMimeTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
		if (!allowedMimeTypes.includes(file.mimetype)) {
			throw new BadRequestException("Only JPEG, PNG, and WebP images are allowed");
		}

		const maxSize = 5 * 1024 * 1024;
		if (file.size > maxSize) {
			throw new BadRequestException("File size must not exceed 5MB");
		}

		const user = await this.prisma.user.findUnique({
			where: { id: userId },
			select: { profilePicture: true },
		});

		if (!user) {
			throw new NotFoundException("User not found");
		}

		try {
			const uploadResult = await this.storage.uploadFile(file, {
				folder: "profile-pictures",
			});

			const updatedUser = await this.prisma.user.update({
				where: { id: userId },
				data: { profilePicture: uploadResult.url },
				select: {
					id: true,
					email: true,
					phone: true,
					profilePicture: true,
					kind: true,
				},
			});

			if (user.profilePicture) {
				try {
					await this.storage.delete?.(user.profilePicture);
				} catch (deleteErr) {
					this.logger.warn(`Failed to delete old profile picture: ${(deleteErr as any)?.message ?? deleteErr}`);
				}
			}

			return {
				ok: true,
				message: "Profile picture updated successfully",
				profilePicture: updatedUser.profilePicture,
				user: updatedUser,
			};
		} catch (error) {
			this.logger.error(`Failed to update profile picture: ${(error as any)?.message ?? error}`);
			throw new BadRequestException("Failed to update profile picture");
		}
	}
}
