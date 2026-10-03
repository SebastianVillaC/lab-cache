// Acceso a datos de productos (dueño: Integrante A). Todas las consultas son parametrizadas.
import * as db from './db.ts';

export type Producto = {
  id: number;
  nombre: string;
  precio: number;
  stock: number;
  actualizado_en: string;
};

export type DatosProducto = Pick<Producto, 'nombre' | 'precio' | 'stock'>;

type FilaProducto = {
  id: number;
  nombre: string;
  precio: string; // pg devuelve NUMERIC como string para no perder precisión
  stock: number;
  actualizado_en: Date;
};

// Único punto de conversión de tipos (mitiga R5). El resultado solo tiene números y strings,
// así que JSON.parse(JSON.stringify(p)) es idéntico a p: un HIT responde lo mismo que un MISS.
export function normalizar(fila: FilaProducto): Producto {
  return {
    id: fila.id,
    nombre: fila.nombre,
    precio: Number(fila.precio),
    stock: fila.stock,
    actualizado_en: fila.actualizado_en.toISOString(),
  };
}

const COLUMNAS = 'id, nombre, precio, stock, actualizado_en';

export async function buscarPorId(id: number): Promise<Producto | null> {
  const { rows } = await db.query<FilaProducto>(
    `SELECT ${COLUMNAS} FROM productos WHERE id = $1`,
    [id],
  );
  return rows[0] ? normalizar(rows[0]) : null;
}

export async function crear(datos: DatosProducto): Promise<Producto> {
  const { rows } = await db.query<FilaProducto>(
    `INSERT INTO productos (nombre, precio, stock) VALUES ($1, $2, $3) RETURNING ${COLUMNAS}`,
    [datos.nombre, datos.precio, datos.stock],
  );
  return normalizar(rows[0]!);
}

export async function actualizar(id: number, datos: DatosProducto): Promise<Producto | null> {
  const { rows } = await db.query<FilaProducto>(
    `UPDATE productos
        SET nombre = $1, precio = $2, stock = $3, actualizado_en = now()
      WHERE id = $4
      RETURNING ${COLUMNAS}`,
    [datos.nombre, datos.precio, datos.stock, id],
  );
  return rows[0] ? normalizar(rows[0]) : null;
}
