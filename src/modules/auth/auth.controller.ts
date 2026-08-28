import { Request, Response } from 'express';
import { memoryStorage } from 'multer';
import * as path from 'path';
import { Body, Controller, Req, Res, Post, UploadedFiles, UseInterceptors, BadRequestException, HttpCode, UseGuards, HttpStatus } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiResponse, ApiTags, ApiBody } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RegisterCompanyDto, RegisterKind } from './dto/register-company.dto';
import { CreatePasswordDto } from './dto/create-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ForgotPasswordRequestDto } from './dto/forgot-password-request.dto';
import { LogoutDto } from './dto/logout.dto';
import { VerifyPhoneCodeDto } from './dto/verify-phone-code.dto';
import { RegisterLastMileProviderDto } from './dto/register-last-mile-provider.dto';

type FileFilterCallback = (error: Error | null, acceptFile: boolean) => void;

const pdfFileFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
   const ext = path.extname(file.originalname).toLowerCase();
   const isPdfMime = file.mimetype === 'application/pdf';
   const isPdfExt = ext === '.pdf';

   if (isPdfMime && isPdfExt) {
      cb(null, true);
   } else {
      cb(new BadRequestException('Only PDF files are allowed'), false);
   }
};

const individualRegistrationSchema = {
   type: 'object',
   required: ['kind', 'language', 'name', 'emailAddress', 'phoneNumber', 'physicalAddress', 'country'],
   properties: {
      kind: { type: 'string', enum: ['INDIVIDUAL'], example: 'INDIVIDUAL' },
      language: { type: 'string', example: 'en' },
      name: { type: 'string', example: 'Jane Doe' },
      emailAddress: { type: 'string', example: 'jane@example.com' },
      phoneNumber: { type: 'string', example: '+2348010000000' },
      physicalAddress: { type: 'string', example: '12 Port Road' },
      country: { type: 'string', example: 'Nigeria' },
   },
};

const enterpriseRegistrationSchema = {
   type: 'object',
   required: ['kind', 'language', 'companyName', 'companyEmailAddress', 'companyPhoneNumber', 'companyAddress', 'country'],
   properties: {
      kind: { type: 'string', enum: ['ENTERPRISE'], example: 'ENTERPRISE' },
      language: { type: 'string', example: 'en' },
      companyName: { type: 'string', example: 'ACME Ltd' },
      companyEmailAddress: { type: 'string', example: 'ops@acme.example' },
      companyPhoneNumber: { type: 'string', example: '+2348010000000' },
      companyAddress: { type: 'string', example: '12 Port Road' },
      country: { type: 'string', example: 'Nigeria' },
   },
};

const documentRegistrationSchema = {
   type: 'object',
   required: ['kind', 'language', 'fullName', 'phoneNumber', 'emailAddress', 'businessName', 'businessAddress', 'companyCert', 'taxCert'],
   properties: {
      kind: {
         type: 'string',
         enum: ['DISTRIBUTOR', 'LOGISTIC_SERVICE_PROVIDER', 'LAST_MILE_DELIVERY'],
         example: 'LOGISTIC_SERVICE_PROVIDER',
      },
      language: { type: 'string', example: 'en' },
      fullName: { type: 'string', example: 'John Doe' },
      phoneNumber: { type: 'string', example: '+2348010000000' },
      emailAddress: { type: 'string', example: 'ops@example.com' },
      businessName: { type: 'string', example: 'ACME Logistics Ltd' },
      businessAddress: { type: 'string', example: '12 Port Road' },
      role: {
         type: 'string',
         enum: ['CROSS_BORDER_LOGISTICS', 'TRANSPORTER', 'LAST_MILE_PROVIDER'],
         description: 'Required only when kind is LOGISTIC_SERVICE_PROVIDER',
         example: 'TRANSPORTER',
      },
      companyCert: {
         type: 'string',
         format: 'binary',
         description: 'Required company registration certificate. PDF only, maximum 5MB.',
      },
      taxCert: {
         type: 'string',
         format: 'binary',
         description: 'Required tax clearance certificate. PDF only, maximum 5MB.',
      },
   },
};

