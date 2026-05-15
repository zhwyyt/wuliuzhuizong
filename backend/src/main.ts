import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: true,
    credentials: true,
  });
  app.setGlobalPrefix('api');

  const port = Number(process.env.PORT ?? 4000);
  const host = process.env.HOST ?? '0.0.0.0';
  await app.listen(port, host);
  console.log(`Wuliugenzong API running on http://${host}:${port}/api`);
  console.log(`Local health check: http://127.0.0.1:${port}/api/health`);
  console.log(`Phone/Tailscale URL format: http://<computer-ip>:${port}/api`);
}

void bootstrap();
