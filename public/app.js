import { PERIODOS, AREAS, GRADOS, LECTURA, NIVELES, IND, lecturaDe } from './data.js';
const $ = s => document.querySelector(s), app = $('#app');
const api = async (p, o = {}) => { const r = await fetch('/api/' + p, { headers: { 'content-type': 'application/json' }, ...o, body: o.body && JSON.stringify(o.body) }); const d = await r.json(); if (!r.ok) throw new Error(d.error || r.status); return d; };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const st = { ciclo: +sessionStorage.ciclo || 0, periodo: sessionStorage.periodo || 'SEG-NOV', pin: '' };
const sel = $('#periodo'); sel.innerHTML = Object.entries(PERIODOS).map(([k, v]) => `<option value="${k}">${v}</option>`).join(''); sel.value = st.periodo;
sel.onchange = () => { st.periodo = sessionStorage.periodo = sel.value; route(); };
$('#home').onclick = () => go(''); $('#coord').onclick = () => go('coord');
const go = h => location.hash = h; window.onhashchange = () => route();
const err = e => app.innerHTML = `<div class="card warn">Error: ${esc(e.message)}</div>`;
const areasCiclo = c => c === 1 ? ['LE', 'MAT'] : ['LE', 'MAT', 'CS', 'CN'];
const indicadores = (g, a) => IND[g]?.[a] || [];

async function route() {
  const [v, ...p] = location.hash.slice(1).split('/');
  $('#hc').textContent = st.ciclo ? `· ${st.ciclo === 1 ? 'Primer' : 'Segundo'} Ciclo · ${PERIODOS[st.periodo]}` : '';
  try {
    if (!v) return landing();
    if (v === 'ciclo') { st.ciclo = sessionStorage.ciclo = +p[0]; return dashboard(); }
    if (v === 'doc') return docente(+p[0]);
    if (v === 'mat') return matriz(+p[0], p[1], +p[2], p[3]);
    if (v === 'coord') return coord(p[0] || 'progreso');
  } catch (e) { err(e); }
}

function landing() {
  app.innerHTML = `<div class="hero"><p class="mu">Dirección de Educación Primaria · Año Escolar 2026-2027</p>
  <h2>Sistema de Registro y Consolidación de Evaluaciones</h2>
  <p class="mu">Diagnóstica (septiembre) y de Seguimiento (noviembre, marzo y mayo). Registre los resultados por estudiante, consulte los indicadores y rúbricas, y genere los instrumentos oficiales de consolidación y la Sistematización para el Distrito.</p></div>
  <div class="grid" style="max-width:800px;margin:auto">${[1, 2].map(c => `<div class="card big" onclick="location.hash='ciclo/${c}'">
  <div class="kpi">${c === 1 ? '1er' : '2do'} Ciclo</div><b>${c === 1 ? '1.º, 2.º y 3.º grado' : '4.º, 5.º y 6.º grado'}</b>
  <p class="mu">${c === 1 ? 'Lengua Española, Matemática y Niveles de Lectura' : 'Lengua Española, Matemática, Ciencias Sociales y Ciencias de la Naturaleza'}</p></div>`).join('')}</div>`;
}

async function dashboard() {
  app.innerHTML = '<p class="mu">Cargando docentes…</p>';
  const docs = await api(`docentes?ciclo=${st.ciclo}`);
  app.innerHTML = `<h2>Docentes del ${st.ciclo === 1 ? 'Primer' : 'Segundo'} Ciclo</h2><p class="mu">Seleccione su tarjeta para registrar resultados en sus secciones asignadas.</p>
  ${docs.length ? '' : '<div class="card warn">No hay docentes con asignaciones cargadas en Neon para este ciclo.</div>'}
  <div class="grid">${docs.map(d => `<div class="card big" onclick="location.hash='doc/${d.id}'"><b style="font-size:18px">${esc(d.nombre)}</b><div style="margin-top:10px">
  ${d.asignaciones.map(a => `<span class="pill">${a.grado}.º ${esc(a.seccion)} · ${AREAS[a.area]}</span>`).join('')}</div></div>`).join('')}</div>`;
}

async function docente(id) {
  const d = (await api(`docentes?ciclo=${st.ciclo}`)).find(x => x.id === id); if (!d) throw new Error('Docente no encontrado');
  app.innerHTML = `<h2>${esc(d.nombre)}</h2><div class="grid">${d.asignaciones.map(a => `<div class="card big" onclick="location.hash='mat/${a.seccion_id}/${a.area}/${a.grado}/${encodeURIComponent(a.seccion)}'">
  <div class="kpi">${a.grado}.º ${esc(a.seccion)}</div><b>${AREAS[a.area]}</b><p class="mu">${esc(a.tanda || '')} · ${indicadores(a.grado, a.area).length} indicadores</p></div>`).join('')}</div>`;
}

