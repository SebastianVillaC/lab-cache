// Validación de entrada (dueño: Integrante A). Funciones puras: no tocan la BD ni la caché.
import type { DatosProducto } from './productos.ts';

export type Validacion<T> = { ok: true; valor: T } | { ok: false; errores: string[] };

const MAX_INT4 = 2_147_483_647; // límite de SERIAL / INTEGER en PostgreSQL
const MAX_PRECIO = 99_999_999.99; // límite de NUMERIC(10,2)

export function validarId(texto: string): Validacion<number> {
  if (!/^[1-9]\d*$/.test(texto) || Number(texto) > MAX_INT4) {
    return { ok: false, errores: ['id debe ser un entero positivo'] };
  }
  return { ok: true, valor: Number(texto) };
}

// En POST el stock es opcional (0 por defecto); en PUT se reemplaza el recurso completo.
export function validarProducto(
  body: unknown,
  { stockObligatorio }: { stockObligatorio: boolean },
): Validacion<DatosProducto> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, errores: ['el cuerpo debe ser un objeto JSON'] };
  }
  const { nombre, precio, stock } = body as Record<string, unknown>;
  const errores: string[] = [];

  if (typeof nombre !== 'string' || nombre.trim() === '') {
    errores.push('nombre es obligatorio y no puede estar vacío');
  }

  if (
    typeof precio !== 'number' ||
    !Number.isFinite(precio) ||
    precio < 0 ||
    precio > MAX_PRECIO ||
    Math.round(precio * 100) / 100 !== precio
  ) {
    errores.push(`precio debe ser un número entre 0 y ${MAX_PRECIO} con máximo 2 decimales`);
  }

  if (stock === undefined && stockObligatorio) {
    errores.push('stock es obligatorio');
  } else if (
    stock !== undefined &&
    (typeof stock !== 'number' || !Number.isInteger(stock) || stock < 0 || stock > MAX_INT4)
  ) {
    errores.push('stock debe ser un entero mayor o igual a 0');
  }

  if (errores.length > 0) return { ok: false, errores };
  return {
    ok: true,
    valor: {
      nombre: (nombre as string).trim(),
      precio: precio as number,
      stock: (stock as number | undefined) ?? 0,
    },
  };
}
