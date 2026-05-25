// test/e2e/warehouses.e2e-spec.ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { MailService } from '../../src/common/mail/mail.service';
const { createTestUserWithCompany } = require('./utils/createTestUser');

jest.setTimeout(120000);

describe('Warehouses (e2e)', () => {
   let app: INestApplication;
   let prisma: PrismaService;

   let companyId: string | undefined;
   let warehouseId: string;
   let accessToken: string;

   // Fake mailer to avoid sending real emails
   const fakeMailer = {
      sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
      sendResetPasswordEmail: jest.fn().mockResolvedValue(undefined),
   };

   // Fake storage (Cloudinary) to avoid real uploads / file validation
   const fakeStorageService = {
      uploadFile: jest.fn().mockImplementation(async (file: Express.Multer.File, opts?: any) => {
         const name = (file && (file.originalname || 'file')) as string;
         return { url: `https://storage.test/${name}`, key: `test/${name}` };
      }),
      delete: jest.fn().mockResolvedValue(undefined),
   };

   beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
         imports: [AppModule],
      })
         // override storage and mail providers so file uploads and emails are faked
         .overrideProvider('StorageService')
         .useValue(fakeStorageService)
         .overrideProvider(MailService)
         .useValue(fakeMailer)
         .compile();

      app = moduleRef.createNestApplication();
      app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
      app.setGlobalPrefix('api');
      await app.init();

      prisma = app.get(PrismaService);

      // Use helper to create company + user and get an access token
      const u = await createTestUserWithCompany(prisma, app, {
         // optional overrides can go here if needed
      });

      companyId = u.companyId;
      accessToken = u.accessToken;
   });

   afterAll(async () => {
      try {
         if (companyId) {
            // remove warehouses and related test data first
            await prisma.warehouse.deleteMany({ where: { companyId } });

            // remove users belonging to company
            await prisma.user.deleteMany({ where: { companyId } });

            // remove tokens (optional)
            await prisma.verificationToken.deleteMany({ where: { user: { companyId } } });
            await prisma.passwordResetToken.deleteMany({ where: { user: { companyId } } });
            await prisma.refreshToken.deleteMany({ where: { user: { companyId } } });

            // finally delete the company
            await prisma.company.delete({ where: { id: companyId } });
         } else {
            // fallback cleanup if companyId missing: wipe any leftover test artifacts by email pattern
            await prisma.warehouse.deleteMany({ where: { name: { contains: 'Main Warehouse' } } });
            await prisma.user.deleteMany({ where: { email: { contains: 'e2e-user-' } } });
            await prisma.company.deleteMany({ where: { emailAddress: { contains: 'e2e-company-' } } });
         }
      } catch (err) {
         console.error('Cleanup failed:', err);
      } finally {
         if (app) await app.close();
      }
   });

   it('should create a warehouse', async () => {
      const payload = {
         companyId,
         name: 'Main Warehouse',
         country: 'Nigeria',
         city: 'Lagos',
         address: '123 Market St',
         totalCapacity: 1000,
         capacityUnit: 'pieces',
         numZones: 2,
         numRows: 4,
         numRacks: 8,
         numBinsPerRack: 12,
      };

      const res = await request(app.getHttpServer()).post('/api/warehouses').set('Authorization', `Bearer ${accessToken}`).send(payload).expect(201);

      expect(res.body).toEqual(
         expect.objectContaining({
            ok: true,
            warehouse: expect.objectContaining({
               name: payload.name,
               companyId,
            }),
         }),
      );

      warehouseId = res.body.warehouse.id;
   });

   it('should get warehouse by id', async () => {
      const res = await request(app.getHttpServer()).get(`/api/warehouses/${warehouseId}`).set('Authorization', `Bearer ${accessToken}`).expect(200);

      expect(res.body).toEqual(
         expect.objectContaining({
            id: warehouseId,
            companyId,
            name: 'Main Warehouse',
            computedStatus: 'ACTIVE',
         }),
      );
   });

   it('should update warehouse', async () => {
      const updatePayload = {
         city: 'Abuja',
         totalCapacity: 1200,
      };

      const res = await request(app.getHttpServer()).patch(`/api/warehouses/${warehouseId}`).set('Authorization', `Bearer ${accessToken}`).send(updatePayload).expect(200);

      expect(res.body).toEqual(
         expect.objectContaining({
            id: warehouseId,
            city: 'Abuja',
            totalCapacity: 1200,
         }),
      );
   });

   it('should list warehouses for company', async () => {
      const res = await request(app.getHttpServer()).get(`/api/warehouses?companyId=${companyId}`).set('Authorization', `Bearer ${accessToken}`).expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0]).toHaveProperty('id', warehouseId);
      expect(res.body[0]).toHaveProperty('companyId', companyId);
   });

   it('should delete warehouse', async () => {
      const res = await request(app.getHttpServer()).delete(`/api/warehouses/${warehouseId}`).set('Authorization', `Bearer ${accessToken}`).expect(200);

      expect(res.body).toEqual({ ok: true });

      const wh = await prisma.warehouse.findUnique({ where: { id: warehouseId } });
      expect(wh).toBeNull();
   });
});
