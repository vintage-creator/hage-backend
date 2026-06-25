// test/e2e/app.e2e-spec.ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '../../src/app.module';

describe('App (e2e)', () => {
   let app: INestApplication;

   beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
         imports: [AppModule],
      }).compile();

      app = moduleRef.createNestApplication();

      app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
      app.setGlobalPrefix('api');

      // Setup Swagger in the test app (main.ts does this at runtime, but tests must do it explicitly)
      const config = new DocumentBuilder()
         .setTitle('Hage Logistics API')
         .setDescription('MVP backend for Hage Logistics')
         .setVersion('1.0')
         .addTag('core')
         .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
         .build();
      const document = SwaggerModule.createDocument(app, config);
      SwaggerModule.setup('api/docs', app, document);

      await app.init();
   }, 20000); // increase timeout if needed

   afterAll(async () => {
      if (app) await app.close();
   });

   it('GET /api/docs -> 200 (Swagger UI)', async () => {
      await request(app.getHttpServer()).get('/api/docs').expect(200).expect('Content-Type', /html/);
   });

   it('GET /api -> 404 (global prefix set, no root route)', async () => {
      await request(app.getHttpServer()).get('/api').expect(404);
   });
});