const distributorRegistrationSchema = {
   type: 'object',
   required: ['kind', 'language', 'fullName', 'phoneNumber', 'emailAddress', 'businessName', 'businessAddress', 'companyCert', 'taxCert'],
   properties: {
      kind: { type: 'string', enum: ['DISTRIBUTOR'], example: 'DISTRIBUTOR' },
      language: { type: 'string', example: 'en' },
      fullName: { type: 'string', example: 'John Doe' },
      phoneNumber: { type: 'string', example: '+2348010000000' },
      emailAddress: { type: 'string', example: 'ops@example.com' },
      businessName: { type: 'string', example: 'ACME Distribution Ltd' },
      businessAddress: { type: 'string', example: '12 Port Road' },
      companyCert: {
         type: 'string',
         format: 'binary',
         description: 'Company registration certificate. PDF only, maximum 5MB.',
      },
      taxCert: {
         type: 'string',
         format: 'binary',
         description: 'Tax clearance certificate. PDF only, maximum 5MB.',
      },
   },
};

const documentUploadInterceptor = FileFieldsInterceptor(
   [
      { name: 'companyCert', maxCount: 1 },
      { name: 'taxCert', maxCount: 1 },
   ],
   {
      storage: memoryStorage(),
      fileFilter: pdfFileFilter,
      limits: {
         fileSize: 5 * 1024 * 1024,
      },
   },
);

const lastMileRegistrationSchema = {
   type: 'object',
   required: [
      'name',
      'email',
      'phone',
      'businessName',
      'businessAddress',
      'openingHoursStart',
      'openingHoursEnd',
      'country',
      'city',
      'vehicleType',
      'businessNumber',
   ],
   properties: {
      name: { type: 'string', example: 'John Doe' },
      email: { type: 'string', example: 'john.doe@example.com' },
      phone: { type: 'string', example: '+2348010000000' },
      businessName: { type: 'string', example: 'ACME Last Mile Ltd' },
      businessAddress: { type: 'string', example: '12 Logistics Way, Ikeja' },
      openingHoursStart: { type: 'string', example: '08:00' },
      openingHoursEnd: { type: 'string', example: '18:00' },
      country: { type: 'string', example: 'Nigeria' },
      city: { type: 'string', example: 'Lagos' },
      vehicleType: { type: 'string', example: 'Motorbike' },
      businessNumber: { type: 'string', example: 'RC-1234567' },
      utilityBill: { type: 'string', format: 'binary', description: 'Utility Bill (PDF/Image, < 1MB)' },
      governmentId: { type: 'string', format: 'binary', description: 'Government Issued ID (PDF/Image, < 1MB)' },
      passportPhotograph: { type: 'string', format: 'binary', description: 'Passport Photograph (PDF/Image, < 5MB)' },
      cacRegistration: { type: 'string', format: 'binary', description: 'CAC Registration Certificate (PDF/Image, < 5MB)' },
      vehicleRegistration: { type: 'string', format: 'binary', description: 'Vehicle Registration Certificate (PDF/Image, < 1MB)' },
      vehicleInsurance: { type: 'string', format: 'binary', description: 'Vehicle Insurance Certificate (PDF/Image, < 1MB)' },
   },
};

const lastMileFileFilter = (_req: any, file: Express.Multer.File, cb: FileFilterCallback) => {
   const ext = path.extname(file.originalname).toLowerCase();
   const allowedExts = ['.pdf', '.jpg', '.jpeg', '.png', '.webp'];
   const allowedMimes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

   if (allowedExts.includes(ext) && allowedMimes.includes(file.mimetype)) {
      cb(null, true);
   } else {
      cb(new BadRequestException(`File ${file.fieldname} has an invalid type. Only PDF and images (JPEG, PNG, WebP) are allowed.`), false);
   }
};

@ApiTags('auth')
@Controller('auth')
export class AuthController {
   constructor(private readonly auth: AuthService) {}

   @Post('register-individual')
   @ApiOperation({
      summary: 'Register individual user',
      description: 'No document upload is required. The backend generates a 4 digit phone verification code for this user. The code is currently delivered by the configured messaging provider.',
   })
   @ApiConsumes('multipart/form-data')
   @ApiBody({ schema: individualRegistrationSchema })
   @ApiResponse({
      status: 201,
      description: 'Registration accepted; verify with the 4 digit code.',
   })
   @UseInterceptors(FileFieldsInterceptor([], { storage: memoryStorage() }))
   async registerIndividual(@Body() dto: RegisterCompanyDto) {
      return this.auth.registerCompany(dto, {});
   }

   @Post('register-enterprise')
   @ApiOperation({
      summary: 'Register enterprise user',
      description: 'No document upload is required. The backend generates a 4 digit phone verification code for the company phone number. The code is currently delivered by the configured messaging provider.',
   })
   @ApiConsumes('multipart/form-data')
   @ApiBody({ schema: enterpriseRegistrationSchema })
   @ApiResponse({
      status: 201,
      description: 'Registration accepted; verify with the 4 digit code.',
   })
   @UseInterceptors(FileFieldsInterceptor([], { storage: memoryStorage() }))
   async registerEnterprise(@Body() dto: RegisterCompanyDto) {
      return this.auth.registerCompany(dto, {});
   }

