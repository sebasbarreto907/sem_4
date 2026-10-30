# Ejercicio semana 4 — Aplicaciones de servidor

API de pedidos y productos con Nest.js, TypeScript, Prisma 6.19.3 y SQLite. Reglas de negocio en los Service; los Controller reciben solicitudes y delegan.

## Ejecutar en VS Code

1. Abre esta carpeta desde Archivo > Abrir carpeta.
2. Abre Terminal > Nueva terminal. Requiere Node.js 22 o superior.
3. Si falta .env, copia .env.example como .env.
4. Ejecuta uno por uno:

```powershell
npm install
npm run setup
npm start
```

setup genera el cliente Prisma, aplica la migración, agrega tres productos de ejemplo y compila. La base real queda en prisma/pedidos.db. Se entrega con Cuaderno, Lápiz y Mochila y sin pedidos de prueba. Repetir el seed no restablece stock existente.

Servidor: http://localhost:3001. Se usa 3001 para no ocupar el puerto del proyecto anterior; puedes cambiar PORT en .env.

- Productos y stock: http://localhost:3001/productos
- Pedidos: http://localhost:3001/pedidos
- Ver tablas: ejecuta `npm run db:studio` y abre el enlace mostrado.
- Depurar: F5 > Iniciar API de pedidos. Detén cualquier instancia en el mismo puerto.

Es una API: devuelve JSON, sin página web.

## Reglas del ejercicio

| Regla | Implementación |
| --- | --- |
| Tres estados | Pendiente, Enviado, Recibido en el enum Prisma |
| Producto existente | Valida todos los IDs en PedidosService |
| Stock suficiente | Suma cantidades de IDs repetidos antes de validar |
| Stock baja al crear | Transacción y descuento condicionado al stock |
| Otro pendiente del cliente impide recibir | Consulta dentro de la transacción de recepción |
| Antes de recibir debe estar enviado | Solo Pendiente → Enviado → Recibido |
| Código generado por el sistema | crypto.randomInt genera seis dígitos; código correcto obligatorio |
| Varios productos sin tabla intermedia | Arreglo JSON en Pedido.productos |
| Reglas en Service | PedidosService y ProductosService |

**Interpretación:** entregado y recibido son el mismo estado final. La frase de estados del producto se aplica al pedido; el producto tiene nombre, descripción y stock. Se pueden crear varios pedidos pendientes, pero el cliente no puede recibir uno mientras tenga otro pendiente. Esta regla se comprueba al recibir, no al crear. Otro pedido Enviado no bloquea la recepción.

Sin tabla de clientes, el nombre identifica al cliente: se ignoran espacios repetidos, mayúsculas y tildes. Dos personas con el mismo nombre se consideran el mismo cliente.

## Dos tablas de negocio

- productos: id, nombre, descripcion, stock.
- pedidos: id, nombreCliente, clienteClave, estado, productos (JSON), codigoVerificacionHash y fechas.

Ejemplo de productos dentro del pedido:

```json
[
  { "productoId": 1, "nombreProducto": "Cuaderno", "cantidad": 2 },
  { "productoId": 2, "nombreProducto": "Lápiz", "cantidad": 3 }
]
```

No hay tabla de detalle ni de clientes. El nombre del producto se conserva como copia histórica. El Service valida las referencias del JSON; no hay clave foránea por elemento. Prisma crea su tabla interna _prisma_migrations y SQLite puede mostrar sqlite_sequence; no son tablas de negocio.

## Endpoints necesarios

| Método | Ruta | Uso |
| --- | --- | --- |
| POST | /productos | Crear producto con stock inicial |
| GET | /productos | Listar productos y stock |
| POST | /pedidos | Crear, descontar stock y generar código |
| GET | /pedidos | Listar; filtro opcional ?cliente=Ana |
| GET | /pedidos/:id | Consultar pedido |
| PATCH | /pedidos/:id/enviar | Pendiente a Enviado |
| PATCH | /pedidos/:id/recibir | Validar código y pasar a Recibido |

Crear producto:

```json
{ "nombre": "Regla", "descripcion": "Regla de 30 cm", "stock": 20 }
```

Crear pedido:

```json
{
  "nombreCliente": "Ana",
  "productos": [
    { "productoId": 1, "cantidad": 2 },
    { "productoId": 2, "cantidad": 3 }
  ]
}
```

La respuesta incluye id, estado Pendiente, productos y codigoVerificacion. **Guarda el código**: solo se entrega al crear. La base guarda su hash; los GET no exponen ni código ni hash.

Enviar no requiere cuerpo. Recibir requiere el código real como texto:

```json
{ "codigoVerificacion": "123456" }
```

El valor anterior es ilustrativo. El cliente no puede elegir estado, código o nombre del producto al crear. Las cantidades son enteros positivos y el stock admite cero. Enviar y recibir no descuentan stock nuevamente.

Errores: 400 entrada inválida/código incorrecto; 404 producto/pedido inexistente; 409 stock insuficiente o regla de estado/cliente; 503 base ocupada tras reintentos.

## Pruebas

```powershell
npm test
```

Usan una base SQLite temporal y no tocan datos reales. Comprueban las reglas, JSON multiproducto, descuentos completos, IDs repetidos, entradas inválidas, códigos, estados, otro pendiente, persistencia y compras simultáneas.

En peticiones.http hay ejemplos para REST Client (opcional) o para copiar a Postman.

Cambiar modelos: `npm run db:migrate -- --name nombre_del_cambio`. Aplicar migraciones existentes: `npm run db:deploy`.

## Archivos principales

```text
prisma/schema.prisma              Modelos y enum
prisma/migrations/                Migración SQL
prisma/seed.cjs                    Productos de ejemplo
prisma/pedidos.db                  Base SQLite real
src/pedidos/pedidos.service.ts     Reglas y transacciones
src/productos/productos.service.ts Reglas de productos
src/prisma/prisma.service.ts       Conexión Prisma
src/common/validacion.ts           Validación de entradas
test/pedidos.test.cjs              Pruebas de integración
peticiones.http                   Solicitudes de ejemplo
```

Referencia: [documentación oficial de Prisma sobre SQLite](https://www.prisma.io/docs/orm/overview/databases/sqlite). Se fija Prisma 6 y su conexión en schema.prisma; no necesita actualizar a Prisma 7.

Se fijan overrides para multer 2.5.0 y deepmerge-ts 8.0.0 para corregir las alertas transitivas detectadas por npm. Las versiones quedan registradas en package-lock.json.
