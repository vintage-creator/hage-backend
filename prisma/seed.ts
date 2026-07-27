import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
   console.log('🌱 Starting database seed...');

   const testPassword = 'HageTestPassword123!';
   const hashedPassword = await bcrypt.hash(testPassword, 10);

   // 1. Enterprise Customer Account
   const enterpriseEmail = 'enterprise@tryhage.com';
   const entCompany = await prisma.company.upsert({
      where: { emailAddress: enterpriseEmail },
      update: {},
      create: {
         fullName: 'Enterprise Owner',
         phoneNumber: '+2349000000001',
         emailAddress: enterpriseEmail,
         businessName: 'Enterprise Demo Ltd',
         businessAddress: '10 Enterprise Plaza, Lagos',
         country: 'Nigeria',
         language: 'en',
         role: null,
      },
   });

   await prisma.user.upsert({
      where: { email: enterpriseEmail },
      update: {
         password: hashedPassword,
         isVerified: true,
      },
      create: {
         email: enterpriseEmail,
         phone: '+2349000000001',
         password: hashedPassword,
         kind: 'ENTERPRISE',
         isVerified: true,
         companyId: entCompany.id,
      },
   });
   console.log(`👤 Enterprise Demo Account: ${enterpriseEmail} / ${testPassword}`);

   // 2. Individual Customer Account
   const individualEmail = 'individual@tryhage.com';
   const indCompany = await prisma.company.upsert({
      where: { emailAddress: individualEmail },
      update: {},
      create: {
         fullName: 'Individual User',
         phoneNumber: '+2349000000002',
         emailAddress: individualEmail,
         businessName: 'Individual Demo',
         businessAddress: '5 Individual Close, Lagos',
         country: 'Nigeria',
         language: 'en',
         role: null,
      },
   });

   await prisma.user.upsert({
      where: { email: individualEmail },
      update: {
         password: hashedPassword,
         isVerified: true,
      },
      create: {
         email: individualEmail,
         phone: '+2349000000002',
         password: hashedPassword,
         kind: 'INDIVIDUAL',
         isVerified: true,
         companyId: indCompany.id,
      },
   });
   console.log(`👤 Individual Demo Account: ${individualEmail} / ${testPassword}`);

   // 3. Last Mile Provider Account
   const providerEmail = 'provider@tryhage.com';
   const provCompany = await prisma.company.upsert({
      where: { emailAddress: providerEmail },
      update: {
         role: 'LAST_MILE_PROVIDER',
      },
      create: {
         fullName: 'Last Mile Provider',
         phoneNumber: '+2349000000003',
         emailAddress: providerEmail,
         businessName: 'Last Mile Demo Ltd',
         businessAddress: '25 Last Mile Road, Lagos',
         country: 'Nigeria',
         language: 'en',
         role: 'LAST_MILE_PROVIDER',
         city: 'Lagos',
         openingHoursStart: '08:00',
         openingHoursEnd: '18:00',
         vehicleType: 'Motorbike',
         businessNumber: 'RC-9876543',
      },
   });

   await prisma.user.upsert({
      where: { email: providerEmail },
      update: {
         password: hashedPassword,
         isVerified: true,
      },
      create: {
         email: providerEmail,
         phone: '+2349000000003',
         password: hashedPassword,
         kind: 'LAST_MILE_DELIVERY',
         isVerified: true,
         companyId: provCompany.id,
      },
   });
   console.log(`👤 Last Mile Provider Demo Account: ${providerEmail} / ${testPassword}`);

   console.log('🎉 Seeding completed successfully!');
}

main()
   .catch((err) => {
      console.error('❌ Error seeding database:', err);
      process.exit(1);
   })
   .finally(async () => {
      await prisma.$disconnect();
   });
