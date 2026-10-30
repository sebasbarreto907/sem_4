import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PedidosService } from './pedidos.service';
@Controller('pedidos')
export class PedidosController {
  constructor(private readonly servicio: PedidosService) {}
  @Post()
  crear(@Body() entrada: unknown) { return this.servicio.crear(entrada); }
  @Get()
  listar(@Query('cliente') cliente?: unknown) { return this.servicio.listar(cliente); }
  @Get(':id')
  buscar(@Param('id') id: string) { return this.servicio.buscar(id); }
  @Patch(':id/enviar')
  enviar(@Param('id') id: string) { return this.servicio.enviar(id); }
  @Patch(':id/recibir')
  recibir(@Param('id') id: string, @Body() entrada: unknown) { return this.servicio.recibir(id, entrada); }
}
