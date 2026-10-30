import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  const puerto = Number(process.env.PORT ?? 3001);
  await app.listen(puerto, '127.0.0.1');
  console.log(`API de pedidos: http://localhost:${puerto}/productos`);
}
bootstrap().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
