// test/e2e/auth.e2e-spec.ts
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../src/app.module";
import { PrismaService } from "../../src/prisma/prisma.service";
import { MailService } from "../../src/common/mail/mail.service";

jest.setTimeout(120000);

describe("Auth (e2e) — register / verify / set-password / login", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // Fake mailer to avoid sending real emails
  const fakeMailer = {
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    sendResetPasswordEmail: jest.fn().mockResolvedValue(undefined),
  };

  // Fake storage (Cloudinary) to avoid real uploads
  const fakeStorageService = {
    uploadFile: jest
      .fn()
      .mockImplementation(async (file: Express.Multer.File, opts?: any) => {
        const name = (file && (file.originalname || "file")) as string;
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
      .overrideProvider("StorageService")
      .useValue(fakeStorageService)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true })
    );
    app.setGlobalPrefix("api", {
      exclude: ['verify-email', 'reset-password'],
    });    

    await app.init();

    prisma = app.get(PrismaService);
  }, 30000);

  afterAll(async () => {
    try {
      // tokens & refresh tokens
      await prisma.passwordResetToken.deleteMany({});
      await prisma.verificationToken.deleteMany({});
      await prisma.refreshToken.deleteMany({});

      // Remove tracking documents referencing test companies first
      await prisma.trackingDocument.deleteMany({
        where: { company: { emailAddress: { contains: "e2e-auth-" } } },
      });

      // Remove users and companies
      await prisma.user.deleteMany({
        where: { email: { contains: "e2e-auth-" } },
      });
      await prisma.company.deleteMany({
        where: { emailAddress: { contains: "e2e-auth-" } },
      });
    } catch (err) {
      console.error("Cleanup failed (ignoring):", (err as any)?.message ?? err);
    } finally {
      if (app) await app.close();
    }
  });

  it("full flow: register-company -> verify-email -> set-password -> login", async () => {
    const email = `e2e-auth-${Date.now()}@example.com`;
    const payload = {
      fullName: "E2E Company Owner",
      phoneNumber: "+2348000000000",
      emailAddress: email,
      businessName: "E2E Company Ltd",
      businessAddress: "123 Test St",
      kind: "ENTERPRISE",
      role: "CROSS_BORDER_LOGISTICS",
    };

    // 1) Register company (multipart form with two files)
    const registerRes = await request(app.getHttpServer())
      .post("/api/auth/register-company")
      .field("fullName", payload.fullName)
      .field("phoneNumber", payload.phoneNumber)
      .field("emailAddress", payload.emailAddress)
      .field("businessName", payload.businessName)
      .field("businessAddress", payload.businessAddress)
      .field("kind", payload.kind)
      .field("role", payload.role)
      // Attach dummy buffers; storage is mocked so these won't be uploaded to Cloudinary
      .attach("companyCert", Buffer.from("dummy company cert"), "company.pdf")
      .attach("taxCert", Buffer.from("dummy tax cert"), "tax.pdf")
      .expect(201);

    expect(registerRes.body).toEqual(expect.objectContaining({ ok: true }));

    // 2) Find created user + verification token in DB
    const user = await prisma.user.findUnique({ where: { email } });
    expect(user).toBeDefined();

    const vtokenRec = await prisma.verificationToken.findFirst({
      where: { userId: user!.id },
      orderBy: { createdAt: "desc" },
    });
    expect(vtokenRec).toBeDefined();
    const token = vtokenRec!.token;

    // 3) GET verify-email (validate token)
    const verifyRes = await request(app.getHttpServer())
      .get(`/verify-email?token=${encodeURIComponent(token)}`)
      .expect(200);

    expect(verifyRes.body).toEqual(
      expect.objectContaining({
        ok: true,
        email,
        token,
      })
    );

    // 4) Set password
    const newPassword = "Str0ngP@ssword!";
    const setPassRes = await request(app.getHttpServer())
      .post("/api/auth/set-password")
      .send({
        verificationToken: token,
        password: newPassword,
        retypePassword: newPassword,
      })
      .expect(201);

    expect(setPassRes.body).toEqual(expect.objectContaining({ ok: true }));

    // 5) Login using email
    const loginRes = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ identifier: email, password: newPassword })
      .expect(200);

    expect(loginRes.body).toHaveProperty("accessToken");
    expect(loginRes.body).toHaveProperty("refreshToken");
    expect(loginRes.body).toHaveProperty("user");
    expect(loginRes.body.user.email).toBe(email);
  }, 60000);
});