   @Post('register-distributor')
   @ApiOperation({
      summary: 'Register distributor user',
      description:
         'Creates a DISTRIBUTOR account. Upload company registration certificate and tax clearance certificate as PDF files only, maximum 5MB each. Verification is via email link; after the email link opens, the frontend should call set-password.',
   })
   @ApiConsumes('multipart/form-data')
   @ApiBody({ schema: distributorRegistrationSchema })
   @ApiResponse({
      status: 201,
      description: 'Registration accepted; verify with the email link.',
   })
   @UseInterceptors(documentUploadInterceptor)
   async registerDistributor(
      @Body() dto: RegisterCompanyDto,
      @UploadedFiles()
      files?: {
         companyCert?: Express.Multer.File[];
         taxCert?: Express.Multer.File[];
      },
   ) {
      dto.kind = RegisterKind.DISTRIBUTOR;

      if (!files || !files.companyCert?.[0] || !files.taxCert?.[0]) {
         throw new BadRequestException('companyCert and taxCert PDF files are required (max 5MB each)');
      }

      return this.auth.registerCompany(dto, {
         companyCert: files.companyCert[0],
         taxCert: files.taxCert[0],
      });
   }

   @Post('register-company')
   @ApiOperation({
      summary: 'Register document-required user',
      description:
         'Use this for LOGISTIC_SERVICE_PROVIDER, DISTRIBUTOR, and LAST_MILE_DELIVERY users. These users upload companyCert and taxCert PDFs and verify by email link. Individual and enterprise users should use register-individual or register-enterprise.',
   })
   @ApiConsumes('multipart/form-data')
   @ApiResponse({
      status: 201,
      description: 'Registration accepted; verify with the email link.',
   })
   @UseInterceptors(documentUploadInterceptor)
   @ApiBody({
      schema: documentRegistrationSchema,
   })
   async registerCompany(
      @Body() dto: RegisterCompanyDto,
      @UploadedFiles()
      files?: {
         companyCert?: Express.Multer.File[];
         taxCert?: Express.Multer.File[];
      },
   ) {
      if (!dto.kind) throw new BadRequestException('User kind is required');

      if (dto.kind !== RegisterKind.ENTERPRISE && dto.kind !== RegisterKind.INDIVIDUAL && (!files || !files.companyCert?.[0] || !files.taxCert?.[0])) {
         throw new BadRequestException('companyCert and taxCert files are required (fields: companyCert, taxCert)');
      }

      return this.auth.registerCompany(dto, {
         companyCert: files?.companyCert?.[0],
         taxCert: files?.taxCert?.[0],
      });
   }

   @Post('register-last-mile-provider')
   @ApiOperation({
      summary: 'Register last mile provider user',
      description: 'Creates a last mile provider (LAST_MILE_DELIVERY kind) along with detailed company information and uploads six required onboarding documents. Verification is via email link.',
   })
   @ApiConsumes('multipart/form-data')
   @ApiResponse({
      status: 201,
      description: 'Registration accepted; verify with the email link.',
   })
   @UseInterceptors(
      FileFieldsInterceptor(
         [
            { name: 'utilityBill', maxCount: 1 },
            { name: 'governmentId', maxCount: 1 },
            { name: 'passportPhotograph', maxCount: 1 },
            { name: 'cacRegistration', maxCount: 1 },
            { name: 'vehicleRegistration', maxCount: 1 },
            { name: 'vehicleInsurance', maxCount: 1 },
         ],
         {
            storage: memoryStorage(),
            fileFilter: lastMileFileFilter,
            limits: {
               fileSize: 10 * 1024 * 1024, // 10MB overall limit
            },
         },
      ),
   )
   @ApiBody({
      schema: lastMileRegistrationSchema,
   })
   async registerLastMileProvider(
      @Body() dto: RegisterLastMileProviderDto,
      @UploadedFiles()
      files?: {
         utilityBill?: Express.Multer.File[];
         governmentId?: Express.Multer.File[];
         passportPhotograph?: Express.Multer.File[];
         cacRegistration?: Express.Multer.File[];
         vehicleRegistration?: Express.Multer.File[];
         vehicleInsurance?: Express.Multer.File[];
      },
   ) {
      const fileFields = [
         { name: 'utilityBill', max: 1 * 1024 * 1024 },
         { name: 'governmentId', max: 1 * 1024 * 1024 },
         { name: 'passportPhotograph', max: 5 * 1024 * 1024 },
         { name: 'cacRegistration', max: 5 * 1024 * 1024 },
         { name: 'vehicleRegistration', max: 1 * 1024 * 1024 },
         { name: 'vehicleInsurance', max: 1 * 1024 * 1024 },
      ];

      for (const field of fileFields) {
         const fileArr = files?.[field.name as keyof typeof files];
         if (!fileArr || !fileArr[0]) {
            throw new BadRequestException(`File field ${field.name} is required`);
         }
         if (fileArr[0].size > field.max) {
            const mb = field.max / (1024 * 1024);
            throw new BadRequestException(`File ${field.name} must be less than ${mb}MB`);
         }
      }

      return this.auth.registerLastMileProvider(dto, {
         utilityBill: files!.utilityBill![0],
         governmentId: files!.governmentId![0],
         passportPhotograph: files!.passportPhotograph![0],
         cacRegistration: files!.cacRegistration![0],
         vehicleRegistration: files!.vehicleRegistration![0],
         vehicleInsurance: files!.vehicleInsurance![0],
      });
   }

