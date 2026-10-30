CREATE TABLE "productos" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "nombre" TEXT NOT NULL,
  "descripcion" TEXT NOT NULL,
  "stock" INTEGER NOT NULL CHECK ("stock" >= 0)
);
CREATE TABLE "pedidos" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "nombreCliente" TEXT NOT NULL,
  "clienteClave" TEXT NOT NULL,
  "estado" TEXT NOT NULL DEFAULT 'Pendiente' CHECK ("estado" IN ('Pendiente', 'Enviado', 'Recibido')),
  "productos" JSONB NOT NULL,
  "codigoVerificacionHash" TEXT NOT NULL,
  "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizadoEn" DATETIME NOT NULL
);
CREATE INDEX "pedidos_clienteClave_estado_idx" ON "pedidos"("clienteClave", "estado");