function rubrica(g, a) {
  const ind = indicadores(g, a);
  return `<details class="card noprint" ${ind.some(i => i[2]) ? 'open' : ''}><summary><b>Competencias, indicadores y rúbrica – ${AREAS[a]} ${GRADOS[g]} Grado</b></summary>
  <table class="rub" style="margin-top:10px"><tr><th>Indicador</th><th>Elemental</th><th>Aceptable</th><th>Satisfactorio</th></tr>
  ${ind.map(i => `<tr><td><b>${i[0]}</b> ${esc(i[1])}</td>${['E', 'A', 'S'].map(n => `<td>${esc(i[2]?.[n] || 'Ver criterios en el documento de orientaciones del área.')}</td>`).join('')}</tr>`).join('')}</table>
  ${g <= 3 && a === 'LE' ? `<p class="mu"><b>Niveles de lectura:</b> Fluido: lee con ritmo, entonación y comprensión · No fluido: lee con pausas, errores o silabeo · Palabras: reconoce palabras aisladas · Sílabas: reconoce sílabas, no palabras completas · Imágenes: interpreta imágenes, no decodifica.</p>` : ''}</details>`;
}

async function matriz(sec, area, g, nomSec) {
  nomSec = decodeURIComponent(nomSec);
  const [est, rr] = await Promise.all([api(`estudiantes?seccion=${sec}`), api(`resultados?seccion=${sec}&periodo=${st.periodo}&area=${area}`)]);
  const ind = indicadores(g, area), lec = area === 'LE' ? lecturaDe(g) : [];
  const R = {}, L = {}; rr.resultados.forEach(r => R[r.estudiante_id + '|' + r.indicador] = r.nivel); rr.lectura.forEach(l => L[l.estudiante_id] = l.nivel);
  const dirty = new Set(), dl = new Set();
  const draw = () => {
    const tot = (k, n) => est.filter(e => R[e.id + '|' + k] === n).length, tl = n => est.filter(e => L[e.id] === n).length;
    app.innerHTML = `<div class="noprint" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><h2 style="flex:1">${AREAS[area]} · ${g}.º ${esc(nomSec)}</h2>
    <button class="btn" id="save">Guardar</button><button class="btn sec" onclick="print()">Instrumento oficial (PDF)</button></div>${rubrica(g, area)}
    <div class="doc"><h3>${PERIODOS[st.periodo].toUpperCase()} – ${AREAS[area].toUpperCase()}</h3>
    <p style="text-align:center;margin:0">Instrumento para el docente consolidar resultados, Año Escolar 2026-2027 · <b>${GRADOS[g].toUpperCase()} GRADO</b></p>
    <p>Sección: <b>${esc(nomSec)}</b> · Matriculados: <b>${est.length}</b> · Evaluados: <b>${est.filter(e => ind.some(i => R[e.id + '|' + i[0]])).length}</b></p>
    <div style="overflow:auto"><table class="of"><tr><th rowspan="2">#</th><th rowspan="2">Nombres de estudiantes</th>
    ${ind.map(i => `<th colspan="3" title="${esc(i[1])}">${i[0]} ${esc(i[1].slice(0, 60))}${i[1].length > 60 ? '…' : ''}</th>`).join('')}
    ${lec.length ? `<th colspan="${lec.length}">Niveles de lectura</th>` : ''}<th rowspan="2" class="noprint"></th></tr>
    <tr>${ind.map(() => '<th>E</th><th>A</th><th>S</th>').join('')}${lec.map(l => `<th>${LECTURA[l]}</th>`).join('')}</tr>
    ${est.map((e, k) => `<tr><td>${k + 1}</td><td class="n">${esc(e.nombre)}</td>
    ${ind.map(i => ['E', 'A', 'S'].map(n => `<td class="chk ${n} ${R[e.id + '|' + i[0]] === n ? 'on' : ''}" data-e="${e.id}" data-i="${i[0]}" data-n="${n}">${R[e.id + '|' + i[0]] === n ? '✔' : ''}</td>`).join('')).join('')}
    ${lec.map(l => `<td class="chk S ${L[e.id] === l ? 'on' : ''}" data-e="${e.id}" data-l="${l}">${L[e.id] === l ? '✔' : ''}</td>`).join('')}
    <td class="noprint"><button class="pill" data-ed="${e.id}">Editar</button><button class="pill" data-del="${e.id}">Retirar</button></td></tr>`).join('')}
    <tr><th></th><th>Total</th>${ind.map(i => ['E', 'A', 'S'].map(n => `<th>${tot(i[0], n)}</th>`).join('')).join('')}${lec.map(l => `<th>${tl(l)}</th>`).join('')}<th class="noprint"></th></tr></table></div>
    <p class="mu">E: Elemental · A: Aceptable · S: Satisfactorio</p></div>
    <div class="card noprint"><b>Inscribir estudiante</b><div style="display:flex;gap:8px;margin-top:8px"><input id="nn" placeholder="Apellidos, Nombres"><button class="btn" id="add">Inscribir</button></div></div>`;
    app.querySelectorAll('td.chk').forEach(td => td.onclick = () => {
      const e = +td.dataset.e;
      if (td.dataset.l) { L[e] = L[e] === td.dataset.l ? null : td.dataset.l; dl.add(e); }
      else { const k = e + '|' + td.dataset.i; R[k] = R[k] === td.dataset.n ? null : td.dataset.n; dirty.add(k); }
      draw();
    });
    $('#save').onclick = async () => {
      try { await api('resultados', { method: 'POST', body: { periodo: st.periodo, area, filas: [...dirty].map(k => { const [e, i] = k.split('|'); return { estudiante_id: +e, indicador: i, nivel: R[k] }; }), lectura: [...dl].map(e => ({ estudiante_id: e, nivel: L[e] })) } });
        dirty.clear(); dl.clear(); alert('Resultados guardados.'); } catch (e) { alert(e.message); }
    };
    $('#add').onclick = async () => { const n = $('#nn').value.trim(); if (!n) return; est.push(await api('estudiantes', { method: 'POST', body: { seccion_id: sec, nombre: n } })); est.sort((a, b) => a.nombre.localeCompare(b.nombre)); draw(); };
    app.querySelectorAll('[data-ed]').forEach(b => b.onclick = async () => { const e = est.find(x => x.id === +b.dataset.ed), n = prompt('Nombre del estudiante', e.nombre); if (n?.trim()) { await api('estudiantes', { method: 'PUT', body: { id: e.id, nombre: n } }); e.nombre = n.trim(); draw(); } });
    app.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { if (!confirm('¿Retirar al estudiante del listado? Su historial se conserva.')) return; await api('estudiantes', { method: 'DELETE', body: { id: +b.dataset.del } }); est.splice(est.findIndex(x => x.id === +b.dataset.del), 1); draw(); });
  };
  draw(); window.onbeforeunload = () => dirty.size || dl.size ? 'Hay cambios sin guardar' : undefined;
}

