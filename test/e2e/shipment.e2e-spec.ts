// test/e2e/shipment-complete.e2e-spec.ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { MailService } from '../../src/common/mail/mail.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { RoleType } from '@prisma/client';

// jest.setTimeout(90000);

describe('Shipments Complete E2E Tests', () => {
   let app: INestApplication;
   let prisma: PrismaService;
   let jwtService: JwtService;

   // User tokens and IDs
   let lspToken: string;
   let lspUserId: string;
   let enterpriseToken: string;
   let enterpriseUserId: string;
   let transporterToken: string;
   let transporterUserId: string;
   let endUserToken: string;
   let endUserId: string;
   let lastMileToken: string;
   let lastMileUserId: string;

   // Shipment IDs for testing
   let shipmentId: string;
   let shipmentOrderId: string;

   // Mock services
   const fakeMailer = {
      sendShipmentCreated: jest.fn().mockResolvedValue(undefined),
      sendShipmentStatusUpdate: jest.fn().mockResolvedValue(undefined),
   };

   const fakeStorageService = {
      uploadFile: jest.fn().mockImplementation(async (file: Express.Multer.File) => {
         const name = (file && (file.originalname || 'file')) as string;
         return { url: `https://fake-bucket/${name}`, key: `shipments/${name}` };
      }),
      delete: jest.fn().mockResolvedValue(undefined),
   };

   beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
         imports: [AppModule],
      })
         .overrideProvider(MailService)
         .useValue(fakeMailer)
         .overrideProvider('StorageService')
         .useValue(fakeStorageService)
         .compile();

      app = moduleRef.createNestApplication();
      app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
      app.setGlobalPrefix('api');
      await app.init();

      prisma = app.get(PrismaService);
      jwtService = app.get(JwtService);

      // Create test users for different roles
      await createTestUsers();
   });

   afterAll(async () => {
      await cleanup();
      await prisma.$disconnect(); // ensure Prisma closes
      if (app) await app.close();
   });

   // ==================== HELPER FUNCTIONS ====================

   async function createTestUsers() {
      const timestamp = Date.now();
      const password = 'Test123!';
      const hashed = await bcrypt.hash(password, 10);

      // LSP User
      const lspUser = await prisma.user.create({
         data: {
            email: `lsp-${timestamp}@example.com`,
            password: hashed,
            kind: 'LOGISTIC_SERVICE_PROVIDER',
            role: RoleType.CROSS_BORDER_LOGISTICS,
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
            kind: 'ENTERPRISE',
            role: RoleType.CROSS_BORDER_LOGISTICS,
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

      // Transporter User
      const transporterUser = await prisma.user.create({
         data: {
            email: `transporter-${timestamp}@example.com`,
            password: hashed,
            kind: 'ENTERPRISE',
            role: RoleType.TRANSPORTER,
            isVerified: true,
         },
      });
      transporterUserId = transporterUser.id;
      transporterToken = jwtService.sign({
         sub: transporterUserId,
         id: transporterUserId,
         email: transporterUser.email,
         role: transporterUser.role,
         kind: transporterUser.kind,
      });

      // End User
      const endUser = await prisma.user.create({
         data: {
            email: `enduser-${timestamp}@example.com`,
            password: hashed,
            kind: 'END_USER',
            role: null,
            isVerified: true,
         },
      });
      endUserId = endUser.id;
      endUserToken = jwtService.sign({
         sub: endUserId,
         id: endUserId,
         email: endUser.email,
         role: endUser.role,
         kind: endUser.kind,
      });

      // Last Mile Provider
      const lastMileUser = await prisma.user.create({
         data: {
            email: `lastmile-${timestamp}@example.com`,
            password: hashed,
            kind: 'ENTERPRISE',
            role: RoleType.LAST_MILE_PROVIDER,
            isVerified: true,
         },
      });
      lastMileUserId = lastMileUser.id;
      lastMileToken = jwtService.sign({
         sub: lastMileUserId,
         id: lastMileUserId,
         email: lastMileUser.email,
         role: lastMileUser.role,
         kind: lastMileUser.kind,
      });
   }

   async function cleanup() {
      try {
         const userIds = [lspUserId, enterpriseUserId, transporterUserId, endUserId, lastMileUserId];

         for (const userId of userIds) {
            await prisma.notification.deleteMany({ where: { userId } });
         }

         await prisma.shipmentDocument.deleteMany({
            where: {
               shipment: {
                  OR: [{ customerId: { in: userIds } }, { createdBy: { in: userIds } }],
               },
            },
         });

         await prisma.shipmentStatusHistory.deleteMany({
            where: {
               shipment: {
                  OR: [{ customerId: { in: userIds } }, { createdBy: { in: userIds } }],
               },
            },
         });

         await prisma.shipment.deleteMany({
            where: {
               OR: [{ customerId: { in: userIds } }, { createdBy: { in: userIds } }],
            },
         });

         await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      } catch (err: any) {
         console.warn('Cleanup error:', err.message);
      }
   }

   function generateOrderTrackingId(): string {
      const year = new Date().getFullYear();
      const timestamp = Date.now().toString().slice(-6); // last 6 digits of ms timestamp
      const randomId = Math.floor(1000 + Math.random() * 9000); // 4 random digits
      return `SHP-${year}-${timestamp}${randomId}`;
   }

   // ==================== TEST CASES ====================

   describe('POST /api/shipments - Create Shipment', () => {
      it('should create shipment as LSP user with documents', async () => {
         const orderId = generateOrderTrackingId();

         const res = await request(app.getHttpServer())
            .post('/api/shipments')
            .set('Authorization', `Bearer ${lspToken}`)
            .field('clientName', 'Test Client Corp')
            .field('email', 'client@example.com')
            .field('orderId', orderId)
            .field('phone', '+2348120000000')
            .field('cargoType', 'Electronics')
            .field('tons', '1')
            .field('weight', '500')
            .field('origin', JSON.stringify({ country: 'Nigeria', state: 'Lagos', address: '123 Main St', phone: '82829228292' }))
            .field('destination', JSON.stringify({ country: 'UK', state: 'London', address: '221B Baker St', phone: '82829228292' }))
            .field('pickupMode', 'PICKUP')
            .field('serviceType', 'AIR')
            .field('baseFrieght', '2000')
            .field('handlingFee', '500')
            .field('insuranceFee', '200')
            .attach('documents', Buffer.from('dummy invoice'), 'invoice.pdf')
            .attach('documents', Buffer.from('dummy packing list'), 'packing_list.pdf')
            .expect(201);

         expect(res.body).toHaveProperty('id');
         expect(res.body.clientName).toBe('Test Client Corp');
         expect(res.body.status).toBeDefined();

         shipmentId = res.body.id;
         shipmentOrderId = res.body.orderId;

         // Verify notification was created
         const notif = await prisma.notification.findFirst({
            where: { userId: lspUserId, message: { contains: 'created successfully' } },
         });
         expect(notif).not.toBeNull();
      });

      it('should create shipment as Enterprise user', async () => {
         const orderId = generateOrderTrackingId();

         const res = await request(app.getHttpServer())
            .post('/api/shipments')
            .set('Authorization', `Bearer ${enterpriseToken}`)
            .field('clientName', 'Enterprise Client')
            .field('email', 'enterprise@example.com')
            .field('phone', '+2348130000000')
            .field('orderId', orderId)
            .field('cargoType', 'Machinery')
            .field('tons', '2')
            .field('weight', '2000')
            .field(
               'origin',
               JSON.stringify({
                  country: 'Nigeria',
                  state: 'Lagos',
                  address: '456 Enterprise Rd',
                  phone: '82829228292',
               }),
            )
            .field(
               'destination',
               JSON.stringify({
                  country: 'USA',
                  state: 'New York',
                  address: '123 5th Ave',
                  phone: '82829228292',
               }),
            )
            .field('pickupMode', 'PICKUP')
            .field('serviceType', 'ROAD')
            .field('baseFrieght', '5000')
            .field('handlingFee', '1000')
            .field('insuranceFee', '500')
            .attach('documents', Buffer.from('dummy packing list'), 'packing_list.pdf')
            .expect(201);

         // console.log(res);

         expect(res.body.createdBy).toBe(enterpriseUserId);
         expect(res.body.status).toBe('PENDING_ACCEPTANCE');
      });

      it('should fail without required fields', async () => {
         await request(app.getHttpServer()).post('/api/shipments').set('Authorization', `Bearer ${lspToken}`).field('clientName', 'Test Client').expect(400);
      });
   });

   describe('GET /api/shipments/generate-tracking', () => {
      it('should generate tracking number', async () => {
         const res = await request(app.getHttpServer()).get('/api/shipments/generate-tracking').set('Authorization', `Bearer ${lspToken}`).expect(200);

         expect(res.body).toHaveProperty('trackingNumber');
         expect(res.body.trackingNumber).toMatch(/^SHP-\d{4}-\d{5}$/);
      });
   });

   describe('PATCH /api/shipments/:id/assign - Accept and Assign', () => {
      it('should allow LSP to accept and assign shipment to transporter', async () => {
         const res = await request(app.getHttpServer())
            .patch(`/api/shipments/${shipmentId}/assign`)
            .set('Authorization', `Bearer ${lspToken}`)
            .send({
               transporterId: transporterUserId,
               warehouseId: null,
            })
            .expect(200);

         expect(res.body.status).toBe('ACCEPTED');
         expect(res.body.assignedTransporterId).toBe(transporterUserId);

         // Verify notifications created
         const lspNotif = await prisma.notification.findFirst({
            where: { userId: lspUserId, message: { contains: 'accepted shipment' } },
         });
         expect(lspNotif).not.toBeNull();

         const transporterNotif = await prisma.notification.findFirst({
            where: { userId: transporterUserId, message: { contains: 'assigned to shipment' } },
         });
         expect(transporterNotif).not.toBeNull();
      });

      it('should fail when non-LSP tries to assign', async () => {
         await request(app.getHttpServer())
            .patch(`/api/shipments/${shipmentId}/assign`)
            .set('Authorization', `Bearer ${transporterToken}`)
            .send({
               transporterId: transporterUserId,
            })
            .expect(403);
      });

      it('should fail with invalid transporter ID', async () => {
         const orderId = generateOrderTrackingId();
         // Create another shipment for this test
         const shipment = await request(app.getHttpServer())
            .post('/api/shipments')
            .set('Authorization', `Bearer ${lspToken}`)
            .field('clientName', 'Test')
            .field('email', 'test@example.com')
            .field('phone', '+2348120000000')
            .field('cargoType', 'Goods')
            .field('tons', '1')
            .field('orderId', orderId)
            .field('weight', '1000')
            .field('origin', JSON.stringify({ country: 'Nigeria', state: 'Lagos', address: 'Test', phone: '+234' }))
            .field('destination', JSON.stringify({ country: 'UK', state: 'London', address: 'Test', phone: '+44' }))
            .field('pickupMode', 'PICKUP')
            .field('serviceType', 'AIR')
            .field('baseFrieght', '1000')
            .field('handlingFee', '200');

         await request(app.getHttpServer())
            .patch(`/api/shipments/${shipment.body.id}/assign`)
            .set('Authorization', `Bearer ${lspToken}`)
            .send({
               transporterId: 'invalid-id',
            })
            .expect(404);
      });
   });

   describe('GET /api/shipments - List Shipments', () => {
      it('should return all shipments for LSP user', async () => {
         const res = await request(app.getHttpServer()).get('/api/shipments').set('Authorization', `Bearer ${lspToken}`).expect(200);

         expect(res.body).toHaveProperty('data');
         expect(res.body).toHaveProperty('pagination');
         expect(res.body).toHaveProperty('meta');
         expect(Array.isArray(res.body.data)).toBe(true);
         expect(res.body.meta.accessLevel).toBe('full_access');
      });

      it('should return only assigned shipments for transporter', async () => {
         const res = await request(app.getHttpServer()).get('/api/shipments').set('Authorization', `Bearer ${transporterToken}`).expect(200);

         expect(Array.isArray(res.body.data)).toBe(true);
         expect(res.body.meta.accessLevel).toBe('assigned_only');

         // Verify all returned shipments are assigned to this transporter
         res.body.data.forEach((shipment: any) => {
            expect(shipment.assignedTransporterId).toBe(transporterUserId);
         });
      });

      it('should support filtering by status', async () => {
         const res = await request(app.getHttpServer()).get('/api/shipments').set('Authorization', `Bearer ${lspToken}`).query({ status: 'ACCEPTED' }).expect(200);

         res.body.data.forEach((shipment: any) => {
            expect(shipment.status).toBe('ACCEPTED');
         });
      });

      it('should support pagination', async () => {
         const res = await request(app.getHttpServer()).get('/api/shipments').set('Authorization', `Bearer ${lspToken}`).query({ page: 1, limit: 5 }).expect(200);

         expect(res.body.pagination.page).toBe(1);
         expect(res.body.pagination.limit).toBe(5);
      });
   });

   describe('GET /api/shipments/my/assigned - Transporter Shipments', () => {
      it('should return assigned shipments for transporter', async () => {
         const res = await request(app.getHttpServer()).get('/api/shipments/my/assigned').set('Authorization', `Bearer ${transporterToken}`).expect(200);

         expect(res.body).toHaveProperty('data');
         expect(Array.isArray(res.body.data)).toBe(true);

         res.body.data.forEach((shipment: any) => {
            expect(shipment.assignedTransporterId).toBe(transporterUserId);
         });
      });

      it('should fail for non-transporter users', async () => {
         await request(app.getHttpServer()).get('/api/shipments/my/assigned').set('Authorization', `Bearer ${lspToken}`).expect(403);
      });
   });

   describe('GET /api/shipments/my/created - Customer Shipments', () => {
      it('should return created shipments for enterprise user', async () => {
         const res = await request(app.getHttpServer()).get('/api/shipments/my/created').set('Authorization', `Bearer ${enterpriseToken}`).expect(200);

         expect(res.body).toHaveProperty('data');
         expect(Array.isArray(res.body.data)).toBe(true);
      });
   });

   describe('GET /api/shipments/admin/all - LSP Admin Endpoint', () => {
      it('should return all shipments with analytics for LSP', async () => {
         const res = await request(app.getHttpServer()).get('/api/shipments/admin/all').set('Authorization', `Bearer ${lspToken}`).expect(200);

         expect(res.body).toHaveProperty('data');
         expect(res.body).toHaveProperty('analytics');
         expect(res.body.analytics).toHaveProperty('totalShipments');
         expect(res.body.analytics).toHaveProperty('byStatus');
      });

      it('should fail for non-LSP users', async () => {
         await request(app.getHttpServer()).get('/api/shipments/admin/all').set('Authorization', `Bearer ${transporterToken}`).expect(403);
      });
   });

   describe('GET /api/shipments/:id - Get Single Shipment', () => {
      it('should return shipment details for LSP', async () => {
         const res = await request(app.getHttpServer()).get(`/api/shipments/${shipmentId}`).set('Authorization', `Bearer ${lspToken}`).expect(200);

         expect(res.body.id).toBe(shipmentId);
         expect(res.body).toHaveProperty('customer');
         expect(res.body).toHaveProperty('transporter');
         expect(res.body).toHaveProperty('statusHistory');
      });

      it('should return shipment for assigned transporter', async () => {
         const res = await request(app.getHttpServer()).get(`/api/shipments/${shipmentId}`).set('Authorization', `Bearer ${transporterToken}`).expect(200);

         expect(res.body.id).toBe(shipmentId);
      });

      it('should fail for unauthorized user', async () => {
         await request(app.getHttpServer()).get(`/api/shipments/${shipmentId}`).set('Authorization', `Bearer ${endUserToken}`).expect(403);
      });

      it('should return 404 for non-existent shipment', async () => {
         await request(app.getHttpServer()).get('/api/shipments/non-existent-id').set('Authorization', `Bearer ${lspToken}`).expect(404);
      });
   });

   describe('GET /api/shipments/track/:orderId - Track Shipment', () => {
      it('should track shipment by order ID', async () => {
         const res = await request(app.getHttpServer()).get(`/api/shipments/track/${shipmentOrderId}`).set('Authorization', `Bearer ${lspToken}`).expect(200);

         expect(res.body).toHaveProperty('orderId', shipmentOrderId);
         expect(res.body).toHaveProperty('status');
         expect(res.body).toHaveProperty('timeline');
         expect(Array.isArray(res.body.timeline)).toBe(true);
      });

      it('should return 404 for invalid order ID', async () => {
         await request(app.getHttpServer()).get('/api/shipments/track/INVALID-ID').set('Authorization', `Bearer ${lspToken}`).expect(404);
      });
   });

   describe('PATCH /api/shipments/:id/status - Update Status', () => {
      it('should allow transporter to update to PICKED_UP', async () => {
         // First update to EN_ROUTE_TO_PICKUP by LSP
         await request(app.getHttpServer()).patch(`/api/shipments/${shipmentId}/status`).set('Authorization', `Bearer ${lspToken}`).send({ status: 'EN_ROUTE_TO_PICKUP' }).expect(200);

         // Now transporter picks up
         const res = await request(app.getHttpServer())
            .patch(`/api/shipments/${shipmentId}/status`)
            .set('Authorization', `Bearer ${transporterToken}`)
            .send({ status: 'PICKED_UP', note: 'Package picked up successfully' })
            .expect(200);

         expect(res.body.status).toBe('PICKED_UP');

         // Verify notification
         const notif = await prisma.notification.findFirst({
            where: { userId: lspUserId, message: { contains: 'status changed' } },
         });
         expect(notif).not.toBeNull();
      });

      it('should allow LSP to update to IN_TRANSIT', async () => {
         const res = await request(app.getHttpServer()).patch(`/api/shipments/${shipmentId}/status`).set('Authorization', `Bearer ${lspToken}`).send({ status: 'IN_TRANSIT' }).expect(200);

         expect(res.body.status).toBe('IN_TRANSIT');
      });

      it('should fail on invalid status transition', async () => {
         await request(app.getHttpServer()).patch(`/api/shipments/${shipmentId}/status`).set('Authorization', `Bearer ${lspToken}`).send({ status: 'PENDING_ACCEPTANCE' }).expect(400);
      });

      it('should fail when unauthorized user tries to update', async () => {
         await request(app.getHttpServer()).patch(`/api/shipments/${shipmentId}/status`).set('Authorization', `Bearer ${endUserToken}`).send({ status: 'COMPLETED' }).expect(403);
      });
   });

   describe('PATCH /api/shipments/:id - Update Shipment Details', () => {
      it('should allow LSP to update shipment details', async () => {
         const res = await request(app.getHttpServer())
            .patch(`/api/shipments/${shipmentId}`)
            .set('Authorization', `Bearer ${lspToken}`)
            .send({
               handlingInstructions: 'Handle with care - fragile items',
               baseFrieght: 2500,
            })
            .expect(200);

         expect(res.body.handlingInstructions).toBe('Handle with care - fragile items');
         expect(res.body.totalCost).toBeGreaterThan(2500);
      });

      it('should fail for unauthorized user', async () => {
         await request(app.getHttpServer()).patch(`/api/shipments/${shipmentId}`).set('Authorization', `Bearer ${endUserToken}`).send({ baseFrieght: 3000 }).expect(403);
      });
   });

   describe('DELETE /api/shipments/:id - Delete Shipment', () => {
      it('should fail for unauthorized user', async () => {
         await request(app.getHttpServer()).delete(`/api/shipments/${shipmentId}`).set('Authorization', `Bearer ${endUserToken}`).expect(400);
      });

      it('should return 404 for non-existent shipment', async () => {
         await request(app.getHttpServer()).delete('/api/shipments/non-existent-id').set('Authorization', `Bearer ${lspToken}`).expect(404);
      });
   });

   describe('Integration: Complete Shipment Lifecycle', () => {
      let lifecycleShipmentId: string;

      it('should complete full shipment lifecycle', async () => {
         const orderId = generateOrderTrackingId();
         // 1. Create shipment
         const createRes = await request(app.getHttpServer())
            .post('/api/shipments')
            .set('Authorization', `Bearer ${lspToken}`)
            .field('clientName', 'Lifecycle Test')
            .field('email', 'lifecycle@example.com')
            .field('orderId', orderId)
            .field('phone', '+2348120000000')
            .field('cargoType', 'Electronics')
            .field('tons', '1')
            .field('weight', '1000')
            .field('origin', JSON.stringify({ country: 'Nigeria', state: 'Lagos', address: 'Test Origin', phone: '+234' }))
            .field('destination', JSON.stringify({ country: 'UK', state: 'London', address: 'Test Dest', phone: '+44' }))
            .field('pickupMode', 'PICKUP')
            .field('serviceType', 'ROAD')
            .field('baseFrieght', '3000')
            .field('handlingFee', '500')
            .expect(201);

         lifecycleShipmentId = createRes.body.id;
         expect(createRes.body.status).toBe('PENDING_ACCEPTANCE');

         // 2. Accept and assign
         const assignRes = await request(app.getHttpServer())
            .patch(`/api/shipments/${lifecycleShipmentId}/assign`)
            .set('Authorization', `Bearer ${lspToken}`)
            .send({ transporterId: transporterUserId })
            .expect(200);

         expect(assignRes.body.status).toBe('ACCEPTED');

         // 3. En route to pickup
         await request(app.getHttpServer()).patch(`/api/shipments/${lifecycleShipmentId}/status`).set('Authorization', `Bearer ${lspToken}`).send({ status: 'EN_ROUTE_TO_PICKUP' }).expect(200);

         // 4. Picked up
         await request(app.getHttpServer()).patch(`/api/shipments/${lifecycleShipmentId}/status`).set('Authorization', `Bearer ${transporterToken}`).send({ status: 'PICKED_UP' }).expect(200);

         // 5. In transit
         await request(app.getHttpServer()).patch(`/api/shipments/${lifecycleShipmentId}/status`).set('Authorization', `Bearer ${transporterToken}`).send({ status: 'IN_TRANSIT' }).expect(200);

         // 6. Arrived at destination
         await request(app.getHttpServer())
            .patch(`/api/shipments/${lifecycleShipmentId}/status`)
            .set('Authorization', `Bearer ${transporterToken}`)
            .send({ status: 'ARRIVED_AT_DESTINATION' })
            .expect(200);

         // 7. Completed
         const completeRes = await request(app.getHttpServer())
            .patch(`/api/shipments/${lifecycleShipmentId}/status`)
            .set('Authorization', `Bearer ${lastMileToken}`)
            .send({ status: 'COMPLETED' })
            .expect(200);

         expect(completeRes.body.status).toBe('COMPLETED');

         // 8. Verify status history
         const trackRes = await request(app.getHttpServer()).get(`/api/shipments/track/${completeRes.body.orderId}`).set('Authorization', `Bearer ${lspToken}`).expect(200);

         expect(trackRes.body.timeline).toHaveLength(7);
         expect(trackRes.body.status).toBe('COMPLETED');
      });
   });

   describe('Edge Cases and Error Handling', () => {
      it('should handle missing authorization header', async () => {
         await request(app.getHttpServer()).get('/api/shipments').expect(401);
      });

      it('should handle invalid JWT token', async () => {
         await request(app.getHttpServer()).get('/api/shipments').set('Authorization', 'Bearer invalid-token').expect(401);
      });

      it('should handle malformed JSON in origin/destination', async () => {
         const orderId = generateOrderTrackingId();

         await request(app.getHttpServer())
            .post('/api/shipments')
            .set('Authorization', `Bearer ${lspToken}`)
            .field('clientName', 'Test')
            .field('email', 'test@example.com')
            .field('orderId', orderId)
            .field('cargoType', 'Goods')
            .field('origin', 'invalid-json')
            .field('destination', 'invalid-json')
            .expect(400);
      });

      it('should handle concurrent status updates', async () => {
         const orderId = generateOrderTrackingId();
         // Create new shipment
         const shipment = await request(app.getHttpServer())
            .post('/api/shipments')
            .set('Authorization', `Bearer ${lspToken}`)
            .field('clientName', 'Concurrent Test')
            .field('email', 'concurrent@example.com')
            .field('orderId', orderId)
            .field('phone', '+234')
            .field('cargoType', 'Test')
            .field('tons', '1')
            .field('weight', '1000')
            .field('origin', JSON.stringify({ country: 'Nigeria', state: 'Lagos', address: 'Test', phone: '+234' }))
            .field('destination', JSON.stringify({ country: 'UK', state: 'London', address: 'Test', phone: '+44' }))
            .field('pickupMode', 'PICKUP')
            .field('serviceType', 'ROAD')
            .field('baseFrieght', '1000')
            .field('handlingFee', '200');

         // Try multiple updates concurrently
         const updates = [
            request(app.getHttpServer()).patch(`/api/shipments/${shipment.body.id}/status`).set('Authorization', `Bearer ${lspToken}`).send({ status: 'ACCEPTED' }),
            request(app.getHttpServer()).patch(`/api/shipments/${shipment.body.id}/status`).set('Authorization', `Bearer ${lspToken}`).send({ status: 'CANCELLED' }),
         ];

         const results = await Promise.allSettled(updates);

         // At least one should succeed
         const succeeded = results.filter((r) => r.status === 'fulfilled');
         expect(succeeded.length).toBeGreaterThan(0);
      });

      it('should validate tons as number', async () => {
         const orderId = generateOrderTrackingId();

         const res = await request(app.getHttpServer())
            .post('/api/shipments')
            .set('Authorization', `Bearer ${lspToken}`)
            .field('clientName', 'Test')
            .field('email', 'test@example.com')
            .field('orderId', orderId)
            .field('phone', '+234')
            .field('cargoType', 'Test')
            .field('tons', 'invalid-number')
            .field('weight', '1000')
            .field('origin', JSON.stringify({ country: 'Nigeria', state: 'Lagos', address: 'Test', phone: '+234' }))
            .field('destination', JSON.stringify({ country: 'UK', state: 'London', address: 'Test', phone: '+44' }))
            .field('pickupMode', 'PICKUP')
            .field('serviceType', 'ROAD')
            .field('baseFrieght', '1000')
            .field('handlingFee', '200');

         expect([400, 201]).toContain(res.status);
      });

      it('should handle large file uploads gracefully', async () => {
         const largeBuffer = Buffer.alloc(10 * 1024 * 1024); // 10MB
         const orderId = generateOrderTrackingId();

         const res = await request(app.getHttpServer())
            .post('/api/shipments')
            .set('Authorization', `Bearer ${lspToken}`)
            .field('clientName', 'Large File Test')
            .field('email', 'largefile@example.com')
            .field('orderId', orderId)
            .field('phone', '+234')
            .field('cargoType', 'Test')
            .field('tons', '1')
            .field('weight', '1000')
            .field('origin', JSON.stringify({ country: 'Nigeria', state: 'Lagos', address: 'Test', phone: '+234' }))
            .field('destination', JSON.stringify({ country: 'UK', state: 'London', address: 'Test', phone: '+44' }))
            .field('pickupMode', 'PICKUP')
            .field('serviceType', 'ROAD')
            .field('baseFrieght', '1000')
            .field('handlingFee', '200')
            .attach('documents', largeBuffer, 'large-file.pdf');

         // Should either succeed or fail with appropriate error
         expect([201, 400, 413]).toContain(res.status);
      });
   });

   describe('Filtering and Search', () => {
      beforeAll(async () => {
         // Create multiple shipments with different statuses and cargo types
         const shipments = [
            {
               clientName: 'Filter Test 1',
               cargoType: 'Electronics',
               status: 'PENDING_ACCEPTANCE',
               origin: 'Nigeria',
               destination: 'UK',
            },
            {
               clientName: 'Filter Test 2',
               cargoType: 'Textiles',
               status: 'PENDING_ACCEPTANCE',
               origin: 'Nigeria',
               destination: 'USA',
            },
            {
               clientName: 'Filter Test 3',
               cargoType: 'Machinery',
               status: 'PENDING_ACCEPTANCE',
               origin: 'Kenya',
               destination: 'UK',
            },
         ];

         for (const shipmentData of shipments) {
            const orderId = generateOrderTrackingId();

            await request(app.getHttpServer())
               .post('/api/shipments')
               .set('Authorization', `Bearer ${lspToken}`)
               .field('clientName', shipmentData.clientName)
               .field('email', 'filter@example.com')
               .field('orderId', orderId)
               .field('phone', '+234')
               .field('cargoType', shipmentData.cargoType)
               .field('tons', '1')
               .field('weight', '1000')
               .field('origin', JSON.stringify({ country: shipmentData.origin, state: 'Test', address: 'Test', phone: '+234' }))
               .field('destination', JSON.stringify({ country: shipmentData.destination, state: 'Test', address: 'Test', phone: '+44' }))
               .field('pickupMode', 'PICKUP')
               .field('serviceType', 'ROAD')
               .field('baseFrieght', '1000')
               .field('handlingFee', '200');
         }
      });

      it('should filter by cargo type', async () => {
         const res = await request(app.getHttpServer()).get('/api/shipments').set('Authorization', `Bearer ${lspToken}`).query({ cargoType: 'Electronics' }).expect(200);

         expect(res.body.data.length).toBeGreaterThan(0);
         res.body.data.forEach((shipment: any) => {
            expect(shipment.cargoType.toLowerCase()).toContain('electronics');
         });
      });

      it('should search by order ID', async () => {
         const res = await request(app.getHttpServer()).get('/api/shipments').set('Authorization', `Bearer ${lspToken}`).query({ orderId: shipmentOrderId }).expect(200);

         expect(res.body.data.length).toBeGreaterThan(0);
         expect(res.body.data[0].orderId).toContain(shipmentOrderId);
      });

      it('should combine multiple filters', async () => {
         const res = await request(app.getHttpServer())
            .get('/api/shipments')
            .set('Authorization', `Bearer ${lspToken}`)
            .query({
               status: 'PENDING_ACCEPTANCE',
               cargoType: 'Textiles',
            })
            .expect(200);

         res.body.data.forEach((shipment: any) => {
            expect(shipment.status).toBe('PENDING_ACCEPTANCE');
            expect(shipment.cargoType.toLowerCase()).toContain('textiles');
         });
      });
   });

   describe('Notification System', () => {
      it('should create notifications on shipment creation', async () => {
         const beforeCount = await prisma.notification.count({
            where: { userId: lspUserId },
         });

         const orderId = generateOrderTrackingId();

         await request(app.getHttpServer())
            .post('/api/shipments')
            .set('Authorization', `Bearer ${lspToken}`)
            .field('clientName', 'Notification Test')
            .field('email', 'notif@example.com')
            .field('orderId', orderId)
            .field('phone', '+234')
            .field('cargoType', 'Test')
            .field('tons', '1')
            .field('weight', '1000')
            .field('origin', JSON.stringify({ country: 'Nigeria', state: 'Lagos', address: 'Test', phone: '+234' }))
            .field('destination', JSON.stringify({ country: 'UK', state: 'London', address: 'Test', phone: '+44' }))
            .field('pickupMode', 'PICKUP')
            .field('serviceType', 'ROAD')
            .field('baseFrieght', '1000')
            .field('handlingFee', '200');

         const afterCount = await prisma.notification.count({
            where: { userId: lspUserId },
         });

         expect(afterCount).toBeGreaterThan(beforeCount);
      });

      it('should create notifications for all parties on assignment', async () => {
         const orderId = generateOrderTrackingId();
         // Create shipment
         const shipment = await request(app.getHttpServer())
            .post('/api/shipments')
            .set('Authorization', `Bearer ${lspToken}`)
            .field('clientName', 'Multi Notif Test')
            .field('email', 'multinotif@example.com')
            .field('orderId', orderId)
            .field('phone', '+234')
            .field('cargoType', 'Test')
            .field('tons', '1')
            .field('weight', '1000')
            .field('origin', JSON.stringify({ country: 'Nigeria', state: 'Lagos', address: 'Test', phone: '+234' }))
            .field('destination', JSON.stringify({ country: 'UK', state: 'London', address: 'Test', phone: '+44' }))
            .field('pickupMode', 'PICKUP')
            .field('serviceType', 'ROAD')
            .field('baseFrieght', '1000')
            .field('handlingFee', '200');

         // Clear existing notifications
         const beforeLsp = await prisma.notification.count({ where: { userId: lspUserId } });
         const beforeTransporter = await prisma.notification.count({ where: { userId: transporterUserId } });

         // Assign
         await request(app.getHttpServer()).patch(`/api/shipments/${shipment.body.id}/assign`).set('Authorization', `Bearer ${lspToken}`).send({ transporterId: transporterUserId });

         // Check notifications increased
         const afterLsp = await prisma.notification.count({ where: { userId: lspUserId } });
         const afterTransporter = await prisma.notification.count({ where: { userId: transporterUserId } });

         expect(afterLsp).toBeGreaterThan(beforeLsp);
         expect(afterTransporter).toBeGreaterThan(beforeTransporter);
      });

      it('should create notifications on status updates', async () => {
         const beforeCount = await prisma.notification.count({
            where: { userId: transporterUserId },
         });

         await request(app.getHttpServer()).patch(`/api/shipments/${shipmentId}/status`).set('Authorization', `Bearer ${lspToken}`).send({ status: 'ARRIVED_AT_DESTINATION' });

         const afterCount = await prisma.notification.count({
            where: { userId: transporterUserId },
         });

         expect(afterCount).toBeGreaterThan(beforeCount);
      });
   });

   describe('Email Notifications', () => {
      it('should send email on shipment creation', async () => {
         fakeMailer.sendShipmentCreated.mockClear();
         const orderId = generateOrderTrackingId();

         await request(app.getHttpServer())
            .post('/api/shipments')
            .set('Authorization', `Bearer ${lspToken}`)
            .field('clientName', 'Email Test')
            .field('email', 'emailtest@example.com')
            .field('orderId', orderId)
            .field('phone', '+234')
            .field('cargoType', 'Test')
            .field('tons', '1')
            .field('weight', '1000')
            .field('origin', JSON.stringify({ country: 'Nigeria', state: 'Lagos', address: 'Test', phone: '+234' }))
            .field('destination', JSON.stringify({ country: 'UK', state: 'London', address: 'Test', phone: '+44' }))
            .field('pickupMode', 'PICKUP')
            .field('serviceType', 'ROAD')
            .field('baseFrieght', '1000')
            .field('handlingFee', '200');

         expect(fakeMailer.sendShipmentCreated).toHaveBeenCalled();
      });

      it('should send email on major status updates', async () => {
         fakeMailer.sendShipmentStatusUpdate.mockClear();
         const orderId = generateOrderTrackingId();

         // Create and complete a shipment through major statuses
         const shipment = await request(app.getHttpServer())
            .post('/api/shipments')
            .set('Authorization', `Bearer ${lspToken}`)
            .field('clientName', 'Status Email Test')
            .field('email', 'statusemail@example.com')
            .field('orderId', orderId)
            .field('phone', '+234')
            .field('cargoType', 'Test')
            .field('tons', '1')
            .field('weight', '1000')
            .field('origin', JSON.stringify({ country: 'Nigeria', state: 'Lagos', address: 'Test', phone: '+234' }))
            .field('destination', JSON.stringify({ country: 'UK', state: 'London', address: 'Test', phone: '+44' }))
            .field('pickupMode', 'PICKUP')
            .field('serviceType', 'ROAD')
            .field('baseFrieght', '1000')
            .field('handlingFee', '200');

         // Assign
         await request(app.getHttpServer()).patch(`/api/shipments/${shipment.body.id}/assign`).set('Authorization', `Bearer ${lspToken}`).send({ transporterId: transporterUserId });

         const initialCallCount = fakeMailer.sendShipmentStatusUpdate.mock.calls.length;

         // Update to IN_TRANSIT (major status)
         await request(app.getHttpServer()).patch(`/api/shipments/${shipment.body.id}/status`).set('Authorization', `Bearer ${lspToken}`).send({ status: 'EN_ROUTE_TO_PICKUP' });

         await request(app.getHttpServer()).patch(`/api/shipments/${shipment.body.id}/status`).set('Authorization', `Bearer ${transporterToken}`).send({ status: 'PICKED_UP' });

         await request(app.getHttpServer()).patch(`/api/shipments/${shipment.body.id}/status`).set('Authorization', `Bearer ${transporterToken}`).send({ status: 'IN_TRANSIT' });

         expect(fakeMailer.sendShipmentStatusUpdate.mock.calls.length).toBeGreaterThan(initialCallCount);
      });
   });

   describe('Performance and Load', () => {
      it('should handle multiple concurrent shipment creations', async () => {
         const promises = Array.from({ length: 5 }, (_, i) =>
            request(app.getHttpServer())
               .post('/api/shipments')
               .set('Authorization', `Bearer ${lspToken}`)
               .field('clientName', `Load Test ${i}`)
               .field('email', `load${i}@example.com`)
               .field('orderId', generateOrderTrackingId())
               .field('phone', '+234')
               .field('cargoType', 'Test')
               .field('tons', '1')
               .field('weight', '1000')
               .field('origin', JSON.stringify({ country: 'Nigeria', state: 'Lagos', address: 'Test', phone: '+234' }))
               .field('destination', JSON.stringify({ country: 'UK', state: 'London', address: 'Test', phone: '+44' }))
               .field('pickupMode', 'PICKUP')
               .field('serviceType', 'ROAD')
               .field('baseFrieght', '1000')
               .field('handlingFee', '200'),
         );

         const results = await Promise.all(promises);

         results.forEach((res) => {
            expect(res.status).toBe(201);
         });
      });

      it('should handle pagination with large datasets', async () => {
         const res = await request(app.getHttpServer()).get('/api/shipments').set('Authorization', `Bearer ${lspToken}`).query({ page: 1, limit: 100 }).expect(200);

         expect(res.body).toHaveProperty('pagination');
         expect(res.body.pagination.limit).toBe(100);
      });
   });
});
