# Sistema de Evaluación Diagnóstica y de Seguimiento – Nivel Primario

Una sola aplicación para los dos ciclos (1.º–3.º y 4.º–6.º) y los cuatro periodos:
Diagnóstica (septiembre) y Seguimiento (noviembre, marzo y mayo). El periodo se elige en el encabezado.

## Estructura
- `public/` – frontend estático (Netlify): `index.html`, `app.js`, `data.js` (indicadores oficiales)
- `netlify/functions/api.mjs` – API serverless conectada a Neon
- `db/schema.sql` – tablas de Neon (sin datos de prueba)

## Despliegue
1. **Neon**: cree el proyecto, abra el *SQL Editor* y ejecute `db/schema.sql`.
2. Cargue los listados oficiales en este orden: `docentes` → `secciones` → `asignaciones` → `estudiantes`
   (con INSERT o importando CSV; el formato está comentado al final de `schema.sql`).
3. **Netlify**: suba la carpeta a GitHub y conéctela (o use `netlify deploy`). En *Site settings → Environment variables*:
   - `DATABASE_URL` = cadena de conexión de Neon (pooled)
   - `COORD_PIN_1` = PIN de la coordinadora del Primer Ciclo
   - `COORD_PIN_2` = PIN de la coordinadora del Segundo Ciclo
4. Netlify instala `@neondatabase/serverless` desde `package.json` de forma automática.

## Uso
- **Docentes**: Inicio → ciclo → su tarjeta → grado/sección/área. Marque E/A/S por indicador (y nivel de lectura en LE) y pulse **Guardar**.
  Pueden inscribir, editar o retirar estudiantes (al retirar, se conserva el historial). «Instrumento oficial (PDF)» imprime la matriz del docente.
- **Coordinación** (PIN por ciclo, sin ver el otro ciclo): avance por docente, **Sistematización para el Distrito**
  (mismo orden y campos que el formulario oficial, y avisa cuando la suma no coincide con la matrícula), análisis con gráficos
  e indicadores prioritarios, y datos del centro. Todo se exporta con «Exportar PDF» (Guardar como PDF).

## Pendiente de completar con los documentos oficiales
- Rúbricas E/A/S: están cargadas las de Lengua Española de 4.º. Las demás se agregan en `data.js` como tercer elemento
  de cada indicador: `{E:'…', A:'…', S:'…'}`.
- Nota: los indicadores de las convocatorias de septiembre, marzo y mayo pueden variar. Si cambian, conviene versionar `IND` por periodo.

## Carga de los listados oficiales (centro, docentes, secciones, asignaciones y estudiantes)

1. Ejecute `db/schema.sql` en el SQL Editor de Neon (crea las tablas, una sola vez).
2. Complete las plantillas de `db/plantillas/` (Excel → "Guardar como CSV UTF-8"; se acepta coma o punto y coma):
   - `centro.csv`: `ciclo,correo,codigo_sigerd,nombre,regional,distrito,sector,tipo,tanda` (una fila por ciclo; SIGERD de 5 dígitos).
   - `docentes.csv`: `nombre,correo`.
   - `secciones.csv`: `ciclo,grado,seccion,tanda` (ciclo 1 = grados 1–3, ciclo 2 = grados 4–6; tanda: Matutina, Vespertina, Nocturna o Extendida).
   - `asignaciones.csv`: `docente,grado,seccion,tanda,area` (área: LE, MAT en 1.er ciclo; LE, MAT, CS, CN en 2.º ciclo). El nombre del docente debe ser igual al de `docentes.csv`.
   - `estudiantes.csv`: `grado,seccion,tanda,nombre`. Si el nombre lleva coma, escríbalo entre comillas: `"Apellidos, Nombres"`.
3. Ejecute `node db/generar_inserts.mjs`. Valida todo y, si no hay errores, crea `db/carga_oficial.sql`.
4. Pegue y ejecute `db/carga_oficial.sql` en el SQL Editor de Neon. Va en una transacción (BEGIN/COMMIT): o entra todo o nada.

Los INSERT usan grado + sección + tanda y el nombre del docente, no números de ID, y no duplican registros si se vuelven a ejecutar. Sirve para actualizar listados: un estudiante nuevo se agrega y un cambio de docente reemplaza la asignación del área. Los resultados de evaluación ya registrados no se tocan.
