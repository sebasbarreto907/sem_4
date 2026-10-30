import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { camposPermitidos, entero, objeto, texto } from '../common/validacion';
@Injectable()
export class ProductosService {
  constructor(private readonly prisma: PrismaService) {}
  crear(entrada: unknown) {
    const datos = objeto(entrada);
    camposPermitidos(datos, ['nombre', 'descripcion', 'stock']);
    const nombre = texto(datos.nombre, 'nombre');
    const descripcion = texto(datos.descripcion, 'descripcion', 1000);
    const stock = entero(datos.stock, 'stock', 0);
    return this.prisma.producto.create({ data: { nombre, descripcion, stock } });
  }
  listar() { return this.prisma.producto.findMany({ orderBy: { id: 'asc' } }); }
}