   @Post('verify-phone-code')
   @ApiOperation({
      summary: 'Verify enterprise or individual onboarding code',
      description:
         'Verifies the backend-generated 4 digit phone OTP for individual or enterprise onboarding. emailAddress identifies the onboarding account; verificationCode is the locally stored OTP. After the phone code is verified, the backend sends the email verification link used before set-password.',
   })
   @ApiResponse({
      status: 200,
      description: 'Phone code verified — verification email sent. Use the email link token to set password.',
   })
   @HttpCode(HttpStatus.OK)
   async verifyPhoneCode(@Body() dto: VerifyPhoneCodeDto) {
      return this.auth.verifyPhoneCode(dto.emailAddress, dto.verificationCode);
   }

   @Post('set-password')
   @ApiOperation({ summary: 'Set password after email verification' })
   @ApiResponse({ status: 200, description: 'Password set successfully' })
   async setPassword(@Body() dto: CreatePasswordDto) {
      return this.auth.setPassword(dto.verificationToken, dto.password, dto.retypePassword);
   }

   @Post('login')
   @ApiOperation({ summary: 'Login using email or phone and password' })
   @ApiResponse({ status: 200, description: 'Returns access & refresh tokens' })
   @HttpCode(HttpStatus.OK)
   async login(@Body() dto: LoginDto) {
      return this.auth.login(dto.identifier, dto.password);
   }

   @Post('refresh')
   @ApiOperation({
      summary: 'Refresh access token',
      description: 'Exchange a valid refresh token for a new access token and rotated refresh token.',
   })
   @ApiResponse({
      status: 200,
      description: 'Returns a new access token, refresh token, and user payload',
   })
   @HttpCode(HttpStatus.OK)
   async refresh(@Body() dto: RefreshTokenDto) {
      return this.auth.refreshSession(dto.refreshToken);
   }

   @Post('logout')
   @ApiBearerAuth('access-token')
   @HttpCode(HttpStatus.NO_CONTENT)
   @ApiOperation({ summary: 'Logout and revoke refresh token' })
   @ApiResponse({ status: 204, description: 'Logged out (idempotent)' })
   async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body() dto: LogoutDto): Promise<void> {
      let userId: string | null = null;
      const authHeader = req.headers['authorization'];
      if (authHeader && authHeader.startsWith('Bearer ')) {
         try {
            const token = authHeader.substring(7);
            const decoded = this.auth.decodeToken(token);
            userId = decoded?.sub ?? null;
         } catch (e) {
            // Ignore token decode error for logout resiliency
         }
      }

      await this.auth.logout({
         userId,
         refreshToken: dto.refreshToken,
         refreshTokenId: dto.refreshTokenId,
      });

      const isProd = process.env.NODE_ENV === 'production';
      res.clearCookie('refresh_token', {
         httpOnly: true,
         sameSite: 'lax',
         secure: isProd,
      });

      return;
   }

   @Post('forgot-password')
   @ApiOperation({
      summary: 'Request password reset (email sent if account exists)',
   })
   @ApiResponse({
      status: 200,
      description: 'If account exists an email was sent',
   })
   @HttpCode(HttpStatus.OK)
   async forgotPassword(@Body() dto: ForgotPasswordRequestDto) {
      return this.auth.requestPasswordReset(dto.email);
   }
}
