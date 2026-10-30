import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { EstadoPedido, Prisma, Pedido } from '@prisma/client';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { camposPermitidos, entero, idValido, objeto, texto } from '../common/validacion';

type LineaPedido = { productoId: number; nombreProducto: string; cantidad: number };

@Injectable()
export class PedidosService {
  constructor(private readonly prisma: PrismaService) {}

  private clienteClave(nombre: string): string {
    return nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
  }
  private hash(codigo: string): string { return createHash('sha256').update(codigo).digest('hex'); }
  private publico(pedido: Pedido) {
    const { codigoVerificacionHash, clienteClave, ...visible } = pedido;
    return visible;
  }

  // Cada operacion se confirma por completo o se revierte por completo.
  private async transaccion<T>(operacion: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let intento = 0; intento < 3; intento++) {
      try {
        return await this.prisma.$transaction(operacion, { maxWait: 5000, timeout: 10000 });
      } catch (error) {
        const reintentable = error instanceof Prisma.PrismaClientKnownRequestError
          && ['P2034', 'P1008', 'P2028'].includes(error.code);
        if (!reintentable) throw error;
        if (intento === 2) throw new ServiceUnavailableException('La base está ocupada. Intenta nuevamente.');
        await new Promise(resolve => setTimeout(resolve, 50 * (intento + 1)));
      }
    }
    throw new ServiceUnavailableException('No se pudo completar la operación.');
  }

  async crear(entrada: unknown) {
    const datos = objeto(entrada);
    // El cliente no puede elegir el estado ni el codigo de verificacion.
    camposPermitidos(datos, ['nombreCliente', 'productos']);
    const nombreCliente = texto(datos.nombreCliente, 'nombreCliente');
    if (!Array.isArray(datos.productos) || datos.productos.length === 0 || datos.productos.length > 100) throw new BadRequestException('productos debe contener de 1 a 100 elementos.');

    // Unificar IDs repetidos evita evadir la validacion de stock.
    const cantidades = new Map<number, number>();
    for (const entradaProducto of datos.productos) {
      const item = objeto(entradaProducto);
      camposPermitidos(item, ['productoId', 'cantidad']);
      const productoId = entero(item.productoId, 'productoId');
      const cantidad = entero(item.cantidad, 'cantidad');
      const total = entero((cantidades.get(productoId) ?? 0) + cantidad, 'cantidad total');
      cantidades.set(productoId, total);
    }
    const codigoVerificacion = randomInt(100000, 1000000).toString();
    const pedido = await this.transaccion(async tx => {
      const productos = await tx.producto.findMany({ where: { id: { in: [...cantidades.keys()] } } });
      const lineas: LineaPedido[] = [];
      for (const [productoId, cantidad] of cantidades) {
        const producto = productos.find(item => item.id === productoId);
        if (!producto) throw new NotFoundException(`El producto ${productoId} no existe.`);
        if (producto.stock < cantidad) throw new ConflictException(`Stock insuficiente para ${producto.nombre}. Disponible: ${producto.stock}.`);
        lineas.push({ productoId, nombreProducto: producto.nombre, cantidad });
      }
      for (const linea of lineas) {
        // Actualizacion atomica: no vender las mismas unidades dos veces.
        const cambio = await tx.producto.updateMany({
          where: { id: linea.productoId, stock: { gte: linea.cantidad } },
          data: { stock: { decrement: linea.cantidad } },
        });
        if (cambio.count !== 1) throw new ConflictException(`Stock insuficiente para ${linea.nombreProducto}.`);
      }
      return tx.pedido.create({ data: {
        nombreCliente, clienteClave: this.clienteClave(nombreCliente), estado: EstadoPedido.Pendiente,
        productos: lineas, codigoVerificacionHash: this.hash(codigoVerificacion),
      } });
    });
    // El codigo se muestra una sola vez; las consultas no lo exponen.
    return { ...this.publico(pedido), codigoVerificacion };
  }

  async listar(cliente?: unknown) {
    const clienteClave = cliente === undefined ? undefined : this.clienteClave(texto(cliente, 'cliente'));
    const pedidos = await this.prisma.pedido.findMany({
      where: clienteClave === undefined ? {} : { clienteClave }, orderBy: { id: 'desc' },
    });
    return pedidos.map(pedido => this.publico(pedido));
  }

  async buscar(id: string) {
    const pedido = await this.prisma.pedido.findUnique({ where: { id: idValido(id) } });
    if (!pedido) throw new NotFoundException('El pedido no existe.');
    return this.publico(pedido);
  }

  async enviar(id: string) {
    const pedidoId = idValido(id);
    return this.transaccion(async tx => {
      const pedido = await tx.pedido.findUnique({ where: { id: pedidoId } });
      if (!pedido) throw new NotFoundException('El pedido no existe.');
      if (pedido.estado !== EstadoPedido.Pendiente) throw new ConflictException('Solo se puede enviar un pedido Pendiente.');
      const cambio = await tx.pedido.updateMany({
        where: { id: pedidoId, estado: EstadoPedido.Pendiente }, data: { estado: EstadoPedido.Enviado },
      });
      if (cambio.count !== 1) throw new ConflictException('El estado del pedido cambió. Consulta nuevamente.');
      return this.publico(await tx.pedido.findUniqueOrThrow({ where: { id: pedidoId } }));
    });
  }

  async recibir(id: string, entrada: unknown) {
    const pedidoId = idValido(id);
    const datos = objeto(entrada);
    camposPermitidos(datos, ['codigoVerificacion']);
    if (typeof datos.codigoVerificacion !== 'string' || !/^\d{6}$/.test(datos.codigoVerificacion)) throw new BadRequestException('Se requiere codigoVerificacion como texto de seis dígitos.');
    const hashIngresado = this.hash(datos.codigoVerificacion);
    return this.transaccion(async tx => {
      const pedido = await tx.pedido.findUnique({ where: { id: pedidoId } });
      if (!pedido) throw new NotFoundException('El pedido no existe.');
      if (pedido.estado !== EstadoPedido.Enviado) throw new ConflictException('Solo se puede recibir un pedido Enviado.');
      if (!timingSafeEqual(Buffer.from(hashIngresado, 'hex'), Buffer.from(pedido.codigoVerificacionHash, 'hex'))) throw new BadRequestException('Código de verificación incorrecto.');
      const otroPendiente = await tx.pedido.findFirst({ where: {
        clienteClave: pedido.clienteClave, estado: EstadoPedido.Pendiente, id: { not: pedidoId },
      } });
      if (otroPendiente) throw new ConflictException('El cliente tiene otro pedido Pendiente. Debe enviarse antes de recibir este pedido.');
      const cambio = await tx.pedido.updateMany({
        where: { id: pedidoId, estado: EstadoPedido.Enviado }, data: { estado: EstadoPedido.Recibido },
      });
      if (cambio.count !== 1) throw new ConflictException('El estado del pedido cambió. Consulta nuevamente.');
      return this.publico(await tx.pedido.findUniqueOrThrow({ where: { id: pedidoId } }));
    });
  }
}
