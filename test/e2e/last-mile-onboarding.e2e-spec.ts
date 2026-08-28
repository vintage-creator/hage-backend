// test/e2e/last-mile-onboarding.e2e-spec.ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { MailService } from '../../src/common/mail/mail.service';

jest.setTimeout(120000);

describe('Last Mile Provider Onboarding (e2e)', () => {
   let app: INestApplication;
   let prisma: PrismaService;

   const fakeMailer = {
      sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
   };

   const fakeStorageService = {
      uploadFile: jest.fn().mockImplementation(async (file: Express.Multer.File) => {
         const name = (file && (file.originalname || 'file')) as string;
         return { url: `https://storage.test/${name}`, key: `test/${name}` };
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
      app.setGlobalPrefix('api', {
         exclude: ['verify-email', 'reset-password'],
      });

      await app.init();
      prisma = app.get(PrismaService);
   });

   afterAll(async () => {
      try {
         await prisma.verificationToken.deleteMany({
            where: { user: { email: { contains: 'e2e-lm-' } } },
         });
         await prisma.trackingDocument.deleteMany({
            where: { company: { emailAddress: { contains: 'e2e-lm-' } } },
         });
         await prisma.user.deleteMany({
            where: { email: { contains: 'e2e-lm-' } },
         });
         await prisma.company.deleteMany({
            where: { emailAddress: { contains: 'e2e-lm-' } },
         });
      } catch (err) {
         console.error('Cleanup failed:', err);
      } finally {
         if (app) await app.close();
      }
   });

   it('should fail if required file fields are missing', async () => {
      const email = `e2e-lm-missing-files@example.com`;
      const res = await request(app.getHttpServer())
         .post('/api/auth/register-last-mile-provider')
         .field('name', 'John Missing')
         .field('email', email)
         .field('phone', '+2348000000100')
         .field('businessName', 'Missing Docs Ltd')
         .field('businessAddress', 'Address')
         .field('openingHoursStart', '08:00')
         .field('openingHoursEnd', '17:00')
         .field('country', 'Nigeria')
         .field('city', 'Lagos')
         .field('vehicleType', 'Motorbike')
         .field('businessNumber', 'RC-887766')
         .attach('utilityBill', Buffer.from('bill'), 'bill.pdf')
         .expect(400);

      expect(res.body.message).toContain('File field governmentId is required');
   });

   it('should fail if utilityBill file exceeds 1MB', async () => {
      const email = `e2e-lm-too-large@example.com`;
      // Create a 1.1MB buffer (1.1 * 1024 * 1024 bytes)
      const largeBuffer = Buffer.alloc(1.1 * 1024 * 1024);

      const res = await request(app.getHttpServer())
         .post('/api/auth/register-last-mile-provider')
         .field('name', 'John Large')
         .field('email', email)
         .field('phone', '+2348000000101')
         .field('businessName', 'Large Doc Ltd')
         .field('businessAddress', 'Address')
         .field('openingHoursStart', '08:00')
         .field('openingHoursEnd', '17:00')
         .field('country', 'Nigeria')
         .field('city', 'Lagos')
         .field('vehicleType', 'Motorbike')
         .field('businessNumber', 'RC-887767')
         .attach('utilityBill', largeBuffer, 'bill.pdf')
         .attach('governmentId', Buffer.from('id'), 'id.png')
         .attach('passportPhotograph', Buffer.from('passport'), 'pass.png')
         .attach('cacRegistration', Buffer.from('cac'), 'cac.pdf')
         .attach('vehicleRegistration', Buffer.from('vreg'), 'vreg.pdf')
         .attach('vehicleInsurance', Buffer.from('vins'), 'vins.pdf')
         .expect(400);

      expect(res.body.message).toContain('File utilityBill must be less than 1MB');
   });

   it('should successfully onboard a last mile provider, verify in DB, and complete signup flow', async () => {
      const email = `e2e-lm-success-${Date.now()}@example.com`;
      const phone = `+2348000000200`;

      // 1. Submit onboarding request
      const res = await request(app.getHttpServer())
         .post('/api/auth/register-last-mile-provider')
         .field('name', 'Successful Provider')
         .field('email', email)
         .field('phone', phone)
         .field('businessName', 'ACME Deliveries')
         .field('businessAddress', '10 Ikeja Way')
         .field('openingHoursStart', '08:00')
         .field('openingHoursEnd', '18:00')
         .field('country', 'Nigeria')
         .field('city', 'Lagos')
         .field('vehicleType', 'Motorbike')
         .field('businessNumber', 'RC-776655')
         .attach('utilityBill', Buffer.from('utility bill'), 'bill.pdf')
         .attach('governmentId', Buffer.from('gov id'), 'id.png')
         .attach('passportPhotograph', Buffer.from('passport photo'), 'pass.jpg')
         .attach('cacRegistration', Buffer.from('cac cert'), 'cac.pdf')
         .attach('vehicleRegistration', Buffer.from('veh reg'), 'vreg.pdf')
         .attach('vehicleInsurance', Buffer.from('insurance'), 'vins.pdf')
         .expect(201);

      expect(res.body).toEqual({ ok: true, verificationMethod: 'EMAIL_LINK' });

      // 2. Validate DB creation
      const user = await prisma.user.findUnique({
         where: { email },
         include: { company: { include: { documents: true } } },
      });

      expect(user).toBeDefined();
      expect(user!.kind).toBe('LAST_MILE_DELIVERY');
      expect(user!.isVerified).toBe(false);

      const company = user!.company;
      expect(company).toBeDefined();
      expect(company!.businessName).toBe('ACME Deliveries');
      expect(company!.role).toBe('LAST_MILE_PROVIDER');
      expect(company!.city).toBe('Lagos');
      expect(company!.openingHoursStart).toBe('08:00');
      expect(company!.openingHoursEnd).toBe('18:00');
      expect(company!.vehicleType).toBe('Motorbike');
      expect(company!.businessNumber).toBe('RC-776655');

      // Verify all 6 documents were created with correct types
      const docTypes = company!.documents.map((d) => d.type);
      expect(docTypes).toContain('UTILITY_BILL');
      expect(docTypes).toContain('GOVERNMENT_ISSUED_ID');
      expect(docTypes).toContain('PASSPORT_PHOTOGRAPH');
      expect(docTypes).toContain('CAC_REGISTRATION_CERTIFICATE');
      expect(docTypes).toContain('VEHICLE_REGISTRATION_CERTIFICATE');
      expect(docTypes).toContain('VEHICLE_INSURANCE');

      // 3. Complete email verification + set password
      const tokenRec = await prisma.verificationToken.findFirst({
         where: { userId: user!.id },
         orderBy: { createdAt: 'desc' },
      });
      expect(tokenRec).toBeDefined();

      const verificationToken = tokenRec!.token;
      const newPassword = 'Str0ngP@ssword!';

      await request(app.getHttpServer())
         .post('/api/auth/set-password')
         .send({
            verificationToken,
            password: newPassword,
            retypePassword: newPassword,
         })
         .expect(201);

      // 4. Verify login succeeds
      const loginRes = await request(app.getHttpServer())
         .post('/api/auth/login')
         .send({
            identifier: email,
            password: newPassword,
         })
         .expect(200);

      expect(loginRes.body).toHaveProperty('accessToken');
      expect(loginRes.body.user.email).toBe(email);
   });
});
