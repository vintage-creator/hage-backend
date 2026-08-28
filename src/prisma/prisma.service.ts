import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
   constructor() {
      const isProduction = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';
      const url = isProduction
         ? (process.env.DATABASE_URL || process.env.DATABASE_URL_PRODUCTION)
         : (process.env.DATABASE_URL_LOCAL || process.env.DATABASE_URL || "postgresql://apple@localhost:5432/hage?schema=public");

      super({
         datasources: {
            db: {
               url,
            },
         },
         log: ['query', 'info', 'warn', 'error'],
      });
   }

   async onModuleInit() {
      await this.$connect();
   }

   async onModuleDestroy() {
      await this.$disconnect();
   }
}
