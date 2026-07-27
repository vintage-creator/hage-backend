import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';

dotenv.config();

async function bootstrap() {
   const app = await NestFactory.create(AppModule, { cors: true });

   app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
   app.setGlobalPrefix('api', {
      exclude: ['verify-email', 'reset-password'],
   });

   const port = Number(process.env.PORT || 3000);
   const isDev = process.env.NODE_ENV !== 'production';
   const configuredSwaggerServers = (process.env.SWAGGER_SERVER_URLS || process.env.SWAGGER_SERVER_URL || '')
      .split(',')
      .map((url) => url.trim().replace(/\/+$/, ''))
      .filter(Boolean);
   const swaggerServerUrls = configuredSwaggerServers.length
      ? configuredSwaggerServers
      : isDev
        ? [`http://localhost:${port}`, process.env.APP_URL].filter(Boolean) as string[]
        : ['https://hage-backend.onrender.com', 'https://api.tryhage.com'];

   const swaggerBuilder = new DocumentBuilder()
      .setTitle('Hage Logistics API')
      .setDescription('MVP backend for Hage Logistics')
      .setVersion('1.0')
      .addTag('core')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token');

   for (const swaggerServerUrl of swaggerServerUrls) {
      swaggerBuilder.addServer(swaggerServerUrl.replace(/\/+$/, ''));
   }

   const config = swaggerBuilder.build();

   const document = SwaggerModule.createDocument(app, config);
   SwaggerModule.setup('api/docs', app, document);

   await app.listen(port);
   console.log(`Server listening on http://localhost:${port}/ (Swagger: /api/docs)`);
}

bootstrap();
