// Genera db/carga_oficial.sql a partir de las plantillas CSV de db/plantillas/.
// Uso: node db/generar_inserts.mjs   (desde la carpeta del proyecto)
// Los INSERT usan claves naturales (grado+sección+tanda, nombre del docente), no IDs,
// y son idempotentes (ON CONFLICT): puede volver a ejecutarse sin duplicar registros.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const AREAS = { 1: ['LE', 'MAT'], 2: ['LE', 'MAT', 'CS', 'CN'] };
const TANDAS = ['Matutina', 'Vespertina', 'Nocturna', 'Extendida'];
const errores = [];

function parseCSV(txt) {
  const filas = []; let fila = [], campo = '', q = false;
  txt = txt.replace(/^\uFEFF/, '');
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (q) { if (c === '"' && txt[i + 1] === '"') { campo += '"'; i++; } else if (c === '"') q = false; else campo += c; }
    else if (c === '"') q = true;
    else if (c === ',' || c === ';') { fila.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && txt[i + 1] === '\n') i++; fila.push(campo); filas.push(fila); fila = []; campo = ''; }
    else campo += c;
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila); }
  const [cab, ...resto] = filas.filter(f => f.some(x => x.trim()));
  resto.forEach((f, i) => { if (f.length > cab.length) errores.push(`${actual} fila ${i + 2}: tiene más columnas que el encabezado (¿un nombre con coma sin comillas? escriba "Apellidos, Nombres")`); });
  return resto.map(f => Object.fromEntries(cab.map((h, i) => [h.trim().toLowerCase(), (f[i] ?? '').trim()])));
}
let actual = '';
const leer = n => (actual = n, parseCSV(readFileSync(join(DIR, 'plantillas', n), 'utf8')));
const lit = v => (v === '' || v == null) ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
const tanda = t => { const x = TANDAS.find(v => v.toLowerCase() === (t || 'Matutina').toLowerCase()); return x; };
const secRef = (g, s, t) => `(SELECT id FROM secciones WHERE grado=${g} AND seccion=${lit(s)} AND tanda=${lit(t)})`;

const centro = leer('centro.csv'), docentes = leer('docentes.csv'), secciones = leer('secciones.csv');
const asignaciones = leer('asignaciones.csv'), estudiantes = leer('estudiantes.csv');
const out = ['-- Carga oficial generada ' + new Date().toISOString(), 'BEGIN;'];

// Centro educativo (una fila por ciclo)
for (const [i, c] of centro.entries()) {
  if (!['1', '2'].includes(c.ciclo)) errores.push(`centro.csv fila ${i + 2}: ciclo debe ser 1 o 2`);
  if (!/^\d{5}$/.test(c.codigo_sigerd)) errores.push(`centro.csv fila ${i + 2}: el código SIGERD debe tener exactamente 5 dígitos`);
  out.push(`INSERT INTO centro VALUES (${c.ciclo},${lit(c.correo)},${lit(c.codigo_sigerd)},${lit(c.nombre)},${lit(c.regional)},${lit(c.distrito)},${lit(c.sector)},${lit(c.tipo)},${lit(c.tanda)})
  ON CONFLICT (ciclo) DO UPDATE SET correo=EXCLUDED.correo,codigo_sigerd=EXCLUDED.codigo_sigerd,nombre=EXCLUDED.nombre,regional=EXCLUDED.regional,distrito=EXCLUDED.distrito,sector=EXCLUDED.sector,tipo=EXCLUDED.tipo,tanda=EXCLUDED.tanda;`);
}

// Docentes
const nomDoc = new Set();
for (const [i, d] of docentes.entries()) {
  if (!d.nombre) { errores.push(`docentes.csv fila ${i + 2}: falta el nombre`); continue; }
  if (nomDoc.has(d.nombre)) errores.push(`docentes.csv fila ${i + 2}: docente repetido "${d.nombre}"`);
  nomDoc.add(d.nombre);
  out.push(`INSERT INTO docentes(nombre,correo) VALUES (${lit(d.nombre)},${lit(d.correo)}) ON CONFLICT (nombre) DO UPDATE SET correo=EXCLUDED.correo;`);
}

// Secciones
const claves = new Map();
for (const [i, s] of secciones.entries()) {
  const g = +s.grado, ci = +s.ciclo, t = tanda(s.tanda);
  if (!t) { errores.push(`secciones.csv fila ${i + 2}: tanda no válida "${s.tanda}"`); continue; }
  if (!((ci === 1 && g >= 1 && g <= 3) || (ci === 2 && g >= 4 && g <= 6))) { errores.push(`secciones.csv fila ${i + 2}: grado ${s.grado} no corresponde al ciclo ${s.ciclo}`); continue; }
  if (!s.seccion) { errores.push(`secciones.csv fila ${i + 2}: falta la sección`); continue; }
  claves.set(`${g}|${s.seccion}|${t}`, ci);
  out.push(`INSERT INTO secciones(ciclo,grado,seccion,tanda) VALUES (${ci},${g},${lit(s.seccion)},${lit(t)}) ON CONFLICT (grado,seccion,tanda) DO NOTHING;`);
}
const sec = (r, arch, i) => {
  const t = tanda(r.tanda), k = `${+r.grado}|${r.seccion}|${t}`;
  if (!claves.has(k)) { errores.push(`${arch} fila ${i + 2}: la sección ${r.grado}° ${r.seccion} (${r.tanda || 'Matutina'}) no está en secciones.csv`); return null; }
  return { ref: secRef(+r.grado, r.seccion, t), ciclo: claves.get(k) };
};

// Asignaciones docente-sección-área
for (const [i, a] of asignaciones.entries()) {
  const s = sec(a, 'asignaciones.csv', i); if (!s) continue;
  const area = a.area.toUpperCase();
  if (!AREAS[s.ciclo].includes(area)) { errores.push(`asignaciones.csv fila ${i + 2}: área "${a.area}" no válida para el ciclo ${s.ciclo} (${AREAS[s.ciclo].join(', ')})`); continue; }
  if (!nomDoc.has(a.docente)) { errores.push(`asignaciones.csv fila ${i + 2}: docente "${a.docente}" no está en docentes.csv`); continue; }
  out.push(`INSERT INTO asignaciones(docente_id,seccion_id,area) VALUES ((SELECT id FROM docentes WHERE nombre=${lit(a.docente)}),${s.ref},${lit(area)}) ON CONFLICT (seccion_id,area) DO UPDATE SET docente_id=EXCLUDED.docente_id;`);
}

// Estudiantes por sección
for (const [i, e] of estudiantes.entries()) {
  const s = sec(e, 'estudiantes.csv', i); if (!s) continue;
  if (!e.nombre) { errores.push(`estudiantes.csv fila ${i + 2}: falta el nombre`); continue; }
  out.push(`INSERT INTO estudiantes(seccion_id,nombre) VALUES (${s.ref},${lit(e.nombre)}) ON CONFLICT (seccion_id,nombre) DO UPDATE SET activo=TRUE;`);
}
out.push('COMMIT;');

if (errores.length) { console.error('No se generó el archivo. Corrija:\n- ' + errores.join('\n- ')); process.exit(1); }
writeFileSync(join(DIR, 'carga_oficial.sql'), out.join('\n') + '\n');
console.log(`carga_oficial.sql generado: ${centro.length} centro, ${docentes.length} docentes, ${secciones.length} secciones, ${asignaciones.length} asignaciones, ${estudiantes.length} estudiantes.`);
