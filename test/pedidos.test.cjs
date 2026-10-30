const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdirSync, unlinkSync, rmdirSync, existsSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
require('reflect-metadata');
// Base aislada: no modifica los datos del ejercicio.
const temporal = path.join(__dirname, '.tmp', randomUUID());
mkdirSync(temporal, { recursive: true });
const archivoDB = path.join(temporal, 'pruebas.db');
writeFileSync(archivoDB, '', { flag: 'wx' });
process.env.DATABASE_URL = 'file:' + archivoDB.replaceAll('\\', '/');
const { NestFactory } = require('@nestjs/core');
const { PrismaClient } = require('@prisma/client');
const { AppModule } = require('../dist/app.module');
let app, db, base;
before(async () => {
  execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], {
    cwd: path.join(__dirname, '..'), env: process.env, stdio: 'pipe',
  });
  db = new PrismaClient();
  app = await NestFactory.create(AppModule, { logger: false });
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
});
beforeEach(async () => { await db.pedido.deleteMany(); await db.producto.deleteMany(); });
after(async () => {
  if (app) await app.close();
  if (db) await db.$disconnect();
  for (const sufijo of ['', '-journal', '-shm', '-wal']) {
    if (existsSync(archivoDB + sufijo)) unlinkSync(archivoDB + sufijo);
  }
  rmdirSync(temporal);
});
async function api(method, ruta, cuerpo) {
  const r = await fetch(base + ruta, { method,
    headers: cuerpo === undefined ? {} : { 'Content-Type': 'application/json' },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { status: r.status, body: await r.json() };
}
async function producto(stock = 10, nombre = 'Cuaderno') {
  const r = await api('POST', '/productos', { nombre, descripcion: 'Producto de prueba', stock });
  assert.equal(r.status, 201); return r.body;
}
async function pedido(productoId, nombreCliente = 'Ana', cantidad = 1) {
  const r = await api('POST', '/pedidos', { nombreCliente, productos: [{ productoId, cantidad }] });
  assert.equal(r.status, 201, JSON.stringify(r.body)); return r.body;
}
const stock = async id => (await db.producto.findUniqueOrThrow({ where: { id } })).stock;

test('Solo dos tablas de negocio, sin tabla intermedia', async () => {
  const tablas = await db.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE type='table'");
  assert.deepEqual(tablas.map(t => t.name).filter(n => !n.startsWith('_') && !n.startsWith('sqlite_')).sort(), ['pedidos', 'productos']);
});
test('Productos: nombre, descripcion, stock entero no negativo y listado', async () => {
  for (const invalido of [-1, 1.5, '2', 2147483648]) assert.equal((await api('POST', '/productos', { nombre: 'A', descripcion: 'B', stock: invalido })).status, 400);
  assert.equal((await api('POST', '/productos', { nombre: ' ', descripcion: 'B', stock: 1 })).status, 400);
  assert.equal((await api('POST', '/productos', { nombre: 'A', stock: 1 })).status, 400);
  await producto(0);
  assert.equal((await api('GET', '/productos')).body.length, 1);
});
test('Pedido multiproducto: Pendiente, cantidades, codigo aleatorio y descuento', async () => {
  const a = await producto(10), b = await producto(5, 'Mochila');
  const r = await api('POST', '/pedidos', { nombreCliente: 'Ana', productos: [{ productoId: a.id, cantidad: 2 }, { productoId: b.id, cantidad: 3 }] });
  assert.equal(r.status, 201);
  assert.equal(r.body.estado, 'Pendiente');
  assert.match(r.body.codigoVerificacion, /^\d{6}$/);
  assert.deepEqual(r.body.productos, [{ productoId: a.id, nombreProducto: a.nombre, cantidad: 2 }, { productoId: b.id, nombreProducto: b.nombre, cantidad: 3 }]);
  assert.equal(await stock(a.id), 8); assert.equal(await stock(b.id), 2);
  const guardado = await db.pedido.findUniqueOrThrow({ where: { id: r.body.id } });
  assert.notEqual(guardado.codigoVerificacionHash, r.body.codigoVerificacion);
  assert.equal((await api('GET', '/pedidos/' + r.body.id)).body.codigoVerificacion, undefined);
  assert.equal((await api('GET', '/pedidos')).body[0].codigoVerificacionHash, undefined);
});
test('Producto inexistente: no crea ni descuenta otros productos', async () => {
  const a = await producto(10);
  const r = await api('POST', '/pedidos', { nombreCliente: 'Ana', productos: [{ productoId: a.id, cantidad: 2 }, { productoId: 2000000000, cantidad: 1 }] });
  assert.equal(r.status, 404); assert.equal(await stock(a.id), 10); assert.equal(await db.pedido.count(), 0);
});
test('Stock insuficiente: no deja descuentos parciales', async () => {
  const a = await producto(10), b = await producto(1);
  const r = await api('POST', '/pedidos', { nombreCliente: 'Ana', productos: [{ productoId: a.id, cantidad: 2 }, { productoId: b.id, cantidad: 2 }] });
  assert.equal(r.status, 409); assert.equal(await stock(a.id), 10); assert.equal(await stock(b.id), 1); assert.equal(await db.pedido.count(), 0);
});
test('IDs repetidos se agrupan y no evaden el stock', async () => {
  const a = await producto(5);
  const crear = cantidad => api('POST', '/pedidos', { nombreCliente: 'Ana', productos: [{ productoId: a.id, cantidad: 3 }, { productoId: a.id, cantidad }] });
  assert.equal((await crear(3)).status, 409); assert.equal(await stock(a.id), 5);
  const r = await crear(2);
  assert.equal(r.status, 201); assert.equal(r.body.productos.length, 1); assert.equal(r.body.productos[0].cantidad, 5); assert.equal(await stock(a.id), 0);
});
test('Valida cantidades, cliente, productos y campos controlados por el sistema', async () => {
  const a = await producto();
  for (const cantidad of [0, -1, 1.5, '2', 2147483648]) assert.equal((await api('POST', '/pedidos', { nombreCliente: 'Ana', productos: [{ productoId: a.id, cantidad }] })).status, 400);
  assert.equal((await api('POST', '/pedidos', { nombreCliente: 'Ana', productos: [] })).status, 400);
  assert.equal((await api('POST', '/pedidos', { nombreCliente: ' ', productos: [{ productoId: a.id, cantidad: 1 }] })).status, 400);
  for (const campo of ['estado', 'codigoVerificacion']) assert.equal((await api('POST', '/pedidos', { nombreCliente: 'Ana', productos: [{ productoId: a.id, cantidad: 1 }], [campo]: 'Recibido' })).status, 400);
  assert.equal(await stock(a.id), 10);
});
test('No recibe un Pendiente aunque el codigo sea correcto', async () => {
  const a = await producto(), p = await pedido(a.id);
  assert.equal((await api('PATCH', `/pedidos/${p.id}/recibir`, { codigoVerificacion: p.codigoVerificacion })).status, 409);
  assert.equal((await api('GET', `/pedidos/${p.id}`)).body.estado, 'Pendiente');
});
test('Recibir exige codigo presente, bien formado y correcto', async () => {
  const a = await producto(), p = await pedido(a.id);
  assert.equal((await api('PATCH', `/pedidos/${p.id}/enviar`)).status, 200);
  const incorrecto = p.codigoVerificacion === '123456' ? '654321' : '123456';
  for (const body of [{}, { codigoVerificacion: 123456 }, { codigoVerificacion: 'abc' }, { codigoVerificacion: incorrecto }]) assert.equal((await api('PATCH', `/pedidos/${p.id}/recibir`, body)).status, 400);
  assert.equal((await api('GET', `/pedidos/${p.id}`)).body.estado, 'Enviado');
});
test('Flujo completo sin repetir estados ni descontar stock nuevamente', async () => {
  const a = await producto(), p = await pedido(a.id, 'Ana', 2);
  assert.equal((await api('PATCH', `/pedidos/${p.id}/enviar`)).body.estado, 'Enviado');
  assert.equal((await api('PATCH', `/pedidos/${p.id}/enviar`)).status, 409);
  assert.equal((await api('PATCH', `/pedidos/${p.id}/recibir`, { codigoVerificacion: p.codigoVerificacion })).body.estado, 'Recibido');
  assert.equal((await api('PATCH', `/pedidos/${p.id}/recibir`, { codigoVerificacion: p.codigoVerificacion })).status, 409);
  assert.equal((await api('PATCH', `/pedidos/${p.id}/enviar`)).status, 409); assert.equal(await stock(a.id), 8);
});
test('Otro Pendiente del cliente bloquea recibir; normaliza nombre', async () => {
  const a = await producto(), primero = await pedido(a.id, ' José   Pérez '), segundo = await pedido(a.id, 'JOSE PEREZ');
  await api('PATCH', `/pedidos/${primero.id}/enviar`);
  const r = await api('PATCH', `/pedidos/${primero.id}/recibir`, { codigoVerificacion: primero.codigoVerificacion });
  assert.equal(r.status, 409); assert.match(r.body.message, /otro pedido Pendiente/);
  await api('PATCH', `/pedidos/${segundo.id}/enviar`);
  assert.equal((await api('PATCH', `/pedidos/${primero.id}/recibir`, { codigoVerificacion: primero.codigoVerificacion })).status, 200);
  assert.equal((await api('GET', '/pedidos?cliente=JOSE%20PEREZ')).body.length, 2);
});
test('Pendiente de otro cliente no bloquea recibir', async () => {
  const a = await producto(), ana = await pedido(a.id, 'Ana');
  await pedido(a.id, 'Luis'); await api('PATCH', `/pedidos/${ana.id}/enviar`);
  assert.equal((await api('PATCH', `/pedidos/${ana.id}/recibir`, { codigoVerificacion: ana.codigoVerificacion })).status, 200);
});
test('Compras simultaneas no venden mas stock del disponible', async () => {
  const a = await producto(5);
  const resultados = await Promise.all(['Ana', 'Luis'].map(nombreCliente => api('POST', '/pedidos', { nombreCliente, productos: [{ productoId: a.id, cantidad: 4 }] })));
  assert.deepEqual(resultados.map(r => r.status).sort(), [201, 409]); assert.equal(await stock(a.id), 1); assert.equal(await db.pedido.count(), 1);
});
test('IDs invalidos y pedidos inexistentes', async () => {
  assert.equal((await api('GET', '/pedidos/abc')).status, 400);
  assert.equal((await api('GET', '/pedidos/2000000000')).status, 404);
  assert.equal((await api('PATCH', '/pedidos/2000000000/enviar')).status, 404);
  assert.equal((await api('PATCH', '/pedidos/2000000000/recibir', { codigoVerificacion: '123456' })).status, 404);
});
test('Datos persisten al abrir otra conexion Prisma', async () => {
  const a = await producto(), p = await pedido(a.id), otra = new PrismaClient();
  try {
    assert.equal((await otra.pedido.findUniqueOrThrow({ where: { id: p.id } })).estado, 'Pendiente');
    assert.equal((await otra.producto.findUniqueOrThrow({ where: { id: a.id } })).stock, 9);
  } finally { await otra.$disconnect(); }
});
