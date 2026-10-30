const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const productos = [
    { id: 1, nombre: 'Cuaderno', descripcion: 'Cuaderno de 100 hojas', stock: 30 },
    { id: 2, nombre: 'Lápiz', descripcion: 'Lápiz de grafito HB', stock: 50 },
    { id: 3, nombre: 'Mochila', descripcion: 'Mochila escolar', stock: 10 },
  ];
  for (const producto of productos) {
    await prisma.producto.upsert({ where: { id: producto.id }, update: {}, create: producto });
  }
  console.log('Productos de ejemplo listos. No se modifica el stock existente.');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
