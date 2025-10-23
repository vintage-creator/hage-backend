import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import * as dotenv from "dotenv";

dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix("api", {
    exclude: ['verify-email', 'reset-password'],
  });  

  const config = new DocumentBuilder()
    .setTitle("Hage Logistics API")
    .setDescription("MVP backend for Hage Logistics")
    .setVersion("1.0")
    .addTag("core")
    .addBearerAuth(
      { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      "access-token"
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api/docs", app, document);

  const port = Number(process.env.PORT || 3000);
  await app.listen(port);
  console.log(
    `Server listening on http://localhost:${port}/ (Swagger: /api/docs)`
  );
}

bootstrap();
