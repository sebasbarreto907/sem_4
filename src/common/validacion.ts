import { BadRequestException } from '@nestjs/common';
export function objeto(valor: unknown): Record<string, unknown> {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) throw new BadRequestException('El cuerpo debe ser un objeto JSON.');
  return valor as Record<string, unknown>;
}
export function camposPermitidos(datos: Record<string, unknown>, campos: string[]): void {
  const extras = Object.keys(datos).filter(campo => !campos.includes(campo));
  if (extras.length) throw new BadRequestException(`Campos no permitidos: ${extras.join(', ')}.`);
}
export function texto(valor: unknown, campo: string, maximo = 120): string {
  if (typeof valor !== 'string' || !valor.trim() || valor.trim().length > maximo) throw new BadRequestException(`${campo} debe ser texto de 1 a ${maximo} caracteres.`);
  return valor.trim().replace(/\s+/g, ' ');
}
export function entero(valor: unknown, campo: string, minimo = 1): number {
  if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < minimo || valor > 2147483647) throw new BadRequestException(`${campo} debe ser un entero entre ${minimo} y 2147483647.`);
  return valor;
}
export function idValido(valor: string): number {
  if (!/^[1-9]\d*$/.test(valor)) throw new BadRequestException('El ID debe ser un entero positivo.');
  return entero(Number(valor), 'id');
}
