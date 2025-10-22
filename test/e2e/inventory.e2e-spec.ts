import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../../src/app.module";
import { PrismaService } from "../../src/prisma/prisma.service";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";

describe("Inventory Complete E2E Tests", () => {
	let app: INestApplication;
	let prisma: PrismaService;
	let jwtService: JwtService;

	// User tokens and IDs
	let lspToken: string;
	let lspUserId: string;
	let lspCompanyId: string;
	let enterpriseToken: string;
	let enterpriseUserId: string;
	let warehouseManagerToken: string;
	let warehouseManagerUserId: string;

	// Test data IDs
	let warehouseId: string;
	let warehouseId2: string;
	let zoneId: string;
	let rackId: string;
	let binId: string;
	let binId2: string;
	let productId: string;
	let productId2: string;
	let inventoryId: string;
	let inventoryLocationId: string;

	beforeAll(async () => {
		const moduleRef = await Test.createTestingModule({
			imports: [AppModule],
		}).compile();

		app = moduleRef.createNestApplication();
		app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
		app.setGlobalPrefix("api");
		await app.init();

		prisma = app.get(PrismaService);
		jwtService = app.get(JwtService);

		// Create test users for different roles
		await createTestUsers();
	});

	afterAll(async () => {
		await cleanup();
		await prisma.$disconnect();
		if (app) await app.close();
	});

	// ==================== HELPER FUNCTIONS ====================

	async function createTestUsers() {
		const timestamp = Date.now();
		const password = "Test123!";
		const hashed = await bcrypt.hash(password, 10);

		// Create test company for LSP
		const lspCompany = await prisma.company.create({
			data: {
				fullName: `LSP Company ${timestamp}`,
				phoneNumber: "+2348012345678",
				emailAddress: `lsp-company-${timestamp}@example.com`,
				businessName: `TEST-LSP-${timestamp}`,
				businessAddress: "123 LSP Street",
			},
		});
		lspCompanyId = lspCompany.id;

		// LSP User
		const lspUser = await prisma.user.create({
			data: {
				email: `lsp-${timestamp}@example.com`,
				password: hashed,
				kind: "LOGISTIC_SERVICE_PROVIDER",
				role: "CROSS_BORDER_LOGISTICS",
				companyId: lspCompany.id,
				isVerified: true,
			},
		});
		lspUserId = lspUser.id;
		lspToken = jwtService.sign({
			sub: lspUserId,
			id: lspUserId,
			email: lspUser.email,
			role: lspUser.role,
			kind: lspUser.kind,
		});

		// Enterprise User
		const enterpriseUser = await prisma.user.create({
			data: {
				email: `enterprise-${timestamp}@example.com`,
				password: hashed,
				kind: "ENTERPRISE",
				role: "CROSS_BORDER_LOGISTICS",
				isVerified: true,
			},
		});
		enterpriseUserId = enterpriseUser.id;
		enterpriseToken = jwtService.sign({
			sub: enterpriseUserId,
			id: enterpriseUserId,
			email: enterpriseUser.email,
			role: enterpriseUser.role,
			kind: enterpriseUser.kind,
		});

		// Warehouse Manager User
		const warehouseManager = await prisma.user.create({
			data: {
				email: `warehouse-mgr-${timestamp}@example.com`,
				password: hashed,
				kind: "LOGISTIC_SERVICE_PROVIDER",
				role: "CROSS_BORDER_LOGISTICS",
				companyId: lspCompany.id,
				isVerified: true,
			},
		});
		warehouseManagerUserId = warehouseManager.id;
		warehouseManagerToken = jwtService.sign({
			sub: warehouseManagerUserId,
			id: warehouseManagerUserId,
			email: warehouseManager.email,
			role: warehouseManager.role,
			kind: warehouseManager.kind,
		});
	}

	async function cleanup() {
		try {
			const userIds = [lspUserId, enterpriseUserId, warehouseManagerUserId];

			// Delete inventory locations first
			await prisma.inventoryLocation.deleteMany({
				where: {
					inventory: {
						warehouse: {
							companyId: lspCompanyId,
						},
					},
				},
			});

			// Delete inventories
			await prisma.inventory.deleteMany({
				where: {
					warehouse: {
						companyId: lspCompanyId,
					},
				},
			});

			// Delete products
			await prisma.product.deleteMany({
				where: {
					sku: { startsWith: "TEST-" },
				},
			});

			// Delete bins
			await prisma.bin.deleteMany({
				where: {
					rack: {
						zone: {
							warehouse: {
								companyId: lspCompanyId,
							},
						},
					},
				},
			});

			// Delete racks
			await prisma.rack.deleteMany({
				where: {
					zone: {
						warehouse: {
							companyId: lspCompanyId,
						},
					},
				},
			});

			// Delete zones
			await prisma.zone.deleteMany({
				where: {
					warehouse: {
						companyId: lspCompanyId,
					},
				},
			});

			// Delete warehouses
			await prisma.warehouse.deleteMany({
				where: {
					companyId: lspCompanyId,
				},
			});

			// Delete users
			await prisma.user.deleteMany({ where: { id: { in: userIds } } });

			// Delete company
			await prisma.company.deleteMany({ where: { id: lspCompanyId } });
		} catch (err: any) {
			console.warn("Cleanup error:", err.message);
		}
	}

	async function createWarehouseInfrastructure() {
		// Create first warehouse
		const warehouse = await prisma.warehouse.create({
			data: {
				companyId: lspCompanyId,
				name: `TEST-Warehouse-Lagos-${Date.now()}`,
				country: "Nigeria",
				city: "Lagos",
				address: "456 Warehouse Road, Apapa",
				totalCapacity: 10000,
				capacityUnit: "pieces",
				status: "ACTIVE",
				numZones: 3,
				numRows: 5,
				numRacks: 10,
				numBinsPerRack: 20,
				allowsTemperature: true,
				allowsHazardous: true,
				allowsQuarantine: true,
			},
		});
		warehouseId = warehouse.id;

		// Create second warehouse for multi-warehouse testing
		const warehouse2 = await prisma.warehouse.create({
			data: {
				companyId: lspCompanyId,
				name: `TEST-Warehouse-Abuja-${Date.now()}`,
				country: "Nigeria",
				city: "Abuja",
				address: "789 Storage Avenue",
				totalCapacity: 5000,
				capacityUnit: "pieces",
				status: "ACTIVE",
				numZones: 2,
				numRows: 3,
				numRacks: 6,
				numBinsPerRack: 15,
				allowsTemperature: true,
				allowsHazardous: false,
				allowsQuarantine: true,
			},
		});
		warehouseId2 = warehouse2.id;

		// Create zone
		const zone = await prisma.zone.create({
			data: {
				warehouseId: warehouse.id,
				name: "Zone-A-Cold-Storage",
				tempMin: 2,
				tempMax: 8,
				allowsHazardous: true,
				isQuarantineZone: false,
				capacity: 5000,
			},
		});
		zoneId = zone.id;

		// Create rack
		const rack = await prisma.rack.create({
			data: {
				zoneId: zone.id,
				name: "Rack-A1",
				capacity: 500,
			},
		});
		rackId = rack.id;

		// Create multiple bins
		const bin = await prisma.bin.create({
			data: {
				rackId: rack.id,
				name: "Bin-A1-01",
				capacity: 100,
				currentQty: 0,
				reservedQty: 0,
				tempMin: 2,
				tempMax: 8,
				allowsHazardous: true,
				isQuarantine: false,
			},
		});
		binId = bin.id;

		const bin2 = await prisma.bin.create({
			data: {
				rackId: rack.id,
				name: "Bin-A1-02",
				capacity: 150,
				currentQty: 0,
				reservedQty: 0,
				tempMin: 2,
				tempMax: 8,
				allowsHazardous: true,
				isQuarantine: false,
			},
		});
		binId2 = bin2.id;

		// Create products
		const product = await prisma.product.create({
			data: {
				sku: `TEST-SKU-PHARMA-${Date.now()}`,
				name: "Test Pharmaceutical Product",
				unit: "boxes",
				tempMin: 2,
				tempMax: 8,
				isHazardous: false,
			},
		});
		productId = product.id;

		const product2 = await prisma.product.create({
			data: {
				sku: `TEST-SKU-ELECTRONICS-${Date.now()}`,
				name: "Test Electronic Components",
				unit: "cartons",
				tempMin: null,
				tempMax: null,
				isHazardous: false,
			},
		});
		productId2 = product2.id;
	}

	// ==================== TEST CASES ====================

	describe("Setup: Warehouse Infrastructure", () => {
		it("should create warehouse infrastructure for testing", async () => {
			await createWarehouseInfrastructure();
			expect(warehouseId).toBeDefined();
			expect(warehouseId2).toBeDefined();
			expect(zoneId).toBeDefined();
			expect(rackId).toBeDefined();
			expect(binId).toBeDefined();
			expect(productId).toBeDefined();
		});
	});

	// ==================== INVENTORY CREATION TESTS ====================

	describe("POST /api/inventory - Create Inventory", () => {
		it("should create new inventory for product and warehouse", async () => {
			const res = await request(app.getHttpServer())
				.post("/api/inventory")
				.set("Authorization", `Bearer ${lspToken}`)
				.send({
					productId,
					warehouseId,
					totalQty: 0,
				})
				.expect(201);

			expect(res.body).toHaveProperty("id");
			expect(res.body.productId).toBe(productId);
			expect(res.body.warehouseId).toBe(warehouseId);
			expect(res.body.totalQty).toBe(0);

			inventoryId = res.body.id;
		});

		it("should return existing inventory if already exists (upsert behavior)", async () => {
			const res = await request(app.getHttpServer())
				.post("/api/inventory")
				.set("Authorization", `Bearer ${lspToken}`)
				.send({
					productId,
					warehouseId,
				})
				.expect(201);

			expect(res.body.id).toBe(inventoryId);
		});

		it("should create inventory for second warehouse", async () => {
			const res = await request(app.getHttpServer())
				.post("/api/inventory")
				.set("Authorization", `Bearer ${lspToken}`)
				.send({
					productId,
					warehouseId: warehouseId2,
					totalQty: 0,
				})
				.expect(201);

			expect(res.body.warehouseId).toBe(warehouseId2);
		});

		it("should fail with invalid product ID", async () => {
			await request(app.getHttpServer())
				.post("/api/inventory")
				.set("Authorization", `Bearer ${lspToken}`)
				.send({
					productId: "invalid-product-id",
					warehouseId,
				})
				.expect(404);
		});

		it("should fail with invalid warehouse ID", async () => {
			await request(app.getHttpServer())
				.post("/api/inventory")
				.set("Authorization", `Bearer ${lspToken}`)
				.send({
					productId,
					warehouseId: "invalid-warehouse-id",
				})
				.expect(404);
		});

		it("should fail without authentication", async () => {
			await request(app.getHttpServer())
				.post("/api/inventory")
				.send({
					productId,
					warehouseId,
				})
				.expect(401);
		});
	});

	// ==================== INVENTORY LOCATION CREATION TESTS ====================

	describe("POST /api/inventory/locations - Create Inventory Location", () => {
		it("should create inventory location with complete data", async () => {
			const res = await request(app.getHttpServer())
				.post("/api/inventory/locations")
				.set("Authorization", `Bearer ${lspToken}`)
				.send({
					inventoryId,
					binId,
					qty: 50,
					clientId: lspCompanyId,
					clientName: "Test Pharmaceutical Client",
					status: "AVAILABLE",
					condition: "NEW",
					lotNumber: "LOT-2025-001",
					expiryDate: "2026-12-31",
					specialHandling: {
						tempMin: 2,
						tempMax: 8,
						isHazardous: false,
						compatibility: ["pharma", "medical"],
					},
				})
				.expect(201);

			expect(res.body).toHaveProperty("id");
			expect(res.body.qty).toBe(50);
			expect(res.body.status).toBe("AVAILABLE");
			expect(res.body.condition).toBe("NEW");
			expect(res.body.lotNumber).toBe("LOT-2025-001");
			expect(res.body.tempMin).toBe(2);
			expect(res.body.tempMax).toBe(8);
			expect(res.body.createdBy).toBe(lspUserId);

			inventoryLocationId = res.body.id;

			// Verify transactional updates
			const bin = await prisma.bin.findUnique({ where: { id: binId } });
			expect(bin?.currentQty).toBe(50);

			const inventory = await prisma.inventory.findUnique({ where: { id: inventoryId } });
			expect(inventory?.totalQty).toBe(50);
		});

		it("should create inventory location without special handling", async () => {
			const res = await request(app.getHttpServer())
				.post("/api/inventory/locations")
				.set("Authorization", `Bearer ${warehouseManagerToken}`)
				.send({
					inventoryId,
					binId: binId2,
					qty: 30,
					status: "AVAILABLE",
					condition: "NEW",
				})
				.expect(201);

			expect(res.body.qty).toBe(30);
			expect(res.body.createdBy).toBe(warehouseManagerUserId);
		});

		it("should fail when bin capacity exceeded", async () => {
			const res = await request(app.getHttpServer())
				.post("/api/inventory/locations")
				.set("Authorization", `Bearer ${lspToken}`)
				.send({
					inventoryId,
					binId,
					qty: 100, // bin capacity is 100, but 50 already used
				})
				.expect(400);

			expect(res.body.message).toContain("available space");
		});

		it("should fail when temperature requirements exceed bin capabilities", async () => {
			const res = await request(app.getHttpServer())
				.post("/api/inventory/locations")
				.set("Authorization", `Bearer ${lspToken}`)
				.send({
					inventoryId,
					binId,
					qty: 10,
					specialHandling: {
						tempMin: -20,
						tempMax: -10,
					},
				})
				.expect(400);

			expect(res.body.message).toContain("temperature");
		});

		it("should fail when hazardous item placed in non-hazardous bin", async () => {
			// Create non-hazardous bin
			const nonHazBin = await prisma.bin.create({
				data: {
					rackId,
					name: "Bin-A1-NonHaz",
					capacity: 100,
					allowsHazardous: false,
				},
			});

			const res = await request(app.getHttpServer())
				.post("/api/inventory/locations")
				.set("Authorization", `Bearer ${lspToken}`)
				.send({
					inventoryId,
					binId: nonHazBin.id,
					qty: 10,
					specialHandling: {
						isHazardous: true,
					},
				})
				.expect(400);

			expect(res.body.message).toContain("hazardous");
		});

		it("should fail with missing required fields", async () => {
			await request(app.getHttpServer())
				.post("/api/inventory/locations")
				.set("Authorization", `Bearer ${lspToken}`)
				.send({
					inventoryId,
					// missing binId and qty
				})
				.expect(400);
		});

		it("should fail with negative quantity", async () => {
			await request(app.getHttpServer())
				.post("/api/inventory/locations")
				.set("Authorization", `Bearer ${lspToken}`)
				.send({
					inventoryId,
					binId,
					qty: -10,
				})
				.expect(400);
		});
	});

	// ==================== INVENTORY LOCATION LISTING & FILTERING ====================

	describe("GET /api/inventory/locations - List and Filter", () => {
		it("should list all inventory locations", async () => {
			const res = await request(app.getHttpServer()).get("/api/inventory/locations").set("Authorization", `Bearer ${lspToken}`).expect(200);

			expect(Array.isArray(res.body)).toBe(true);
			expect(res.body.length).toBeGreaterThan(0);
			expect(res.body[0]).toHaveProperty("bin");
			expect(res.body[0]).toHaveProperty("inventory");
			expect(res.body[0].bin).toHaveProperty("rack");
			expect(res.body[0].inventory).toHaveProperty("product");
		});

		it("should filter by warehouse", async () => {
			const res = await request(app.getHttpServer()).get(`/api/inventory/locations`).set("Authorization", `Bearer ${lspToken}`).query({ warehouseId }).expect(200);

			expect(res.body.every((loc: any) => loc.inventory.warehouseId === warehouseId)).toBe(true);
		});

		it("should filter by status", async () => {
			const res = await request(app.getHttpServer()).get("/api/inventory/locations").set("Authorization", `Bearer ${lspToken}`).query({ status: "AVAILABLE" }).expect(200);

			expect(res.body.every((loc: any) => loc.status === "AVAILABLE")).toBe(true);
		});

		it("should filter by client", async () => {
			const res = await request(app.getHttpServer()).get("/api/inventory/locations").set("Authorization", `Bearer ${lspToken}`).query({ clientId: lspCompanyId }).expect(200);

			expect(res.body.every((loc: any) => loc.clientId === lspCompanyId)).toBe(true);
		});

		it("should filter by rack", async () => {
			const res = await request(app.getHttpServer()).get("/api/inventory/locations").set("Authorization", `Bearer ${lspToken}`).query({ rackId }).expect(200);

			expect(res.body.every((loc: any) => loc.bin.rackId === rackId)).toBe(true);
		});

		it("should filter by condition", async () => {
			const res = await request(app.getHttpServer()).get("/api/inventory/locations").set("Authorization", `Bearer ${lspToken}`).query({ condition: "NEW" }).expect(200);

			expect(res.body.every((loc: any) => loc.condition === "NEW")).toBe(true);
		});

		it("should filter by multiple criteria", async () => {
			const res = await request(app.getHttpServer())
				.get("/api/inventory/locations")
				.set("Authorization", `Bearer ${lspToken}`)
				.query({
					warehouseId,
					status: "AVAILABLE",
					condition: "NEW",
				})
				.expect(200);

			res.body.forEach((loc: any) => {
				expect(loc.inventory.warehouseId).toBe(warehouseId);
				expect(loc.status).toBe("AVAILABLE");
				expect(loc.condition).toBe("NEW");
			});
		});

		it("should search by lot number", async () => {
			const res = await request(app.getHttpServer()).get("/api/inventory/locations").set("Authorization", `Bearer ${lspToken}`).query({ lotNumber: "LOT-2025" }).expect(200);

			expect(res.body.length).toBeGreaterThan(0);
			expect(res.body[0].lotNumber).toContain("LOT-2025");
		});
	});

	// ==================== GET SINGLE INVENTORY LOCATION ====================

	describe("GET /api/inventory/locations/:id - Get Single Location", () => {
		it("should get single inventory location with full details", async () => {
			const res = await request(app.getHttpServer()).get(`/api/inventory/locations/${inventoryLocationId}`).set("Authorization", `Bearer ${lspToken}`).expect(200);

			expect(res.body.id).toBe(inventoryLocationId);
			expect(res.body).toHaveProperty("bin");
			expect(res.body.bin).toHaveProperty("rack");
			expect(res.body.bin.rack).toHaveProperty("zone");
			expect(res.body).toHaveProperty("inventory");
			expect(res.body.inventory).toHaveProperty("product");
			expect(res.body.inventory).toHaveProperty("warehouse");
		});

		it("should return 404 for non-existent location", async () => {
			await request(app.getHttpServer()).get("/api/inventory/locations/non-existent-id").set("Authorization", `Bearer ${lspToken}`).expect(404);
		});

		it("should fail without authentication", async () => {
			await request(app.getHttpServer()).get(`/api/inventory/locations/${inventoryLocationId}`).expect(401);
		});
	});

	// ==================== UPDATE INVENTORY LOCATION ====================

	describe("PATCH /api/inventory/locations/:id - Update Location", () => {
		it("should update quantity in same bin", async () => {
			const res = await request(app.getHttpServer())
				.patch(`/api/inventory/locations/${inventoryLocationId}`)
				.set("Authorization", `Bearer ${lspToken}`)
				.send({
					qty: 60,
				})
				.expect(200);

			expect(res.body.qty).toBe(60);

			// Verify transactional updates
			const bin = await prisma.bin.findUnique({ where: { id: binId } });
			expect(bin?.currentQty).toBe(60);

			const inventory = await prisma.inventory.findUnique({ where: { id: inventoryId } });
			expect(inventory?.totalQty).toBe(90); // 60 + 30 from second location
		});

		it("should decrease quantity in same bin", async () => {
			const res = await request(app.getHttpServer())
				.patch(`/api/inventory/locations/${inventoryLocationId}`)
				.set("Authorization", `Bearer ${lspToken}`)
				.send({
					qty: 40,
				})
				.expect(200);

			expect(res.body.qty).toBe(40);

			const bin = await prisma.bin.findUnique({ where: { id: binId } });
			expect(bin?.currentQty).toBe(40);
		});

		it("should update status", async () => {
			const res = await request(app.getHttpServer())
				.patch(`/api/inventory/locations/${inventoryLocationId}`)
				.set("Authorization", `Bearer ${warehouseManagerToken}`)
				.send({
					status: "RESERVED",
				})
				.expect(200);

			expect(res.body.status).toBe("RESERVED");
		});

		it("should update condition", async () => {
			const res = await request(app.getHttpServer())
				.patch(`/api/inventory/locations/${inventoryLocationId}`)
				.set("Authorization", `Bearer ${lspToken}`)
				.send({
					condition: "GOOD",
				})
				.expect(200);

			expect(res.body.condition).toBe("GOOD");
		});

		it("should update multiple fields at once", async () => {
			const res = await request(app.getHttpServer())
				.patch(`/api/inventory/locations/${inventoryLocationId}`)
				.set("Authorization", `Bearer ${lspToken}`)
				.send({
					qty: 45,
					status: "AVAILABLE",
					condition: "NEW",
					clientName: "Updated Client Name",
				})
				.expect(200);

			expect(res.body.qty).toBe(45);
			expect(res.body.status).toBe("AVAILABLE");
			expect(res.body.condition).toBe("NEW");
			expect(res.body.clientName).toBe("Updated Client Name");
		});

		it("should move inventory to different bin", async () => {
			const currentBin = await prisma.bin.findUnique({ where: { id: binId } });
			const currentQtyInSource = currentBin?.currentQty || 0;

			const res = await request(app.getHttpServer())
				.patch(`/api/inventory/locations/${inventoryLocationId}`)
				.set("Authorization", `Bearer ${lspToken}`)
				.send({
					binId: binId2,
				})
				.expect(200);

			expect(res.body.binId).toBe(binId2);

			// Verify source bin decremented
			const oldBin = await prisma.bin.findUnique({ where: { id: binId } });
			expect(oldBin?.currentQty).toBe(currentQtyInSource - 45);

			// Verify target bin incremented
			const newBin = await prisma.bin.findUnique({ where: { id: binId2 } });
			expect(newBin?.currentQty).toBeGreaterThan(30); // Had 30, now has 30 + 45
		});

		it("should fail when moving to bin without capacity", async () => {
			// Create small bin
			const smallBin = await prisma.bin.create({
				data: {
					rackId,
					name: "Bin-Small",
					capacity: 10,
					tempMin: 2,
					tempMax: 8,
				},
			});

			const res = await request(app.getHttpServer())
				.patch(`/api/inventory/locations/${inventoryLocationId}`)
				.set("Authorization", `Bearer ${lspToken}`)
				.send({
					binId: smallBin.id,
				})
				.expect(400);

			expect(res.body.message).toContain("available space");
		});

		it("should fail with invalid quantity increase beyond capacity", async () => {
			await request(app.getHttpServer())
				.patch(`/api/inventory/locations/${inventoryLocationId}`)
				.set("Authorization", `Bearer ${lspToken}`)
				.send({
					qty: 200, // Exceeds bin capacity
				})
				.expect(400);
		});
	});

	// ==================== STATUS UPDATES ====================

	describe("PATCH /api/inventory/locations/:id/status - Status Updates", () => {
		it("should update status through lifecycle", async () => {
			// AVAILABLE -> RESERVED
			let res = await request(app.getHttpServer())
				.patch(`/api/inventory/locations/${inventoryLocationId}/status`)
				.set("Authorization", `Bearer ${lspToken}`)
				.send({
					status: "RESERVED",
					note: "Reserved for order #12345",
				})
				.expect(200);

			expect(res.body.status).toBe("RESERVED");

			// RESERVED -> HOLD
			res = await request(app.getHttpServer())
				.patch(`/api/inventory/locations/${inventoryLocationId}/status`)
				.set("Authorization", `Bearer ${lspToken}`)
				.send({
					status: "HOLD",
					note: "Awaiting quality inspection",
				})
				.expect(200);

			expect(res.body.status).toBe("HOLD");

			// HOLD -> AVAILABLE
			res = await request(app.getHttpServer())
				.patch(`/api/inventory/locations/${inventoryLocationId}/status`)
				.set("Authorization", `Bearer ${lspToken}`)
				.send({
					status: "AVAILABLE",
					note: "Quality check passed",
				})
				.expect(200);

			expect(res.body.status).toBe("AVAILABLE");
		});

		it("should handle QUARANTINE status", async () => {
			const res = await request(app.getHttpServer())
				.patch(`/api/inventory/locations/${inventoryLocationId}/status`)
				.set("Authorization", `Bearer ${lspToken}`)
				.send({
					status: "QUARANTINE",
					note: "Temperature deviation detected",
				})
				.expect(200);

			expect(res.body.status).toBe("QUARANTINE");
		});

		it("should handle DAMAGED status", async () => {
			const res = await request(app.getHttpServer())
				.patch(`/api/inventory/locations/${inventoryLocationId}/status`)
				.set("Authorization", `Bearer ${warehouseManagerToken}`)
				.send({
					status: "DAMAGED",
					note: "Packaging damaged during handling",
				})
				.expect(200);

			expect(res.body.status).toBe("DAMAGED");
		});
	});

	// ==================== INVENTORY OVERVIEW & ANALYTICS ====================

	describe("GET /api/inventory/overview - Inventory Overview", () => {
		it("should get inventory overview for all warehouses", async () => {
			const res = await request(app.getHttpServer()).get("/api/inventory/overview").set("Authorization", `Bearer ${lspToken}`).expect(200);

			expect(Array.isArray(res.body)).toBe(true);
			expect(res.body.length).toBeGreaterThan(0);
			expect(res.body[0]).toHaveProperty("productName");
			expect(res.body[0]).toHaveProperty("warehouseName");
			expect(res.body[0]).toHaveProperty("totalQty");
			expect(res.body[0]).toHaveProperty("availableQty");
			expect(res.body[0]).toHaveProperty("reservedQty");
			expect(res.body[0]).toHaveProperty("quarantineQty");
			expect(res.body[0]).toHaveProperty("damagedQty");
		});

		it("should filter overview by warehouse", async () => {
			const res = await request(app.getHttpServer()).get("/api/inventory/overview").set("Authorization", `Bearer ${lspToken}`).query({ warehouseId }).expect(200);

			expect(res.body.every((item: any) => item.warehouseId === warehouseId)).toBe(true);
		});

		it("should show status breakdown correctly", async () => {
			const res = await request(app.getHttpServer()).get("/api/inventory/overview").set("Authorization", `Bearer ${lspToken}`).query({ warehouseId }).expect(200);

			const overview = res.body[0];
			expect(overview.totalQty).toBeGreaterThanOrEqual(overview.availableQty);
			expect(overview.totalQty).toBeGreaterThanOrEqual(overview.reservedQty);
			expect(overview.totalQty).toBeGreaterThanOrEqual(overview.damagedQty);
		});
	});

	describe("GET /api/inventory/consolidated - Consolidated Inventory", () => {
		it("should get consolidated inventory across warehouses", async () => {
			const res = await request(app.getHttpServer()).get("/api/inventory/consolidated").set("Authorization", `Bearer ${lspToken}`).expect(200);

			expect(Array.isArray(res.body)).toBe(true);
			expect(res.body[0]).toHaveProperty("productName");
			expect(res.body[0]).toHaveProperty("totalQty");
			expect(res.body[0]).toHaveProperty("warehouses");
			expect(Array.isArray(res.body[0].warehouses)).toBe(true);
		});

		it("should aggregate quantities across multiple warehouses", async () => {
			const res = await request(app.getHttpServer()).get("/api/inventory/consolidated").set("Authorization", `Bearer ${lspToken}`).expect(200);

			const productInventory = res.body.find((inv: any) => inv.productId === productId);
			expect(productInventory).toBeDefined();
			expect(productInventory.warehouses.length).toBeGreaterThanOrEqual(1);
		});
	});

	describe("GET /api/inventory/rack/:rackId - Rack Level Tracking", () => {
		it("should get all inventory in a specific rack", async () => {
			const res = await request(app.getHttpServer()).get(`/api/inventory/rack/${rackId}`).set("Authorization", `Bearer ${lspToken}`).expect(200);

			expect(Array.isArray(res.body)).toBe(true);
			res.body.forEach((loc: any) => {
				expect(loc.bin.rackId).toBe(rackId);
			});
		});

		it("should return empty array for rack with no inventory", async () => {
			// Create empty rack
			const emptyRack = await prisma.rack.create({
				data: {
					zoneId,
					name: "Rack-Empty",
					capacity: 200,
				},
			});

			const res = await request(app.getHttpServer()).get(`/api/inventory/rack/${emptyRack.id}`).set("Authorization", `Bearer ${lspToken}`).expect(200);

			expect(Array.isArray(res.body)).toBe(true);
			expect(res.body.length).toBe(0);
		});
	});

	describe("GET /api/inventory/reports/inventory - Generate Reports", () => {
		it("should generate hierarchical inventory report", async () => {
			const res = await request(app.getHttpServer()).get("/api/inventory/reports/inventory").set("Authorization", `Bearer ${lspToken}`).expect(200);

			expect(typeof res.body).toBe("object");
			const warehouseName = Object.keys(res.body)[0];
			expect(warehouseName).toBeDefined();

			// Verify hierarchical structure: warehouse -> zone -> rack -> bin
			const warehouse = res.body[warehouseName];
			const zoneName = Object.keys(warehouse)[0];
			expect(zoneName).toBeDefined();

			const zone = warehouse[zoneName];
			const rackName = Object.keys(zone)[0];
			expect(rackName).toBeDefined();
		});

		it("should filter report by warehouse", async () => {
			const res = await request(app.getHttpServer()).get("/api/inventory/reports/inventory").set("Authorization", `Bearer ${lspToken}`).query({ warehouseId }).expect(200);

			expect(typeof res.body).toBe("object");
		});

		it("should filter report by rack", async () => {
			const res = await request(app.getHttpServer()).get("/api/inventory/reports/inventory").set("Authorization", `Bearer ${lspToken}`).query({ rackId }).expect(200);

			expect(typeof res.body).toBe("object");
		});
	});

	describe("GET /api/inventory/product/:productId/warehouse/:warehouseId", () => {
		it("should get inventory for specific product in warehouse", async () => {
			const res = await request(app.getHttpServer()).get(`/api/inventory/product/${productId}/warehouse/${warehouseId}`).set("Authorization", `Bearer ${lspToken}`).expect(200);

			expect(res.body.productId).toBe(productId);
			expect(res.body.warehouseId).toBe(warehouseId);
			expect(res.body).toHaveProperty("locations");
			expect(res.body).toHaveProperty("product");
			expect(Array.isArray(res.body.locations)).toBe(true);
		});

		// it("should return null for non-existent product-warehouse combination", async () => {
		// 	const res = await request(app.getHttpServer()).get(`/api/inventory/product/${productId2}/warehouse/${warehouseId2}`).set("Authorization", `Bearer ${lspToken}`).expect(200);

		// 	expect(res.body).toBeNull();
		// });
	});

	// ==================== DELETE TESTS ====================

	describe("DELETE /api/inventory/locations/:id - Delete Location", () => {
		it("should delete inventory location and adjust totals", async () => {
			// Create a location to delete
			const createRes = await request(app.getHttpServer())
				.post("/api/inventory/locations")
				.set("Authorization", `Bearer ${lspToken}`)
				.send({
					inventoryId,
					binId,
					qty: 20,
					status: "AVAILABLE",
				})
				.expect(201);

			const locationToDelete = createRes.body.id;

			// Get current totals
			const binBefore = await prisma.bin.findUnique({ where: { id: binId } });
			const inventoryBefore = await prisma.inventory.findUnique({ where: { id: inventoryId } });

			// Delete
			await request(app.getHttpServer()).delete(`/api/inventory/locations/${locationToDelete}`).set("Authorization", `Bearer ${lspToken}`).expect(200);

			// Verify location deleted
			const deletedLocation = await prisma.inventoryLocation.findUnique({
				where: { id: locationToDelete },
			});
			expect(deletedLocation).toBeNull();

			// Verify bin decremented
			const binAfter = await prisma.bin.findUnique({ where: { id: binId } });
			expect(binAfter!.currentQty).toBe(binBefore!.currentQty - 20);

			// Verify inventory decremented
			const inventoryAfter = await prisma.inventory.findUnique({ where: { id: inventoryId } });
			expect(inventoryAfter!.totalQty).toBe(inventoryBefore!.totalQty - 20);
		});

		it("should return 404 when deleting non-existent location", async () => {
			await request(app.getHttpServer()).delete("/api/inventory/locations/non-existent-id").set("Authorization", `Bearer ${lspToken}`).expect(404);
		});

		it("should fail without authentication", async () => {
			await request(app.getHttpServer()).delete(`/api/inventory/locations/${inventoryLocationId}`).expect(401);
		});
	});

	// ==================== INTEGRATION TESTS ====================

	// describe("Integration: Complete Inventory Lifecycle", () => {
	// 	it("should handle complete inventory lifecycle from receipt to dispatch", async () => {
	// 		// 1. Create new product
	// 		const newProduct = await prisma.product.create({
	// 			data: {
	// 				sku: `TEST-LIFECYCLE-${Date.now()}`,
	// 				name: "Lifecycle Test Product",
	// 				unit: "pallets",
	// 			},
	// 		});

	// 		// 2. Create inventory record
	// 		const invRes = await request(app.getHttpServer())
	// 			.post("/api/inventory")
	// 			.set("Authorization", `Bearer ${lspToken}`)
	// 			.send({
	// 				productId: newProduct.id,
	// 				warehouseId,
	// 			})
	// 			.expect(201);

	// 		// 3. Receive goods - Create location (AVAILABLE)
	// 		const receiveRes = await request(app.getHttpServer())
	// 			.post("/api/inventory/locations")
	// 			.set("Authorization", `Bearer ${lspToken}`)
	// 			.send({
	// 				inventoryId: invRes.body.id,
	// 				binId,
	// 				qty: 100,
	// 				status: "AVAILABLE",
	// 				condition: "NEW",
	// 				lotNumber: "LIFECYCLE-LOT-001",
	// 			})
	// 			.expect(201);

	// 		const lifecycleLocationId = receiveRes.body.id;

	// 		// 4. Quality inspection - Move to QUARANTINE
	// 		await request(app.getHttpServer())
	// 			.patch(`/api/inventory/locations/${lifecycleLocationId}/status`)
	// 			.set("Authorization", `Bearer ${lspToken}`)
	// 			.send({
	// 				status: "QUARANTINE",
	// 				note: "Quality inspection in progress",
	// 			})
	// 			.expect(200);

	// 		// 5. Pass inspection - Move back to AVAILABLE
	// 		await request(app.getHttpServer())
	// 			.patch(`/api/inventory/locations/${lifecycleLocationId}/status`)
	// 			.set("Authorization", `Bearer ${lspToken}`)
	// 			.send({
	// 				status: "AVAILABLE",
	// 				note: "Quality check passed",
	// 			})
	// 			.expect(200);

	// 		// 6. Reserve for order
	// 		await request(app.getHttpServer())
	// 			.patch(`/api/inventory/locations/${lifecycleLocationId}/status`)
	// 			.set("Authorization", `Bearer ${lspToken}`)
	// 			.send({
	// 				status: "RESERVED",
	// 				note: "Reserved for order #999",
	// 			})
	// 			.expect(200);

	// 		// 7. Pick and move to staging area (different bin)
	// 		await request(app.getHttpServer())
	// 			.patch(`/api/inventory/locations/${lifecycleLocationId}`)
	// 			.set("Authorization", `Bearer ${warehouseManagerToken}`)
	// 			.send({
	// 				binId: binId2,
	// 				qty: 100,
	// 			})
	// 			.expect(200);

	// 		// 8. Dispatch - Delete location (goods shipped out)
	// 		await request(app.getHttpServer()).delete(`/api/inventory/locations/${lifecycleLocationId}`).set("Authorization", `Bearer ${lspToken}`).expect(200);

	// 		// Verify final state
	// 		const finalInventory = await prisma.inventory.findUnique({
	// 			where: { id: invRes.body.id },
	// 			include: { locations: true },
	// 		});

	// 		expect(finalInventory?.locations.length).toBe(0);
	// 		expect(finalInventory?.totalQty).toBe(0);
	// 	});
	// });

	// ==================== EDGE CASES & ERROR HANDLING ====================

	describe("Edge Cases and Error Handling", () => {
		// `it("should handle concurrent inventory location creations", async () => {
		// 	const promises = Array.from({ length: 5 }, (_, i) =>
		// 		request(app.getHttpServer())
		// 			.post("/api/inventory/locations")
		// 			.set("Authorization", `Bearer ${lspToken}`)
		// 			.send({
		// 				inventoryId,
		// 				binId,
		// 				qty: 5,
		// 				status: "AVAILABLE",
		// 				lotNumber: `CONCURRENT-${i}`,
		// 			})
		// 	);

		// 	const results = await Promise.allSettled(promises);

		// 	// Some should succeed, some might fail due to capacity
		// 	const succeeded = results.filter((r) => r.status === "fulfilled" && (r.value as any).status === 201);
		// 	expect(succeeded.length).toBeGreaterThan(0);
		// });`

		it("should handle invalid JSON in specialHandling", async () => {
			const res = await request(app.getHttpServer())
				.post("/api/inventory/locations")
				.set("Authorization", `Bearer ${lspToken}`)
				.send({
					inventoryId,
					binId,
					qty: 10,
					specialHandling: "invalid-json-string",
				})
				.expect(400);

			expect(res.body.message).toBeDefined();
		});

		it("should handle missing authorization header", async () => {
			await request(app.getHttpServer()).get("/api/inventory/locations").expect(401);
		});

		it("should handle invalid JWT token", async () => {
			await request(app.getHttpServer()).get("/api/inventory/locations").set("Authorization", "Bearer invalid-token").expect(401);
		});

		// it("should handle expired products gracefully", async () => {
		// 	const res = await request(app.getHttpServer())
		// 		.post("/api/inventory/locations")
		// 		.set("Authorization", `Bearer ${lspToken}`)
		// 		.send({
		// 			inventoryId,
		// 			binId,
		// 			qty: 10,
		// 			expiryDate: "2020-01-01", // Expired date
		// 			status: "AVAILABLE",
		// 		})
		// 		.expect(201);

		// 	expect(res.body.expiryDate).toBeDefined();
		// });

		it("should validate date formats", async () => {
			await request(app.getHttpServer())
				.post("/api/inventory/locations")
				.set("Authorization", `Bearer ${lspToken}`)
				.send({
					inventoryId,
					binId,
					qty: 10,
					expiryDate: "invalid-date",
				})
				.expect(400);
		});

		it("should handle zero quantity gracefully", async () => {
			await request(app.getHttpServer())
				.post("/api/inventory/locations")
				.set("Authorization", `Bearer ${lspToken}`)
				.send({
					inventoryId,
					binId,
					qty: 0,
				})
				.expect(400);
		});

		it("should prevent negative quantity updates", async () => {
			await request(app.getHttpServer())
				.patch(`/api/inventory/locations/${inventoryLocationId}`)
				.set("Authorization", `Bearer ${lspToken}`)
				.send({
					qty: -10,
				})
				.expect(400);
		});
	});

	// ==================== PERFORMANCE TESTS ====================

	describe("Performance and Load Testing", () => {
		it("should handle multiple concurrent updates to different locations", async () => {
			// Create multiple locations
			const locations = await Promise.all(
				Array.from({ length: 3 }, async (_, i) => {
					const res = await request(app.getHttpServer())
						.post("/api/inventory/locations")
						.set("Authorization", `Bearer ${lspToken}`)
						.send({
							inventoryId,
							binId: binId2,
							qty: 5,
							status: "AVAILABLE",
							lotNumber: `PERF-${i}`,
						});
					return res.body.id;
				})
			);

			// Update all concurrently
			const updates = locations.map((locId) => request(app.getHttpServer()).patch(`/api/inventory/locations/${locId}`).set("Authorization", `Bearer ${lspToken}`).send({ qty: 10 }));

			const results = await Promise.all(updates);

			results.forEach((res) => {
				expect(res.status).toBe(200);
				expect(res.body.qty).toBe(10);
			});
		});

		it("should handle bulk inventory listing efficiently", async () => {
			const startTime = Date.now();

			const res = await request(app.getHttpServer()).get("/api/inventory/locations").set("Authorization", `Bearer ${lspToken}`).expect(200);

			const endTime = Date.now();
			const duration = endTime - startTime;

			expect(Array.isArray(res.body)).toBe(true);
			expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
		});
	});

	// ==================== AUTHORIZATION & PERMISSIONS ====================

	describe("Authorization and Permissions", () => {
		it("should allow LSP users full access", async () => {
			const res = await request(app.getHttpServer()).get("/api/inventory/locations").set("Authorization", `Bearer ${lspToken}`).expect(200);

			expect(Array.isArray(res.body)).toBe(true);
		});

		// it("should allow warehouse managers to create locations", async () => {
		// 	const res = await request(app.getHttpServer())
		// 		.post("/api/inventory/locations")
		// 		.set("Authorization", `Bearer ${warehouseManagerToken}`)
		// 		.send({
		// 			inventoryId,
		// 			binId,
		// 			qty: 10,
		// 			status: "AVAILABLE",
		// 		})
		// 		.expect(201);

		// 	expect(res.body).toHaveProperty("id");
		// });

		it("should deny access without authentication", async () => {
			await request(app.getHttpServer()).get("/api/inventory/overview").expect(401);

			await request(app.getHttpServer()).get("/api/inventory/consolidated").expect(401);

			await request(app.getHttpServer()).get(`/api/inventory/rack/${rackId}`).expect(401);
		});
	});
});
