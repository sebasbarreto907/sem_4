import { Body, Controller, Get, Post } from '@nestjs/common';
import { ProductosService } from './productos.service';
@Controller('productos')
export class ProductosController {
  constructor(private readonly servicio: ProductosService) {}
  @Post()
  crear(@Body() entrada: unknown) { return this.servicio.crear(entrada); }
  @Get()
  listar() { return this.servicio.listar(); }
}
