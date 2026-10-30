import { Module } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { ProductosController } from './productos/productos.controller';
import { ProductosService } from './productos/productos.service';
import { PedidosController } from './pedidos/pedidos.controller';
import { PedidosService } from './pedidos/pedidos.service';
@Module({
  controllers: [ProductosController, PedidosController],
  providers: [PrismaService, ProductosService, PedidosService],
})
export class AppModule {}
