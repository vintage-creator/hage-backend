// test/e2e/utils/createTestUser.ts
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { RoleType, UserKind } from '@prisma/client';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';

export interface CreateUserOpts {
   email?: string;
   phone?: string;
   password?: string;
   fullName?: string;
   businessName?: string;
   businessAddress?: string;
   kind?: UserKind;
   role?: RoleType;
}

/**
 * Creates a company + verified user and returns access token + ids.
 */
export async function createTestUserWithCompany(prisma: PrismaService, app: INestApplication, opts?: CreateUserOpts) {
   const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;

   const email = opts?.email ?? `e2e-user-${suffix}@example.com`;
   const phone = opts?.phone ?? `+2348${Math.floor(Math.random() * 1_000_000_000)}`;
   const password = opts?.password ?? 'Str0ngP@ssword!';
   const fullName = opts?.fullName ?? `E2E Test Owner ${suffix}`;
   const businessName = opts?.businessName ?? `e2e-company-${suffix}`;
   const businessAddress = opts?.businessAddress ?? '123 Test St';

   const kind: UserKind = opts?.kind ?? UserKind.ENTERPRISE;
   const role: RoleType = opts?.role ?? RoleType.CROSS_BORDER_LOGISTICS;

   const company = await prisma.company.create({
      data: {
         fullName,
         phoneNumber: phone,
         emailAddress: email,
         businessName,
         businessAddress,
      },
   });

   // create verified user
   const hashedPassword = await bcrypt.hash(password, 10);
   const user = await prisma.user.create({
      data: {
         email,
         phone,
         password: hashedPassword,
         kind,
         role,
         companyId: company.id,
         isVerified: true,
      },
   });

   // login to obtain access token
   const loginResp = await request(app.getHttpServer()).post('/api/auth/login').send({ identifier: email, password }).expect(200);

   const accessToken = loginResp.body?.accessToken;
   if (!accessToken) throw new Error('Failed to get access token for test user');

   return {
      companyId: company.id,
      userId: user.id,
      email,
      phone,
      password,
      accessToken,
   };
}

export default createTestUserWithCompany;
