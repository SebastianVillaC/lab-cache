-- Esquema y datos semilla. Se ejecuta una sola vez, al crear el volumen de PostgreSQL.

CREATE TABLE productos (
  id              SERIAL PRIMARY KEY,
  nombre          TEXT          NOT NULL CHECK (length(trim(nombre)) > 0),
  precio          NUMERIC(10,2) NOT NULL CHECK (precio >= 0),
  stock           INTEGER       NOT NULL DEFAULT 0 CHECK (stock >= 0),
  actualizado_en  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

INSERT INTO productos (nombre, precio, stock) VALUES
  ('Teclado mecánico', 189900.00, 15),
  ('Mouse inalámbrico',  59900.50, 40),
  ('Monitor 24"',       749000.00,  8),
  ('Audífonos USB',      99000.00, 25);
