// import { PrismaClient, DocType, UserRole, CompanyKind } from "@prisma/client";
// import * as bcrypt from "bcrypt";

// const prisma = new PrismaClient();

// async function main() {
//   console.log("🌱 Starting database seed...");

//   // Seed admin credentials
//   const adminEmail = process.env.SEED_ADMIN_EMAIL || "admin@example.com";
//   const adminPassword =
//     process.env.SEED_ADMIN_PASSWORD || "Str0ngP@ssword!";
//   const hashedPassword = await bcrypt.hash(adminPassword, 10);

//   // 1️⃣ Create or update the company
//   const company = await prisma.company.upsert({
//     where: { emailAddress: adminEmail },
//     update: {},
//     create: {
//       businessName: "Seeded Company Ltd",
//       businessAddress: "123 Seed Street",
//       emailAddress: adminEmail,
//       phoneNumber: "+2348000000000",
//       kind: CompanyKind.ENTERPRISE,
//       role: "CROSS_BORDER_LOGISTICS",
//       isVerified: true,
//     },
//   });

//   console.log("🏢 Company created:", company.businessName);

//   // 2️⃣ Create or update the admin user (company owner)
//   const user = await prisma.user.upsert({
//     where: { email: adminEmail },
//     update: {},
//     create: {
//       fullName: "Admin Owner",
//       email: adminEmail,
//       phoneNumber: "+2348000000000",
//       password: hashedPassword,
//       isVerified: true,
//       role: UserRole.COMPANY_OWNER,
//       companyId: company.id,
//     },
//   });

//   console.log("👤 User created:", user.fullName);

//   // 3️⃣ Create tracking documents for the company
//   await prisma.trackingDocument.createMany({
//     data: [
//       {
//         companyId: company.id,
//         type: DocType.COMPANY_REGISTRATION_CERTIFICATE,
//         url: "https://storage.test/company.pdf",
//       },
//       {
//         companyId: company.id,
//         type: DocType.TAX_REGISTRATION_CERTIFICATE,
//         url: "https://storage.test/tax.pdf",
//       },
//     ],
//     skipDuplicates: true,
//   });

//   console.log("📄 Tracking documents added.");

//   // 4️⃣ Optionally create a deterministic verification token
//   const seedToken =
//     process.env.SEED_VERIFICATION_TOKEN || `seed-token-${Date.now()}`;

//   await prisma.verificationToken.upsert({
//     where: { token: seedToken },
//     update: { expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24) }, // 1 day expiry
//     create: {
//       userId: user.id,
//       token: seedToken,
//       expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
//     },
//   });

//   console.log("✅ Verification token created:", seedToken);

//   console.log("🎉 Seed completed successfully!");
// }

// main()
//   .catch((err) => {
//     console.error("❌ Error seeding database:", err);
//     process.exit(1);
//   })
//   .finally(async () => {
//     await prisma.$disconnect();
//   });