// ================= COORDINACIÓN =================
async function coord(tab) {
  if (!st.ciclo) return go('');
  st.pin = sessionStorage['pin' + st.ciclo] || '';
  if (!st.pin) {
    app.innerHTML = `<div class="card" style="max-width:380px;margin:40px auto"><b>Acceso de coordinación – ${st.ciclo === 1 ? 'Primer' : 'Segundo'} Ciclo</b><input id="pin" type="password" placeholder="PIN" style="margin:10px 0"><button class="btn" id="ok">Entrar</button></div>`;
    $('#ok').onclick = async () => { const p = $('#pin').value; if ((await api('login-coord', { method: 'POST', body: { pin: p, ciclo: st.ciclo } })).ok) { st.pin = sessionStorage['pin' + st.ciclo] = p; coord(tab); } else alert('PIN incorrecto'); };
    return;
  }
  const [C, centro] = await Promise.all([api(`consolidado?ciclo=${st.ciclo}&periodo=${st.periodo}`), api(`centro?ciclo=${st.ciclo}`)]);
  const grados = st.ciclo === 1 ? [1, 2, 3] : [4, 5, 6];
  const cnt = (f) => C.res.filter(f).reduce((s, r) => s + r.n, 0);
  const matG = g => C.mat.filter(m => m.grado === g).reduce((s, m) => s + m.n, 0);
  app.innerHTML = `<div class="tabs noprint">${[['progreso', 'Progreso docente'], ['sistema', 'Sistematización para el Distrito'], ['analisis', 'Análisis y gráficos'], ['centro', 'Datos del centro']].map(([k, v]) => `<button class="${k === tab ? 'on' : ''}" onclick="location.hash='coord/${k}'">${v}</button>`).join('')}
   <button class="btn sec" onclick="print()">Exportar PDF</button></div><div id="tc"></div>`;
  const tc = $('#tc');

  if (tab === 'progreso') {
    const filas = C.asig.map(a => {
      const m = C.mat.find(x => x.seccion_id === a.seccion_id) || { n: 0, grado: 0, seccion: '' };
      const esperado = m.n * indicadores(m.grado, a.area).length;
      const hecho = cnt(r => r.seccion_id === a.seccion_id && r.area === a.area);
      return { ...a, ...m, pct: esperado ? Math.round(100 * hecho / esperado) : 0 };
    }).sort((x, y) => x.pct - y.pct);
    const glob = filas.length ? Math.round(filas.reduce((s, f) => s + f.pct, 0) / filas.length) : 0;
    tc.innerHTML = `<div class="grid"><div class="card"><div class="mu">Avance global</div><div class="kpi">${glob}%</div></div>
    <div class="card"><div class="mu">Asignaciones completas</div><div class="kpi">${filas.filter(f => f.pct >= 100).length}/${filas.length}</div></div>
    <div class="card"><div class="mu">Sin iniciar</div><div class="kpi" style="color:var(--rj)">${filas.filter(f => !f.pct).length}</div></div></div>
    <div class="card" style="margin-top:18px"><table><tr><th>Docente</th><th>Grado/Sección</th><th>Área</th><th>Matrícula</th><th style="width:35%">Avance</th></tr>
    ${filas.map(f => `<tr><td class="n">${esc(f.nombre)}</td><td>${f.grado}.º ${esc(f.seccion)}</td><td>${AREAS[f.area]}</td><td>${f.n}</td><td><div class="bar"><i style="width:${Math.min(f.pct, 100)}%;background:${f.pct >= 100 ? 'var(--S)' : f.pct ? 'var(--A)' : 'var(--E)'}"></i></div>${f.pct}%</td></tr>`).join('')}</table></div>`;
  }

  if (tab === 'sistema') {
    const c = centro, campo = (l, v) => `<tr><td class="n"><b>${l}</b></td><td class="n">${esc(v || '')}</td></tr>`;
    const bloque = (titulo, cols, vals, g) => { const s = vals.reduce((a, b) => a + b, 0), m = matG(g);
      return `<table style="margin:6px 0"><tr><th colspan="${cols.length}" style="text-align:left">${titulo}</th></tr><tr>${cols.map(x => `<th>${x}</th>`).join('')}</tr>
      <tr>${vals.map(v => `<td>${v}</td>`).join('')}</tr><tr><td colspan="${cols.length}" class="n ${s !== m ? 'warn' : ''}">Suma registrada: ${s} &nbsp; Matrícula del grado: ${m}</td></tr></table>`; };
    let h = `<div class="doc pb"><h3>Sistematización Evaluación de Seguimiento ${st.ciclo === 1 ? 'Primer' : 'Segundo'} Ciclo, Nivel Primario</h3>
    <p style="text-align:center" class="mu">${PERIODOS[st.periodo]} · Instrumento para registrar las cantidades generales por grado, área evaluada, nivel de lectura e indicadores de desempeño.</p>
    <h4>Datos generales del centro educativo</h4><table>${campo('Correo', c.correo)}${campo('Código SIGERD del centro educativo', c.codigo_sigerd)}${campo('Nombre completo del centro educativo', c.nombre)}${campo('Regional', c.regional)}${campo('Distrito Educativo', c.distrito)}${campo('Sector', c.sector)}${campo('Tipo', c.tipo)}${campo('Tanda del centro', c.tanda)}</table>
    <h4>Matrícula por grado</h4><table>${grados.map(g => campo(`Cantidad de niños inscritos en ${GRADOS[g].toLowerCase()} grado`, String(matG(g)))).join('')}</table></div>`;
    if (st.ciclo === 1) grados.forEach(g => { h += `<div class="doc">${bloque(`${GRADOS[g]} Grado Niveles de Lectura`, Object.values(LECTURA), Object.keys(LECTURA).map(k => C.lec.filter(l => l.grado === g && l.nivel === k).reduce((s, l) => s + l.n, 0)), g)}</div>`; });
    grados.forEach(g => areasCiclo(st.ciclo).forEach(a => {
      h += `<div class="doc"><h4>${GRADOS[g]} Grado ${AREAS[a]}</h4><p class="mu">Escriba la cantidad de estudiantes del centro educativo según el nivel alcanzado en cada indicador evaluado.</p>
      ${indicadores(g, a).map(i => bloque(`Indicador ${i[0]}. ${esc(i[1])}`, Object.values(NIVELES), ['E', 'A', 'S'].map(n => cnt(r => r.grado === g && r.area === a && r.indicador === i[0] && r.nivel === n)), g)).join('')}</div>`;
    }));
    tc.innerHTML = h + `<p class="mu" style="text-align:center">© 2026 Ministerio de Educación</p><p class="noprint mu">Las sumas en rojo no coinciden con la matrícula: revise antes de enviar al Distrito. Si el centro tiene dos tandas, genere un reporte por tanda.</p>`;
  }

  if (tab === 'analisis') {
    tc.innerHTML = `<div class="doc"><h3>Análisis de resultados – ${st.ciclo === 1 ? 'Primer' : 'Segundo'} Ciclo · ${PERIODOS[st.periodo]}</h3></div>
    <div class="grid" id="ch"></div>`;
    const ch = $('#ch'), mk = (t, cfg) => { const d = document.createElement('div'); d.className = 'card'; d.innerHTML = `<b>${t}</b><canvas></canvas>`; ch.append(d); new Chart(d.querySelector('canvas'), cfg); };
    const col = { E: '#ef4444', A: '#f59e0b', S: '#10b981' }, pct = (v, t) => t ? +(100 * v / t).toFixed(1) : 0;
    grados.forEach(g => areasCiclo(st.ciclo).forEach(a => {
      const ind = indicadores(g, a), tots = ind.map(i => cnt(r => r.grado === g && r.area === a && r.indicador === i[0]));
      mk(`${GRADOS[g]} grado · ${AREAS[a]} (% por indicador)`, { type: 'bar', data: { labels: ind.map(i => i[0]), datasets: ['E', 'A', 'S'].map(n => ({ label: NIVELES[n], backgroundColor: col[n], data: ind.map((i, k) => pct(cnt(r => r.grado === g && r.area === a && r.indicador === i[0] && r.nivel === n), tots[k])) })) },
        options: { animation: false, scales: { x: { stacked: true }, y: { stacked: true, max: 100 } } } });
    }));
    if (st.ciclo === 1) grados.forEach(g => mk(`${GRADOS[g]} grado · Niveles de lectura`, { type: 'doughnut', data: { labels: Object.values(LECTURA), datasets: [{ data: Object.keys(LECTURA).map(k => C.lec.filter(l => l.grado === g && l.nivel === k).reduce((s, l) => s + l.n, 0)), backgroundColor: ['#10b981', '#84cc16', '#f59e0b', '#f97316', '#ef4444'] }] }, options: { animation: false } }));
    // indicadores críticos
    const crit = [];
    grados.forEach(g => areasCiclo(st.ciclo).forEach(a => indicadores(g, a).forEach(i => { const t = cnt(r => r.grado === g && r.area === a && r.indicador === i[0]); const e = cnt(r => r.grado === g && r.area === a && r.indicador === i[0] && r.nivel === 'E'); if (t) crit.push({ g, a, i, p: pct(e, t) }); })));
    crit.sort((x, y) => y.p - x.p);
    tc.insertAdjacentHTML('beforeend', `<div class="card" style="margin-top:18px"><b>Indicadores prioritarios (mayor % en Elemental)</b><table><tr><th>Grado</th><th>Área</th><th>Indicador</th><th>% Elemental</th></tr>
    ${crit.slice(0, 10).map(c => `<tr><td>${c.g}.º</td><td>${AREAS[c.a]}</td><td class="n">${c.i[0]} ${esc(c.i[1])}</td><td>${c.p}%</td></tr>`).join('') || '<tr><td colspan="4">Aún no hay resultados registrados.</td></tr>'}</table></div>`);
  }

  if (tab === 'centro') {
    const F = [['correo', 'Correo'], ['codigo_sigerd', 'Código SIGERD (5 dígitos)'], ['nombre', 'Nombre completo del centro'], ['regional', 'Regional'], ['distrito', 'Distrito Educativo'], ['sector', 'Sector'], ['tipo', 'Tipo'], ['tanda', 'Tanda del centro']];
    tc.innerHTML = `<div class="card"><div class="fld">${F.map(([k, l]) => `<label class="mu">${l}<input id="c_${k}" value="${esc(centro[k] || '')}"></label>`).join('')}</div><br><button class="btn" id="gc">Guardar</button></div>`;
    $('#gc').onclick = async () => { const c = Object.fromEntries(F.map(([k]) => [k, $('#c_' + k).value.trim()])); if (c.codigo_sigerd && !/^\d{5}$/.test(c.codigo_sigerd)) return alert('El código SIGERD debe tener exactamente 5 dígitos.');
      try { await api('centro', { method: 'POST', body: { ciclo: st.ciclo, pin: st.pin, centro: c } }); alert('Datos guardados.'); } catch (e) { alert(e.message); } };
  }
}
route();
