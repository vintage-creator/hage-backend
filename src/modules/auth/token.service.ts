// src/modules/auth/token.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { randomBytes, randomInt } from 'crypto';
import { add } from 'date-fns';

@Injectable()
export class TokenService {
   constructor(private readonly prisma: PrismaService) {}

   async createVerificationToken(userId: string, hours = 24) {
      const token = randomBytes(24).toString('hex');
      const expiresAt = add(new Date(), { hours });
      const rec = await this.prisma.verificationToken.create({
         data: { userId, token, expiresAt },
      });
      return { id: rec.id, token: rec.token, expiresAt: rec.expiresAt };
   }

   async createVerificationCode(userId: string, minutes = 15) {
      const expiresAt = add(new Date(), { minutes });

      for (let attempt = 0; attempt < 5; attempt++) {
         const token = randomInt(0, 10000).toString().padStart(4, '0');

         try {
            const rec = await this.prisma.verificationToken.create({
               data: { userId, token, expiresAt },
            });
            return { id: rec.id, token: rec.token, expiresAt: rec.expiresAt };
         } catch (err: any) {
            if (err?.code !== 'P2002') throw err;
         }
      }

      throw new Error('Could not create a unique verification code');
   }

   async createPasswordResetToken(userId: string, hours = 2) {
      const token = randomBytes(24).toString('hex');
      const expiresAt = add(new Date(), { hours });
      const rec = await this.prisma.passwordResetToken.create({
         data: { userId, token, expiresAt },
      });
      return { id: rec.id, token: rec.token, expiresAt: rec.expiresAt };
   }

   async findVerificationToken(token: string) {
      return this.prisma.verificationToken.findUnique({
         where: { token },
         include: { user: true },
      });
   }

   async findVerificationTokenForEmail(email: string, token: string) {
      return this.prisma.verificationToken.findFirst({
         where: {
            token,
            user: { email: { equals: email, mode: 'insensitive' } },
         },
         include: { user: true },
         orderBy: { createdAt: 'desc' },
      });
   }

   async findPasswordResetToken(token: string) {
      return this.prisma.passwordResetToken.findUnique({
         where: { token },
         include: { user: true },
      });
   }

   async deletePasswordResetToken(id: string) {
      return this.prisma.passwordResetToken.delete({ where: { id } });
   }

   async deleteVerificationTokensByUser(userId: string) {
      return this.prisma.verificationToken.deleteMany({ where: { userId } });
   }

   async markPasswordTokenUsed(id: string) {
      return this.prisma.passwordResetToken.update({
         where: { id },
         data: { used: true },
      });
   }
}
export default TokenService;
