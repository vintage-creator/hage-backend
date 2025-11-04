// src/common/storage/cloudinary.service.ts
import { Injectable } from "@nestjs/common";
import { v2 as cloudinary, UploadApiOptions, UploadApiResponse } from "cloudinary";
import streamifier from "streamifier";
import type { StorageService, StorageResult } from "./storage.interface";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class CloudinaryService implements StorageService {
	constructor(private cfg: ConfigService) {
		cloudinary.config({
			cloud_name: cfg.get("CLOUDINARY_CLOUD_NAME"),
			api_key: cfg.get("CLOUDINARY_API_KEY"),
			api_secret: cfg.get("CLOUDINARY_API_SECRET"),
			secure: true,
		});
	}

	async uploadFile(file: Express.Multer.File, options: UploadApiOptions = {}): Promise<StorageResult> {
		if (!file || !file.buffer) throw new Error("No file buffer provided");

		const finalOptions = {
			folder: options.folder ?? "company-docs",
			resource_type: "auto",
			access_mode: "public",
			...options,
		} as any;

		return new Promise<StorageResult>((resolve, reject) => {
			const cb = (error: Error | undefined, result: UploadApiResponse | undefined) => {
				if (error) return reject(error);
				if (!result || !result.secure_url) return reject(new Error("Invalid Cloudinary response"));

				resolve({
					url: result.secure_url,
					key: result.public_id,
					name: file.originalname,
				});
			};

			const uploadStream = cloudinary.uploader.upload_stream(finalOptions, cb);
			streamifier.createReadStream(file.buffer).pipe(uploadStream);
		});
	}

	async delete(keyOrUrl: string) {
		await cloudinary.uploader.destroy(keyOrUrl);
	}
}
