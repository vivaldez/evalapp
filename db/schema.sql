-- Esquema Neon (PostgreSQL). Ejecutar una vez en el SQL Editor de Neon.
CREATE TABLE IF NOT EXISTS centro (
  ciclo SMALLINT PRIMARY KEY CHECK (ciclo IN (1,2)),
  correo TEXT, codigo_sigerd CHAR(5), nombre TEXT, regional TEXT, distrito TEXT,
  sector TEXT, tipo TEXT, tanda TEXT);
CREATE TABLE IF NOT EXISTS docentes (
  id SERIAL PRIMARY KEY, nombre TEXT NOT NULL UNIQUE, correo TEXT UNIQUE, activo BOOLEAN DEFAULT TRUE);
CREATE TABLE IF NOT EXISTS secciones (
  id SERIAL PRIMARY KEY, ciclo SMALLINT NOT NULL CHECK (ciclo IN (1,2)),
  grado SMALLINT NOT NULL CHECK (grado BETWEEN 1 AND 6), seccion TEXT NOT NULL,
  tanda TEXT NOT NULL DEFAULT 'Matutina' CHECK (tanda IN ('Matutina','Vespertina','Nocturna','Extendida')),
  CHECK ((ciclo=1 AND grado BETWEEN 1 AND 3) OR (ciclo=2 AND grado BETWEEN 4 AND 6)),
  UNIQUE (grado, seccion, tanda));
-- area: LE, MAT, CS, CN
CREATE TABLE IF NOT EXISTS asignaciones (
  id SERIAL PRIMARY KEY, docente_id INT REFERENCES docentes(id) ON DELETE CASCADE,
  seccion_id INT REFERENCES secciones(id) ON DELETE CASCADE, area TEXT NOT NULL CHECK (area IN ('LE','MAT','CS','CN')),
  UNIQUE (seccion_id, area));
CREATE TABLE IF NOT EXISTS estudiantes (
  id SERIAL PRIMARY KEY, seccion_id INT REFERENCES secciones(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL, activo BOOLEAN DEFAULT TRUE, creado TIMESTAMPTZ DEFAULT now(),
  UNIQUE (seccion_id, nombre));
-- periodo: DIAG-SEP, SEG-NOV, SEG-MAR, SEG-MAY
CREATE TABLE IF NOT EXISTS resultados (
  estudiante_id INT REFERENCES estudiantes(id) ON DELETE CASCADE, periodo TEXT NOT NULL,
  area TEXT NOT NULL, indicador TEXT NOT NULL, nivel CHAR(1) CHECK (nivel IN ('E','A','S')),
  actualizado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (estudiante_id, periodo, area, indicador));
-- nivel de lectura: F=Fluido N=No fluido P=Palabras S=Sílabas I=Imágenes
CREATE TABLE IF NOT EXISTS lectura (
  estudiante_id INT REFERENCES estudiantes(id) ON DELETE CASCADE, periodo TEXT NOT NULL,
  nivel CHAR(1) CHECK (nivel IN ('F','N','P','S','I')), PRIMARY KEY (estudiante_id, periodo));
CREATE INDEX IF NOT EXISTS ix_est_sec ON estudiantes(seccion_id);
CREATE INDEX IF NOT EXISTS ix_res_per ON resultados(periodo, area);
-- Claves únicas usadas por la carga oficial (también sirven si las tablas ya existían)
CREATE UNIQUE INDEX IF NOT EXISTS ux_doc_nombre ON docentes(nombre);
CREATE UNIQUE INDEX IF NOT EXISTS ux_est_sec_nombre ON estudiantes(seccion_id, nombre);

-- CARGA DE LISTADOS OFICIALES
-- No se incluyen datos aquí. Complete las plantillas CSV de db/plantillas/ y ejecute:
--   node db/generar_inserts.mjs
-- Eso produce db/carga_oficial.sql (INSERTs listos para el SQL Editor de Neon).
