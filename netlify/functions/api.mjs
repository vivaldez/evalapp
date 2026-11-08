import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
const pinOk = (c, p) => { const v = process.env['COORD_PIN_' + c] || ''; return !!v && p === v; };
const j = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json' } });

export default async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^.*\/api\/?/, '').replace(/^\.netlify\/functions\/api\/?/, '');
  const q = Object.fromEntries(url.searchParams);
  const body = req.method !== 'GET' ? await req.json().catch(() => ({})) : {};
  try {
    switch (`${req.method} ${path}`) {
      case 'GET docentes': // docentes con asignaciones del ciclo
        return j(await sql`SELECT d.id, d.nombre, json_agg(json_build_object('asig',a.id,'seccion_id',s.id,'grado',s.grado,'seccion',s.seccion,'tanda',s.tanda,'area',a.area) ORDER BY s.grado,s.seccion,a.area) AS asignaciones
          FROM docentes d JOIN asignaciones a ON a.docente_id=d.id JOIN secciones s ON s.id=a.seccion_id
          WHERE s.ciclo=${q.ciclo} AND d.activo GROUP BY d.id ORDER BY d.nombre`);
      case 'GET estudiantes':
        return j(await sql`SELECT id,nombre FROM estudiantes WHERE seccion_id=${q.seccion} AND activo ORDER BY nombre`);
      case 'POST estudiantes':
        if (!body.nombre?.trim()) return j({ error: 'Nombre requerido' }, 400);
        return j((await sql`INSERT INTO estudiantes(seccion_id,nombre) VALUES (${body.seccion_id},${body.nombre.trim()}) RETURNING id,nombre`)[0]);
      case 'PUT estudiantes':
        await sql`UPDATE estudiantes SET nombre=${body.nombre.trim()} WHERE id=${body.id}`; return j({ ok: true });
      case 'DELETE estudiantes': // baja lógica, no borra historial
        await sql`UPDATE estudiantes SET activo=false WHERE id=${body.id}`; return j({ ok: true });
      case 'GET resultados': {
        const r = await sql`SELECT r.estudiante_id,r.indicador,r.nivel FROM resultados r JOIN estudiantes e ON e.id=r.estudiante_id
          WHERE e.seccion_id=${q.seccion} AND r.periodo=${q.periodo} AND r.area=${q.area}`;
        const l = await sql`SELECT l.estudiante_id,l.nivel FROM lectura l JOIN estudiantes e ON e.id=l.estudiante_id WHERE e.seccion_id=${q.seccion} AND l.periodo=${q.periodo}`;
        return j({ resultados: r, lectura: l });
      }
      case 'POST resultados': { // {periodo, area, filas:[{estudiante_id, indicador, nivel}], lectura:[{estudiante_id,nivel}]}
        for (const f of body.filas || []) {
          if (f.nivel) await sql`INSERT INTO resultados(estudiante_id,periodo,area,indicador,nivel) VALUES (${f.estudiante_id},${body.periodo},${body.area},${f.indicador},${f.nivel})
            ON CONFLICT (estudiante_id,periodo,area,indicador) DO UPDATE SET nivel=EXCLUDED.nivel, actualizado=now()`;
          else await sql`DELETE FROM resultados WHERE estudiante_id=${f.estudiante_id} AND periodo=${body.periodo} AND area=${body.area} AND indicador=${f.indicador}`;
        }
        for (const f of body.lectura || []) {
          if (f.nivel) await sql`INSERT INTO lectura VALUES (${f.estudiante_id},${body.periodo},${f.nivel}) ON CONFLICT (estudiante_id,periodo) DO UPDATE SET nivel=EXCLUDED.nivel`;
          else await sql`DELETE FROM lectura WHERE estudiante_id=${f.estudiante_id} AND periodo=${body.periodo}`;
        }
        return j({ ok: true });
      }
      case 'GET consolidado': { // por grado/área/indicador/nivel del ciclo y tanda
        const res = await sql`SELECT s.grado,s.id AS seccion_id,r.area,r.indicador,r.nivel,count(*)::int n FROM resultados r JOIN estudiantes e ON e.id=r.estudiante_id AND e.activo
          JOIN secciones s ON s.id=e.seccion_id WHERE s.ciclo=${q.ciclo} AND r.periodo=${q.periodo} AND (${q.tanda || null}::text IS NULL OR s.tanda=${q.tanda || null})
          GROUP BY 1,2,3,4,5`;
        const lec = await sql`SELECT s.grado,s.id AS seccion_id,l.nivel,count(*)::int n FROM lectura l JOIN estudiantes e ON e.id=l.estudiante_id AND e.activo
          JOIN secciones s ON s.id=e.seccion_id WHERE s.ciclo=${q.ciclo} AND l.periodo=${q.periodo} AND (${q.tanda || null}::text IS NULL OR s.tanda=${q.tanda || null}) GROUP BY 1,2,3`;
        const mat = await sql`SELECT s.id seccion_id,s.grado,s.seccion,s.tanda,count(e.id)::int n FROM secciones s LEFT JOIN estudiantes e ON e.seccion_id=s.id AND e.activo
          WHERE s.ciclo=${q.ciclo} AND (${q.tanda || null}::text IS NULL OR s.tanda=${q.tanda || null}) GROUP BY s.id ORDER BY s.grado,s.seccion`;
        const asig = await sql`SELECT a.seccion_id,a.area,d.nombre FROM asignaciones a JOIN docentes d ON d.id=a.docente_id JOIN secciones s ON s.id=a.seccion_id WHERE s.ciclo=${q.ciclo}`;
        return j({ res, lec, mat, asig });
      }
      case 'GET centro':
        return j((await sql`SELECT * FROM centro WHERE ciclo=${q.ciclo}`)[0] || {});
      case 'POST centro': {
        if (!pinOk(body.ciclo, body.pin)) return j({ error: 'PIN de coordinación inválido' }, 403);
        const c = body.centro;
        await sql`INSERT INTO centro VALUES (${body.ciclo},${c.correo},${c.codigo_sigerd},${c.nombre},${c.regional},${c.distrito},${c.sector},${c.tipo},${c.tanda})
          ON CONFLICT (ciclo) DO UPDATE SET correo=EXCLUDED.correo,codigo_sigerd=EXCLUDED.codigo_sigerd,nombre=EXCLUDED.nombre,regional=EXCLUDED.regional,
          distrito=EXCLUDED.distrito,sector=EXCLUDED.sector,tipo=EXCLUDED.tipo,tanda=EXCLUDED.tanda`;
        return j({ ok: true });
      }
      case 'POST login-coord':
        return j({ ok: pinOk(body.ciclo, body.pin) });
      default: return j({ error: 'Ruta no encontrada: ' + path }, 404);
    }
  } catch (e) { return j({ error: e.message }, 500); }
};
