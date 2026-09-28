const EMBEDDED = window.PADRON; let PADRON = JSON.parse(localStorage.getItem('cbc_padron') || 'null') || EMBEDDED; let visits = JSON.parse(localStorage.getItem('cbc_visits') || '[]'); let current = null, indIndex = 0, selectedScore = null;
const $ = id => document.getElementById(id); const esc = s => String(s ?? '').replace(/[&<>\"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' }[m]));
const SBC = window.SUPABASE_CONFIG || {}; const backendConfigured = !!(SBC.url && SBC.publishableKey && window.supabase); const sb = backendConfigured ? window.supabase.createClient(SBC.url, SBC.publishableKey) : null; let authUser = null, profile = null;
function backendMsg(t, bad = false) { let e = $('loginMsg'); if (!e) return; e.textContent = t; e.classList.remove('hidden'); e.style.color = bad ? '#9d2525' : '' }
async function login() { if (!backendConfigured) return backendMsg('Falta configurar Supabase. Completa supabase-config.js antes de publicar.', true); let email = $('loginEmail').value.trim(), password = $('loginPassword').value; if (!email || !password) return backendMsg('Ingresa correo y contraseña.', true); $('loginBtn').disabled = true; let { data, error } = await sb.auth.signInWithPassword({ email, password }); $('loginBtn').disabled = false; if (error) return backendMsg('No fue posible iniciar sesión. Verifica tus credenciales.', true); await enterSession(data.user) }
async function enterSession(user) { authUser = user; let { data } = await sb.from('profiles').select('nombre,rol,activo').eq('id', user.id).maybeSingle(); profile = data || { nombre: user.email, rol: 'supervisor', activo: true }; if (profile.activo === false) { await sb.auth.signOut(); return backendMsg('Tu usuario está deshabilitado.', true) } $('userLabel').textContent = (profile.nombre || user.email) + ' · ' + (profile.rol || 'supervisor'); $('logoutBtn').classList.remove('hidden'); document.body.classList.add('authenticated'); $('appNav').classList.remove('hidden'); const isAdmin=(profile.rol||'').toLowerCase()==='admin'; if($('navPadron')) $('navPadron').classList.toggle('hidden',!isAdmin); if($('quickPadron')) $('quickPadron').classList.toggle('hidden',!isAdmin); await syncFromCloud(); show('home') }
async function logout() { if (sb) await sb.auth.signOut(); authUser = null; profile = null; $('logoutBtn').classList.add('hidden'); $('userLabel').textContent = ''; document.body.classList.remove('authenticated'); if($('appNav')) $('appNav').classList.add('hidden'); show('login') }
async function syncFromCloud() { if (!sb || !authUser) return; let { data: rows, error } = await sb.from('visitas').select('*,evaluaciones(*),medidas_correctivas(*)').order('created_at', { ascending: true }); if (error) { console.warn(error); return } if (rows) { visits = rows.map(r => ({ id: r.id, cloudId: r.id, ownerId: r.user_id, ie: r.ie_snapshot && Object.keys(r.ie_snapshot).length ? r.ie_snapshot : { COD_MOD: r.cod_mod, CODLOCAL: r.cod_local, CEN_EDU: r.iestp_nombre }, meta: { fecha: r.fecha, hora: r.hora || '', supervisor: r.supervisor, tipo: r.tipo || '', modalidad: r.modalidad || '', gps: r.gps || '', obs: r.observacion_general || '' }, answers: Object.fromEntries((r.evaluaciones || []).map(e => [e.variable, { score: e.puntaje, extra: e.dato_complementario || '', obs: e.observacion || '', evidenceName: e.evidencia_nombre || '', evidencePath: e.evidencia_path || '' }])), measures: (r.medidas_correctivas || []).map(m => ({id:m.id,variable:m.variable,cbc:m.cbc,codigo:m.codigo_indicador,rec_code:m.codigo_medida,action:m.medida,responsible:m.responsable||'',days:m.plazo_dias,due_date:m.fecha_vencimiento,status:m.estado,followup:m.seguimiento||'',created_at:m.created_at})), status: r.estado, finishedAt: r.finished_at || null })); localStorage.setItem('cbc_visits', JSON.stringify(visits)) } }
async function cloudSave(v) { if (!sb || !authUser) return; let old = current; current = v; let c = calc(); current = old; let diag = c.sum >= 162 ? 'SATISFACTORIO / ÓPTIMO' : c.sum >= 126 ? 'ACEPTABLE CON OBSERVACIONES' : 'EN RIESGO / CRÍTICO'; let payload = { user_id: authUser.id, cod_mod: v.ie.COD_MOD, cod_local: v.ie.CODLOCAL || '', iestp_nombre: v.ie.CEN_EDU, ie_snapshot: v.ie, fecha: v.meta.fecha, hora: v.meta.hora || null, supervisor: v.meta.supervisor, tipo: v.meta.tipo, modalidad: v.meta.modalidad, gps: v.meta.gps || null, observacion_general: v.meta.obs || null, estado: v.status, puntaje_total: c.sum, porcentaje_global: c.pct, diagnostico: diag, updated_at: new Date().toISOString(), finished_at: v.finishedAt || null }; let row, error; if (v.cloudId) { ({ data: row, error } = await sb.from('visitas').update(payload).eq('id', v.cloudId).select().single()) } else { payload.legacy_id = v.id; ({ data: row, error } = await sb.from('visitas').insert(payload).select().single()) } if (error) { console.warn('Cloud save', error); return } v.cloudId = row.id; if (v.id !== row.id) { let oldid = v.id; v.id = row.id; let ix = visits.findIndex(x => x.id === oldid); if (ix >= 0) visits[ix] = v } let ev = Object.entries(v.answers).map(([variable, a]) => { let m = MATRIZ.find(x => x.Variable === variable) || {}; return { visita_id: row.id, variable, cbc: m.CBC || '', codigo: m['Código'] || m.Código || '', indicador: m.Indicador || '', puntaje: a.score, dato_complementario: a.extra || null, observacion: a.obs || null, evidencia_nombre: a.evidenceName || null, evidencia_path: a.evidencePath || null, updated_at: new Date().toISOString() } }); if (ev.length) { let rr = await sb.from('evaluaciones').upsert(ev, { onConflict: 'visita_id,variable' }); if (rr.error) console.warn('Evaluation sync', rr.error) } localStorage.setItem('cbc_visits', JSON.stringify(visits)) }

function show(id) { document.querySelectorAll('.view').forEach(x => x.classList.add('hidden')); $(id).classList.remove('hidden'); if (id === 'home') home(); if (id === 'institutos') renderIE(); if (id === 'historial') renderHistory(); if (id === 'dashboard') renderDash(); if (id === 'ficha') renderFicha(); scrollTo(0, 0) }
function home() { $('kpiPadron').textContent = PADRON.length; $('padronN').textContent = PADRON.length; $('kpiVisitas').textContent = visits.length; $('kpiFinal').textContent = visits.filter(v => v.status === 'Finalizada').length; let dates = PADRON.map(x => x.FECHA_ACT).filter(Boolean); $('padronDate').textContent = dates.length ? 'Fuente padrón · actualización declarada: ' + dates[0] : '' }
function setupFilters() { let gs = [...new Set(PADRON.map(x => x.D_GESTION).filter(Boolean))].sort(), ds = [...new Set(PADRON.map(x => x.D_DIST).filter(Boolean))].sort(); $('gestion').innerHTML = '<option value="">Todas las gestiones</option>' + gs.map(x => `<option>${esc(x)}</option>`).join(''); $('distrito').innerHTML = '<option value="">Todos los distritos</option>' + ds.map(x => `<option>${esc(x)}</option>`).join('') }
function renderIE() { let q = ($('searchIE')?.value || '').toLowerCase(), g = $('gestion')?.value || '', d = $('distrito')?.value || ''; let a = PADRON.filter(x => (!q || [x.CEN_EDU, x.COD_MOD, x.CODLOCAL].join(' ').toLowerCase().includes(q)) && (!g || x.D_GESTION === g) && (!d || x.D_DIST === d)); $('ieCount').textContent = `${a.length} registro(s) encontrado(s)`; $('ieList').innerHTML = a.slice(0, 100).map(x => `<div class="ieRow"><div><b>${esc(x.CEN_EDU)}</b><div class="meta">CM ${esc(x.COD_MOD)} · CL ${esc(x.CODLOCAL)} · ${esc(x.D_GESTION)} · ${esc(x.D_DIST)}</div><div class="meta">${esc(x.DIR_CEN || 'Dirección no consignada')}</div></div><button onclick="selectIE('${x.COD_MOD.replace(/'/g, '')}','${x.CODLOCAL.replace(/'/g, '')}')">Seleccionar</button></div>`).join('') + (a.length > 100 ? '<div class="note">Se muestran los primeros 100 resultados. Use la búsqueda para precisar.</div>' : '') }
function selectIE(cm, cl) { let ie = PADRON.find(x => x.COD_MOD === cm && x.CODLOCAL === cl); current = { id: 'V' + Date.now(), ie, meta: {}, answers: {}, status: 'Borrador' }; $('selectedIE').innerHTML = ieCard(ie); let now = new Date(); $('fecha').value = now.toISOString().slice(0, 10); $('hora').value = now.toTimeString().slice(0, 5); show('visita') }
function ieCard(x) { return `<b>${esc(x.CEN_EDU)}</b><div class="meta">Código modular ${esc(x.COD_MOD)} · Código local ${esc(x.CODLOCAL)} · ${esc(x.D_GESTION)} · ${esc(x.D_DIST)}</div><div class="meta">${esc(x.DIR_CEN || '')}</div>` }
function getGPS() { if (!navigator.geolocation) return alert('Geolocalización no disponible.'); navigator.geolocation.getCurrentPosition(p => $('gps').value = p.coords.latitude.toFixed(6) + ', ' + p.coords.longitude.toFixed(6), () => alert('No fue posible obtener la ubicación.')) }
function startVisit() { if (!$('supervisor').value.trim()) return alert('Registra el equipo o supervisor.'); current.meta = { fecha: $('fecha').value, hora: $('hora').value, supervisor: $('supervisor').value, tipo: $('tipo').value, modalidad: $('modalidad').value, gps: $('gps').value, obs: $('obsGeneral').value }; renderCBC(); show('cbc') }
function grouped() { let o = {}; MATRIZ.forEach((x, i) => (o[x.CBC] ??= []).push({ ...x, _i: i })); return o }
function renderCBC() { let groups = grouped(); $('cbcInstitute').textContent = current.ie.CEN_EDU; let done = Object.keys(current.answers).length, total = MATRIZ.length; $('progressText').textContent = `${done} de ${total} indicadores registrados`; $('progressBar').style.width = (done / total * 100) + '%'; $('cbcList').innerHTML = Object.entries(groups).map(([cbc, arr], k) => { let n = arr.filter(x => current.answers[x.Variable]).length, p = Math.round(n / arr.length * 100); return `<div class="cbcCard" onclick="openCBC('${cbc}')"><div class="cbcIcon">${k + 1}</div><div><b>${cbc}</b><div class="meta">${arr[0].Indicador} …</div><div class="bar"><i style="width:${p}%"></i></div><div class="meta">${n}/${arr.length} indicadores</div></div><span>›</span></div>` }).join('') + `<button onclick="summary()">Ver resumen →</button>` }
function openCBC(cbc) { let idx = MATRIZ.findIndex(x => x.CBC === cbc && !current.answers[x.Variable]); if (idx < 0) idx = MATRIZ.findIndex(x => x.CBC === cbc); openInd(idx) }
function openInd(i) { indIndex = Math.max(0, Math.min(MATRIZ.length - 1, i)); let x = MATRIZ[indIndex], a = current.answers[x.Variable] || {}; selectedScore = a.score || null; $('indCBC').textContent = x.CBC + ' · ' + x.Código; $('indCounter').textContent = (indIndex + 1) + ' de ' + MATRIZ.length; $('indTitle').textContent = x.Indicador; $('indCriterion').textContent = x['Criterio técnico de verificación']; $('indEvidence').textContent = x['Evidencias exigibles']; $('indType').textContent = x['Tipo de evaluación (fuente)']; $('scoreBtns').innerHTML = [1, 2, 3, 4, 5].map(n => `<button class="${selectedScore === n ? 'active' : ''}" onclick="pickScore(${n})">${n}</button>`).join(''); $('extraValue').value = a.extra || ''; $('indObs').value = a.obs || ''; $('evidence').value = ''; $('evidenceName').textContent = a.evidenceName ? 'Registrado: ' + a.evidenceName : ''; show('indicator') }
function pickScore(n) { selectedScore = n; document.querySelectorAll('#scoreBtns button').forEach((b, i) => b.classList.toggle('active', i + 1 === n)) }
function saveIndicator() { if (!selectedScore) return alert('Selecciona una valoración de 1 a 5.'); let x = MATRIZ[indIndex], old = current.answers[x.Variable] || {}, f = $('evidence').files[0]; current.answers[x.Variable] = { score: selectedScore, extra: $('extraValue').value, obs: $('indObs').value, evidenceName: f ? f.name : old.evidenceName || '' }; saveDraft(true); if (indIndex < MATRIZ.length - 1) openInd(indIndex + 1); else summary() }
function prevInd() { if (indIndex === 0) { renderCBC(); show('cbc') } else openInd(indIndex - 1) }
function saveAndExit() { if (selectedScore) { let x = MATRIZ[indIndex], old = current.answers[x.Variable] || {}, f = $('evidence').files[0]; current.answers[x.Variable] = { score: selectedScore, extra: $('extraValue').value, obs: $('indObs').value, evidenceName: f ? f.name : old.evidenceName || '' }; } saveDraft(true); renderCBC(); show('cbc') }
function saveDraft(silent = false) { if (!current) return; if (current.ownerId && authUser && current.ownerId !== authUser.id && (profile?.rol||'').toLowerCase() !== 'admin') { if(!silent) alert('Esta visita pertenece a otro especialista y está disponible solo para consulta.'); return; } let i = visits.findIndex(v => v.id === current.id); if (i >= 0) visits[i] = current; else visits.push(current); localStorage.setItem('cbc_visits', JSON.stringify(visits)); if (backendConfigured && authUser) cloudSave(current); if (!silent) { renderCBC(); let old = document.title; document.title = '✓ Borrador guardado'; setTimeout(() => document.title = old, 1200) } }
function calc() { let groups = grouped(), res = []; Object.entries(groups).forEach(([cbc, arr]) => { let vals = arr.map(x => current.answers[x.Variable]?.score).filter(Boolean), max = arr.length * 5, sum = vals.reduce((a, b) => a + b, 0); res.push({ cbc, sum, max, pct: Math.round(sum / max * 100), done: vals.length, total: arr.length }) }); let sum = res.reduce((a, b) => a + b.sum, 0), pct = Math.round(sum / 180 * 100); return { res, sum, pct } }
function summary() { let c = calc(); $('summaryIE').innerHTML = ieCard(current.ie); let groups=grouped(); $('summaryCBC').innerHTML = c.res.map((r,idx) => { let arr=groups[r.cbc]||[]; let lead=arr[0]?.Indicador||''; let detail=arr.map(x=>{let a=current.answers[x.Variable]||{}; return `<div class="sumItem"><div><b>${x.Código} · ${x.Indicador}</b><small>${x['Criterio técnico de verificación']||''}</small></div><span class="scorePill ${a.score?'ok':'pending'}">${a.score?('Valoración '+a.score+'/5'):'Sin registrar'}</span>${a.extra?`<div class="sumExtra"><strong>Dato:</strong> ${a.extra}</div>`:''}${a.obs?`<div class="sumExtra"><strong>Observación:</strong> ${a.obs}</div>`:''}</div>`}).join(''); return `<details class="sumRow sumDetail"><summary><div class="sumTitle"><span class="cbcBadge">${idx+1}</span><div><b>${r.cbc} · ${lead}</b><span class="meta">${r.done}/${r.total} indicadores · ${r.pct}%</span></div></div><span class="sumToggle">Ver detalle ▾</span></summary><div class="bar"><i style="width:${r.pct}%"></i></div><div class="sumItems">${detail}</div></details>` }).join(''); $('globalPct').textContent = c.pct + '%'; $('diag').textContent = c.sum >= 162 ? 'SATISFACTORIO / ÓPTIMO' : c.sum >= 126 ? 'ACEPTABLE CON OBSERVACIONES' : 'EN RIESGO / CRÍTICO'; show('summary') }
function finishVisit() { if (current?.ownerId && authUser && current.ownerId !== authUser.id && (profile?.rol||'').toLowerCase() !== 'admin') return alert('Esta visita pertenece a otro especialista y está disponible solo para consulta.'); if (Object.keys(current.answers).length < MATRIZ.length && !confirm('Hay indicadores sin registrar. ¿Finalizar de todos modos?')) return; current.status = 'Finalizada'; current.finishedAt = new Date().toISOString(); saveDraft(true); alert('Visita finalizada y guardada.'); show('historial') }
function renderHistory() { $('historyList').innerHTML = visits.length ? visits.slice().reverse().map(v => { let old = current; current = v; let c = calc(); current = old; return `<div class="historyRow"><div><b>${esc(v.ie.CEN_EDU)}</b><div class="meta">${esc(v.meta.fecha || '')} · ${esc(v.meta.tipo || '')} · ${esc(v.meta.supervisor || '')}</div><div class="meta">${esc(v.status)} · Índice global ${c.pct}%</div></div><div class="historyTools"><button onclick="openFicha('${v.id}')">Abrir ficha</button></div></div>` }).join('') : '<div class="note">Aún no hay visitas guardadas.</div>' }
function loadVisit(id) { openFicha(id) }
function openFicha(id) { current = visits.find(v => v.id === id); if (!current) return; show('ficha') }
function scoreText(n){ return ({1:'Deficiente / No cumple',2:'Inicio / Insuficiente',3:'En proceso / Regular',4:'Satisfactorio / Bueno',5:'Sobresaliente / Excelente'})[Number(n)] || 'Sin registrar' }
function diagnosis(c){ return c.sum>=162?'SATISFACTORIO / ÓPTIMO':c.sum>=126?'ACEPTABLE CON OBSERVACIONES':'EN RIESGO / CRÍTICO' }
function renderFicha(){
  if(!current) return show('historial');
  let c=calc(), groups=grouped(), ie=current.ie||{}, m=current.meta||{};
  let sections=Object.entries(groups).map(([cbc,arr],idx)=>{
    let r=c.res.find(z=>z.cbc===cbc)||{pct:0,done:0,total:arr.length};
    let items=arr.map(x=>{let a=current.answers[x.Variable]||{}; return `<div class="fichaItem"><h4>${esc(x.Código)} · ${esc(x.Indicador)}</h4><div class="fichaGrid"><div class="wide"><span class="fichaLabel">Criterio técnico de verificación:</span> <span class="fichaValue">${esc(x['Criterio técnico de verificación']||'')}</span></div><div class="wide"><span class="fichaLabel">Evidencias exigibles:</span> <span class="fichaValue">${esc(x['Evidencias exigibles']||'')}</span></div><div><span class="fichaLabel">Valoración:</span> <span class="fichaScore">${a.score?esc(a.score)+' / 5 · '+scoreText(a.score):'Sin registrar'}</span></div><div><span class="fichaLabel">Dato complementario:</span> <span class="fichaValue">${esc(a.extra||'—')}</span></div><div class="wide"><span class="fichaLabel">Observaciones / sustento:</span> <span class="fichaValue">${esc(a.obs||'—')}</span></div><div class="wide"><span class="fichaLabel">Evidencia registrada:</span> <span class="fichaValue">${esc(a.evidenceName||'—')}</span></div></div></div>`}).join('');
    return `<section class="fichaCBC"><div class="fichaCBCTitle"><b>${esc(cbc)} · ${esc(arr[0]?.Indicador||'')}</b><span>${r.done}/${r.total} indicadores · ${r.pct}%</span></div>${items}</section>`;
  }).join('');
  $('fichaContent').innerHTML=`<div class="fichaHead"><div class="fichaBrand"><div><span class="eyebrow">DIRECCIÓN REGIONAL DE EDUCACIÓN DE LIMA METROPOLITANA</span><h2>Ficha de Monitoreo de Condiciones Básicas de Calidad – IESTP</h2><div class="meta">EEM · OPP · DRELM · 2026</div></div><div class="counterPill">${esc(current.status||'')}</div></div><div class="fichaMeta"><div><small>Institución</small><b>${esc(ie.CEN_EDU||'')}</b></div><div><small>Código modular</small><b>${esc(ie.COD_MOD||'')}</b></div><div><small>Código local</small><b>${esc(ie.CODLOCAL||'')}</b></div><div><small>Gestión / distrito</small><b>${esc((ie.D_GESTION||'')+' · '+(ie.D_DIST||''))}</b></div><div><small>Fecha y hora</small><b>${esc((m.fecha||'')+' '+(m.hora||''))}</b></div><div><small>Especialista / supervisor</small><b>${esc(m.supervisor||'')}</b></div><div><small>Tipo / modalidad</small><b>${esc((m.tipo||'')+' · '+(m.modalidad||''))}</b></div><div><small>Ubicación GPS</small><b>${esc(m.gps||'—')}</b></div></div>${m.obs?`<div class="tip"><b>Observación general:</b> ${esc(m.obs)}</div>`:''}<div class="fichaResult"><b>${c.pct}%</b><div><strong>Índice global</strong><div>${esc(diagnosis(c))}</div><small>${Object.keys(current.answers||{}).length} de ${MATRIZ.length} indicadores registrados</small></div></div></div>${sections}<div class="fichaFoot">Elaborado por EEM - OPP - DRELM · Ficha generada desde el aplicativo Monitoreo CBC · IESTP</div>`;
}
function printFicha(){ if(!current) return; renderFicha(); setTimeout(()=>window.print(),100) }
function exportAllVisits(){
  if(!visits.length) return alert('No hay visitas registradas para exportar.');
  const ex=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  let rows='';
  visits.forEach(v=>{let old=current; current=v; let c=calc(); current=old; MATRIZ.forEach(x=>{let a=v.answers?.[x.Variable]||{}; rows+=`<tr><td>${ex(v.id)}</td><td>${ex(v.ie?.COD_MOD)}</td><td>${ex(v.ie?.CODLOCAL)}</td><td>${ex(v.ie?.CEN_EDU)}</td><td>${ex(v.ie?.D_GESTION)}</td><td>${ex(v.ie?.D_DIST)}</td><td>${ex(v.meta?.fecha)}</td><td>${ex(v.meta?.hora)}</td><td>${ex(v.meta?.supervisor)}</td><td>${ex(v.meta?.tipo)}</td><td>${ex(v.meta?.modalidad)}</td><td>${ex(v.status)}</td><td>${c.pct}%</td><td>${ex(diagnosis(c))}</td><td>${ex(x.CBC)}</td><td>${ex(x.Código)}</td><td>${ex(x.Indicador)}</td><td>${ex(x['Criterio técnico de verificación'])}</td><td>${ex(x['Evidencias exigibles'])}</td><td>${ex(a.score||'')}</td><td>${ex(scoreText(a.score))}</td><td>${ex(a.extra||'')}</td><td>${ex(a.obs||'')}</td><td>${ex(a.evidenceName||'')}</td></tr>`})});
  let html=`<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"><style>table{border-collapse:collapse;font-family:Calibri;font-size:11pt}td,th{border:1px solid #9fbad0;padding:5px;vertical-align:top}th{background:#0b67ad;color:#fff;font-weight:bold}</style></head><body><table><tr><th>ID visita</th><th>Código modular</th><th>Código local</th><th>IESTP</th><th>Gestión</th><th>Distrito</th><th>Fecha</th><th>Hora</th><th>Especialista / supervisor</th><th>Tipo</th><th>Modalidad</th><th>Estado</th><th>Índice global</th><th>Clasificación</th><th>CBC</th><th>Código indicador</th><th>Indicador</th><th>Criterio técnico</th><th>Evidencias exigibles</th><th>Valoración</th><th>Nivel</th><th>Dato complementario</th><th>Observación</th><th>Evidencia registrada</th></tr>${rows}</table></body></html>`;
  let blob=new Blob(['\ufeff',html],{type:'application/vnd.ms-excel'}),a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`Base_Monitoreo_CBC_IESTP_${new Date().toISOString().slice(0,10)}.xls`; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function renderDash() { let finals = visits.filter(v => v.status === 'Finalizada'), sums = Array(7).fill(0), counts = Array(7).fill(0); finals.forEach(v => { let old = current; current = v; calc().res.forEach((r, i) => { sums[i] += r.pct; counts[i]++ }); current = old }); $('dashCards').innerHTML = `<article><b>${PADRON.length}</b><span>IESTP padrón</span></article><article><b>${visits.length}</b><span>Visitas</span></article><article><b>${finals.length}</b><span>Finalizadas</span></article><article><b>${new Set(finals.map(v => v.ie.COD_MOD)).size}</b><span>IESTP visitados</span></article>`; $('dashBars').innerHTML = sums.map((s, i) => { let p = counts[i] ? Math.round(s / counts[i]) : 0; return `<div class="dashBar"><b>CBC ${i + 1}</b><div class="bar"><i style="width:${p}%"></i></div><span>${p}%</span></div>` }).join('') }
function exportCurrent() {
  if(!current) return;
  let c=calc(), groups=grouped();
  let diag=c.sum>=162?'SATISFACTORIO / ÓPTIMO':c.sum>=126?'ACEPTABLE CON OBSERVACIONES':'EN RIESGO / CRÍTICO';
  const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  let rows='';
  Object.entries(groups).forEach(([cbc,arr],gi)=>{arr.forEach((x,i)=>{let a=current.answers[x.Variable]||{}; rows+=`<tr>${i===0?`<td rowspan="${arr.length}"><b>${esc(cbc)}</b><br>${esc(arr[0].Indicador)}</td>`:''}<td>${esc(x.Código)}</td><td>${esc(x.Indicador)}</td><td>${esc(x['Criterio técnico de verificación'])}</td><td>${esc(x['Evidencias exigibles'])}</td><td>${esc(a.score||'')}</td><td>${esc(a.extra||'')}</td><td>${esc(a.obs||'')}</td><td>${esc(a.evidenceName||'')}</td></tr>`})});
  let html=`<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"><style>table{border-collapse:collapse;font-family:Calibri}td,th{border:1px solid #9fbad0;padding:6px;vertical-align:top}th{background:#0b67ad;color:white}.title{font-size:18px;font-weight:bold;background:#dcecf8}.sub{font-weight:bold;background:#edf5fb}</style></head><body><table><tr><td colspan="9" class="title">DRELM - Monitoreo de Condiciones Básicas de Calidad - IESTP</td></tr><tr><td class="sub">Institución</td><td colspan="3">${esc(current.ie.CEN_EDU)}</td><td class="sub">Código modular</td><td>${esc(current.ie.COD_MOD)}</td><td class="sub">Código local</td><td colspan="2">${esc(current.ie.CODLOCAL)}</td></tr><tr><td class="sub">Fecha</td><td>${esc(current.meta.fecha)}</td><td class="sub">Supervisor</td><td colspan="2">${esc(current.meta.supervisor)}</td><td class="sub">Índice global</td><td>${c.pct}%</td><td class="sub">Clasificación</td><td>${esc(diag)}</td></tr><tr><th>CBC / referencia</th><th>Código</th><th>Indicador</th><th>Criterio técnico de verificación</th><th>Evidencias exigibles</th><th>Valoración</th><th>Dato complementario</th><th>Observación</th><th>Evidencia registrada</th></tr>${rows}</table></body></html>`;
  let blob=new Blob(['\ufeff',html],{type:'application/vnd.ms-excel'}),a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`Visita_CBC_${current.ie.COD_MOD}_${current.meta.fecha||''}.xls`; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function parseCSV(t) { let rows = [], row = [], cell = '', q = false; for (let i = 0; i < t.length; i++) { let c = t[i], n = t[i + 1]; if (c === '"') { if (q && n === '"') { cell += '"'; i++ } else q = !q } else if (c === ',' && !q) { row.push(cell); cell = '' } else if ((c === '\n' || c === '\r') && !q) { if (c === '\r' && n === '\n') i++; row.push(cell); if (row.some(x => x !== '')) rows.push(row); row = []; cell = '' } else cell += c } row.push(cell); if (row.some(x => x !== '')) rows.push(row); return rows }
function importCSV(f) { if (!f) return; let r = new FileReader(); r.onload = () => { let rows = parseCSV(r.result), h = rows.shift().map(x => x.trim().replace(/^\uFEFF/, '')); if (!h.includes('COD_MOD') || !h.includes('CEN_EDU')) return alert('El CSV debe conservar al menos los encabezados COD_MOD y CEN_EDU.'); let arr = rows.map(a => Object.fromEntries(h.map((k, i) => [k, a[i] ?? '']))).filter(x => x.COD_MOD && x.CEN_EDU); arr.forEach(x => { x.COD_MOD = String(x.COD_MOD).padStart(7, '0'); x.CODLOCAL = String(x.CODLOCAL || '').padStart(6, '0') }); PADRON = arr; localStorage.setItem('cbc_padron', JSON.stringify(PADRON)); setupFilters(); home(); alert(`Padrón actualizado: ${arr.length} registros.`) }; r.readAsText(f, 'utf-8') }
function resetPadron() { if (confirm('¿Restaurar el padrón incorporado en esta versión?')) { PADRON = EMBEDDED; localStorage.removeItem('cbc_padron'); setupFilters(); home(); alert('Padrón restaurado.') } }
async function boot() { setupFilters(); home(); $('backendState').textContent = backendConfigured ? 'Conexión Supabase configurada' : 'Modo configuración: falta Project URL y Publishable key'; if (backendConfigured) { let { data } = await sb.auth.getSession(); if (data.session?.user) return enterSession(data.session.user) } show('login') } boot(); if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });

/* ===== v1.5: ficha PDF real, Excel analítico y tablero institucional ===== */
const CBC_NAMES = {
  'CBC 1':'Gestión Institucional (Procesos Estratégicos)',
  'CBC 2':'Líneas de Investigación e Innovación Aplicada (Procesos Misionales)',
  'CBC 3':'Gestión Académica y Oferta Formativa Alineada al CNOF (Procesos Misionales)',
  'CBC 4':'Infraestructura, Equipamiento y Mantenimiento Técnico (Procesos de Soporte)',
  'CBC 5':'Personal Docente Idóneo, Suficiente y Desarrollo Profesional (Procesos Misionales)',
  'CBC 6':'Previsión y Sostenibilidad de Recursos Económicos y Financieros (Procesos de Soporte)',
  'CBC 7':'Servicios Educacionales Complementarios, Bienestar y Empleabilidad (Procesos Complementarios)'
};
function cbcName(cbc){ return CBC_NAMES[cbc] || cbc; }

/* Sustituye la ficha anterior: consulta completa, nunca editable. */
renderFicha = function(){
  if(!current) return show('historial');
  let c=calc(), groups=grouped(), ie=current.ie||{}, m=current.meta||{};
  let sections=Object.entries(groups).map(([cbc,arr])=>{
    let r=c.res.find(z=>z.cbc===cbc)||{pct:0,done:0,total:arr.length};
    let items=arr.map(x=>{let a=current.answers?.[x.Variable]||{}; return `<div class="fichaItem"><h4>${esc(x.Código)} · ${esc(x.Indicador)}</h4><div class="fichaGrid"><div class="wide"><span class="fichaLabel">Criterio técnico de verificación:</span> <span class="fichaValue">${esc(x['Criterio técnico de verificación']||'')}</span></div><div class="wide"><span class="fichaLabel">Evidencias exigibles:</span> <span class="fichaValue">${esc(x['Evidencias exigibles']||'')}</span></div><div><span class="fichaLabel">Valoración:</span> <span class="fichaScore">${a.score?esc(a.score)+' / 5 · '+scoreText(a.score):'Sin registrar'}</span></div><div><span class="fichaLabel">Dato complementario:</span> <span class="fichaValue">${esc(a.extra||'—')}</span></div><div class="wide"><span class="fichaLabel">Observaciones / sustento:</span> <span class="fichaValue">${esc(a.obs||'—')}</span></div><div class="wide"><span class="fichaLabel">Evidencia registrada:</span> <span class="fichaValue">${esc(a.evidenceName||'—')}</span></div></div></div>`}).join('');
    return `<section class="fichaCBC"><div class="fichaCBCTitle"><b>${esc(cbc)} · ${esc(cbcName(cbc))}</b><span>${r.done}/${r.total} indicadores · ${r.pct}%</span></div>${items}</section>`;
  }).join('');
  $('fichaContent').innerHTML=`<div class="fichaHead"><div class="fichaBrand"><div><span class="eyebrow">DIRECCIÓN REGIONAL DE EDUCACIÓN DE LIMA METROPOLITANA</span><h2>Ficha de Monitoreo de Condiciones Básicas de Calidad – IESTP</h2><div class="meta">EEM · OPP · DRELM · 2026</div></div><div class="counterPill">${esc(current.status||'')}</div></div><div class="fichaMeta"><div><small>Institución</small><b>${esc(ie.CEN_EDU||'')}</b></div><div><small>Código modular</small><b>${esc(ie.COD_MOD||'')}</b></div><div><small>Código local</small><b>${esc(ie.CODLOCAL||'')}</b></div><div><small>Gestión / distrito</small><b>${esc((ie.D_GESTION||'')+' · '+(ie.D_DIST||''))}</b></div><div><small>Fecha y hora</small><b>${esc((m.fecha||'')+' '+(m.hora||''))}</b></div><div><small>Especialista / supervisor</small><b>${esc(m.supervisor||'')}</b></div><div><small>Tipo / modalidad</small><b>${esc((m.tipo||'')+' · '+(m.modalidad||''))}</b></div><div><small>Ubicación GPS</small><b>${esc(m.gps||'—')}</b></div></div>${m.obs?`<div class="tip"><b>Observación general:</b> ${esc(m.obs)}</div>`:''}<div class="fichaResult"><b>${c.pct}%</b><div><strong>Índice global</strong><div>${esc(diagnosis(c))}</div><small>${Object.keys(current.answers||{}).length} de ${MATRIZ.length} indicadores registrados</small></div></div></div>${sections}<div class="fichaFoot">Elaborado por EEM - OPP - DRELM · Monitoreo CBC IESTP 2026</div>`;
};

async function downloadFichaPDF(){
  if(!current) return alert('No hay una visita seleccionada.');
  if(!window.jspdf?.jsPDF) return alert('No se pudo cargar el generador PDF. Verifica tu conexión a internet.');
  const {jsPDF}=window.jspdf, doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
  const ie=current.ie||{}, m=current.meta||{}, c=calc();
  const pageW=doc.internal.pageSize.getWidth();
  const addHeader=()=>{ doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.text('DIRECCIÓN REGIONAL DE EDUCACIÓN DE LIMA METROPOLITANA',14,10); doc.setFontSize(14); doc.text('FICHA DE MONITOREO DE CONDICIONES BÁSICAS DE CALIDAD – IESTP',14,17); doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.text('EEM · OPP · DRELM · 2026',14,22); doc.line(14,25,pageW-14,25); };
  addHeader();
  doc.autoTable({startY:29,theme:'grid',styles:{fontSize:7,cellPadding:2},headStyles:{fillColor:[8,96,160]},body:[['Institución',ie.CEN_EDU||'','Código modular',ie.COD_MOD||'','Código local',ie.CODLOCAL||''],['Gestión / distrito',`${ie.D_GESTION||''} · ${ie.D_DIST||''}`,'Fecha / hora',`${m.fecha||''} ${m.hora||''}`,'Especialista',m.supervisor||''],['Tipo / modalidad',`${m.tipo||''} · ${m.modalidad||''}`,'Estado',current.status||'','Índice global',`${c.pct}% · ${diagnosis(c)}`],['Observación general',m.obs||'—','','','','']]});
  let y=doc.lastAutoTable.finalY+6;
  Object.entries(grouped()).forEach(([cbc,arr])=>{
    const r=c.res.find(z=>z.cbc===cbc)||{};
    if(y>175){doc.addPage();addHeader();y=29;}
    doc.setFont('helvetica','bold');doc.setFontSize(10);doc.text(`${cbc} · ${cbcName(cbc)} — ${r.pct||0}%`,14,y);y+=3;
    const body=arr.map(x=>{let a=current.answers?.[x.Variable]||{};return [x.Código,x.Indicador,x['Criterio técnico de verificación']||'',x['Evidencias exigibles']||'',a.score?`${a.score}/5 · ${scoreText(a.score)}`:'Sin registrar',a.extra||'—',a.obs||'—',a.evidenceName||'—'];});
    doc.autoTable({startY:y,theme:'grid',margin:{left:14,right:14},styles:{fontSize:5.8,cellPadding:1.3,overflow:'linebreak'},headStyles:{fillColor:[10,111,196],fontSize:6},head:[['Código','Indicador','Criterio técnico','Evidencias exigibles','Valoración','Dato complementario','Observación / sustento','Evidencia registrada']],body,columnStyles:{0:{cellWidth:12},1:{cellWidth:30},2:{cellWidth:48},3:{cellWidth:48},4:{cellWidth:24},5:{cellWidth:24},6:{cellWidth:48},7:{cellWidth:30}},didDrawPage:()=>{} });
    y=doc.lastAutoTable.finalY+7;
  });
  const pages=doc.internal.getNumberOfPages(); for(let i=1;i<=pages;i++){doc.setPage(i);doc.setFontSize(7);doc.setFont('helvetica','normal');doc.text(`Ficha generada desde Monitoreo CBC · IESTP | Página ${i} de ${pages}`,14,202);}
  const safe=(ie.CEN_EDU||'IESTP').replace(/[^a-z0-9áéíóúñ_-]+/gi,'_').slice(0,55); doc.save(`Ficha_CBC_${safe}_${m.fecha||''}.pdf`);
}

function visitCalc(v){let old=current;current=v;let c=calc();current=old;return c;}
function exportAllVisits(){
  if(!visits.length) return alert('No hay visitas registradas para exportar.');
  if(!window.XLSX) return alert('No se pudo cargar el generador Excel. Verifica tu conexión a internet.');
  const base=visits.map(v=>{const c=visitCalc(v), row={'ID_VISITA':v.id,'COD_MOD':v.ie?.COD_MOD||'','COD_LOCAL':v.ie?.CODLOCAL||'','IESTP':v.ie?.CEN_EDU||'','GESTION':v.ie?.D_GESTION||'','DISTRITO':v.ie?.D_DIST||'','FECHA':v.meta?.fecha||'','HORA':v.meta?.hora||'','ESPECIALISTA':v.meta?.supervisor||'','TIPO_VISITA':v.meta?.tipo||'','MODALIDAD':v.meta?.modalidad||'','ESTADO':v.status||'','OBS_GENERAL':v.meta?.obs||'','PUNTAJE_TOTAL':c.sum,'PORCENTAJE_GLOBAL':c.pct,'DIAGNOSTICO':diagnosis(c)}; c.res.forEach((r,i)=>row[`CBC${i+1}_PORCENTAJE`]=r.pct); MATRIZ.forEach(x=>{let a=v.answers?.[x.Variable]||{}; let k=x.Variable.toUpperCase();row[k]=a.score??'';row[`${k}_DATO`]=a.extra||'';row[`${k}_OBS`]=a.obs||'';row[`${k}_EVIDENCIA`]=a.evidenceName||'';});return row;});
  const resumen=visits.map(v=>{const c=visitCalc(v),r={'ID_VISITA':v.id,'COD_MOD':v.ie?.COD_MOD||'','IESTP':v.ie?.CEN_EDU||'','FECHA':v.meta?.fecha||'','ESPECIALISTA':v.meta?.supervisor||'','ESTADO':v.status||'','PORCENTAJE_GLOBAL':c.pct,'DIAGNOSTICO':diagnosis(c)};c.res.forEach((x,i)=>r[`CBC${i+1}_PORCENTAJE`]=x.pct);return r;});
  const dic=[{CAMPO:'PORCENTAJE_GLOBAL',CBC:'General',INDICADOR:'Índice global',DESCRIPCION:'Porcentaje global de cumplimiento sobre 180 puntos',TIPO:'Numérico',VALORES:'0-100'}];
  MATRIZ.forEach(x=>{let k=x.Variable.toUpperCase();dic.push({CAMPO:k,CBC:`${x.CBC} - ${cbcName(x.CBC)}`,INDICADOR:`${x.Código} - ${x.Indicador}`,DESCRIPCION:x['Criterio técnico de verificación']||'',TIPO:'Ordinal',VALORES:'1=Deficiente / No cumple; 2=Inicio / Insuficiente; 3=En proceso / Regular; 4=Satisfactorio / Bueno; 5=Sobresaliente / Excelente'});dic.push({CAMPO:`${k}_DATO`,CBC:x.CBC,INDICADOR:x.Código,DESCRIPCION:'Dato complementario del indicador',TIPO:'Texto/numérico',VALORES:x['Tipo de evaluación (fuente)']||''});dic.push({CAMPO:`${k}_OBS`,CBC:x.CBC,INDICADOR:x.Código,DESCRIPCION:'Observación o sustento de la valoración',TIPO:'Texto',VALORES:''});dic.push({CAMPO:`${k}_EVIDENCIA`,CBC:x.CBC,INDICADOR:x.Código,DESCRIPCION:`Evidencia registrada. Evidencia exigible: ${x['Evidencias exigibles']||''}`,TIPO:'Texto',VALORES:''});});
  const wb=XLSX.utils.book_new(), ws1=XLSX.utils.json_to_sheet(base), ws2=XLSX.utils.json_to_sheet(resumen), ws3=XLSX.utils.json_to_sheet(dic); ws1['!freeze']={xSplit:4,ySplit:1}; ws2['!freeze']={xSplit:3,ySplit:1}; ws3['!freeze']={xSplit:1,ySplit:1}; ws1['!autofilter']={ref:ws1['!ref']};ws2['!autofilter']={ref:ws2['!ref']};ws3['!autofilter']={ref:ws3['!ref']}; XLSX.utils.book_append_sheet(wb,ws1,'Base_Visitas');XLSX.utils.book_append_sheet(wb,ws2,'Resumen_CBC');XLSX.utils.book_append_sheet(wb,ws3,'Diccionario');XLSX.writeFile(wb,`Base_Monitoreo_CBC_IESTP_${new Date().toISOString().slice(0,10)}.xlsx`);
}

function clearDashFilters(){ if($('dashFrom'))$('dashFrom').value='';if($('dashTo'))$('dashTo').value='';if($('dashSpecialist'))$('dashSpecialist').value='';renderDash(); }
renderDash = function(){
  const sel=$('dashSpecialist'); if(sel){const keep=sel.value, names=[...new Set(visits.map(v=>v.meta?.supervisor).filter(Boolean))].sort((a,b)=>a.localeCompare(b));sel.innerHTML='<option value="">Todos</option>'+names.map(n=>`<option ${n===keep?'selected':''}>${esc(n)}</option>`).join('');}
  const from=$('dashFrom')?.value||'',to=$('dashTo')?.value||'',sp=$('dashSpecialist')?.value||'';
  const data=visits.filter(v=>(!from||v.meta?.fecha>=from)&&(!to||v.meta?.fecha<=to)&&(!sp||v.meta?.supervisor===sp)); const finals=data.filter(v=>v.status==='Finalizada'); const avg=finals.length?Math.round(finals.reduce((s,v)=>s+visitCalc(v).pct,0)/finals.length):0; const ies=new Set(data.map(v=>v.ie?.COD_MOD).filter(Boolean)); const specs=new Set(data.map(v=>v.meta?.supervisor).filter(Boolean));
  $('dashCards').innerHTML=`<article><b>${data.length}</b><span>Visitas</span></article><article><b>${finals.length}</b><span>Finalizadas</span></article><article><b>${ies.size}</b><span>IESTP monitoreados</span></article><article><b>${specs.size}</b><span>Especialistas</span></article><article><b>${avg}%</b><span>Promedio global</span></article>`;
  let sums=Array(7).fill(0),counts=Array(7).fill(0);finals.forEach(v=>visitCalc(v).res.forEach((r,i)=>{sums[i]+=r.pct;counts[i]++}));$('dashBars').innerHTML=sums.map((s,i)=>{let p=counts[i]?Math.round(s/counts[i]):0;return `<div class="dashBar"><b>CBC ${i+1}</b><div class="bar"><i style="width:${p}%"></i></div><span>${p}%</span></div>`}).join('');
  const bySpec={};data.forEach(v=>{let n=v.meta?.supervisor||'Sin identificar',o=bySpec[n]??={vis:0,fin:0,ies:new Set(),sum:0,n:0,last:''};o.vis++;o.ies.add(v.ie?.COD_MOD||v.ie?.CEN_EDU);if(v.status==='Finalizada'){o.fin++;o.sum+=visitCalc(v).pct;o.n++;}if((v.meta?.fecha||'')>o.last)o.last=v.meta.fecha;}); const specRows=Object.entries(bySpec).sort((a,b)=>b[1].vis-a[1].vis); $('dashBySpecialist').innerHTML=specRows.length?specRows.map(([n,o])=>`<div class="rankRow"><span>${esc(n)}</span><div class="bar"><i style="width:${data.length?Math.round(o.vis/data.length*100):0}%"></i></div><b>${o.vis}</b></div>`).join(''):'<div class="note">Sin registros para los filtros seleccionados.</div>'; $('dashSpecialistTable').innerHTML=specRows.map(([n,o])=>`<tr><td>${esc(n)}</td><td>${o.vis}</td><td>${o.fin}</td><td>${o.ies.size}</td><td>${o.n?Math.round(o.sum/o.n):0}%</td><td>${esc(o.last||'—')}</td></tr>`).join('');
  const byDay={};data.forEach(v=>{let d=v.meta?.fecha||'Sin fecha',o=byDay[d]??={vis:0,fin:0,ies:new Set(),spec:new Set(),sum:0,n:0};o.vis++;o.ies.add(v.ie?.COD_MOD||v.ie?.CEN_EDU);if(v.meta?.supervisor)o.spec.add(v.meta.supervisor);if(v.status==='Finalizada'){o.fin++;o.sum+=visitCalc(v).pct;o.n++;}}); $('dashByDay').innerHTML=Object.entries(byDay).sort((a,b)=>b[0].localeCompare(a[0])).map(([d,o])=>`<tr><td>${esc(d)}</td><td>${o.vis}</td><td>${o.fin}</td><td>${o.ies.size}</td><td>${o.spec.size}</td><td>${o.n?Math.round(o.sum/o.n):0}%</td></tr>`).join('');
};

/* ===== v1.6: seguimiento institucional, control de duplicados y medidas correctivas ===== */
const REC_CATALOG=[
 {code:'REC-01',cbc:'CBC 1',action:'Actualizar o regularizar los instrumentos de gestión institucional y asegurar su aprobación, vigencia y socialización.',days:30},
 {code:'REC-02',cbc:'CBC 1',action:'Fortalecer el seguimiento al PAT y documentar el cumplimiento de metas y actividades.',days:30},
 {code:'REC-03',cbc:'CBC 2',action:'Regularizar o fortalecer la política, plan y evidencias de investigación e innovación.',days:45},
 {code:'REC-04',cbc:'CBC 3',action:'Alinear los planes de estudio, programación curricular y documentos académicos con el marco aplicable.',days:45},
 {code:'REC-05',cbc:'CBC 3',action:'Completar o actualizar evidencias de implementación curricular y seguimiento académico.',days:30},
 {code:'REC-06',cbc:'CBC 4',action:'Actualizar el cuadro multianual de necesidades y sustentar la priorización de requerimientos.',days:30},
 {code:'REC-07',cbc:'CBC 4',action:'Ejecutar y documentar acciones de mantenimiento de infraestructura, equipamiento o condiciones de seguridad.',days:30},
 {code:'REC-08',cbc:'CBC 5',action:'Implementar o actualizar el plan de capacitación docente y sus evidencias de ejecución.',days:45},
 {code:'REC-09',cbc:'CBC 6',action:'Regularizar la programación, ejecución o sustento del presupuesto vinculado a las condiciones básicas de calidad.',days:20},
 {code:'REC-10',cbc:'CBC 7',action:'Fortalecer los servicios de bienestar, salud, psicopedagogía y mecanismos de atención al estudiante.',days:15}
];
function sameIE(v,ie){return v?.ie?.COD_MOD===ie?.COD_MOD && String(v?.ie?.CODLOCAL||'')===String(ie?.CODLOCAL||'')}
function ieVisits(ie){return visits.filter(v=>sameIE(v,ie)).sort((a,b)=>String(b.meta?.fecha||'').localeCompare(String(a.meta?.fecha||'')))}
function addDays(dateStr,n){if(!dateStr)return '';let d=new Date(dateStr+'T12:00:00');d.setDate(d.getDate()+Number(n||0));return d.toISOString().slice(0,10)}
function ensureMeasures(v){v.measures ||= []; return v.measures}
function defaultMeasureFor(x){let n=Number(String(x.CBC||'').match(/\d+/)?.[0]||0);return REC_CATALOG.find(r=>r.cbc===`CBC ${n}`)||REC_CATALOG[0]}

renderIE = function(){
 let q=($('searchIE')?.value||'').toLowerCase(),g=$('gestion')?.value||'',d=$('distrito')?.value||'';
 let a=PADRON.filter(x=>(!q||[x.CEN_EDU,x.COD_MOD,x.CODLOCAL].join(' ').toLowerCase().includes(q))&&(!g||x.D_GESTION===g)&&(!d||x.D_DIST===d));
 $('ieCount').textContent=`${a.length} registro(s) encontrado(s)`;
 $('ieList').innerHTML=a.slice(0,100).map(x=>{let vv=ieVisits(x),fin=vv.filter(v=>v.status==='Finalizada'),draft=vv.find(v=>v.status==='Borrador'),last=fin[0];let state=last?`<span class="visitBadge ok">✓ Monitoreado · ${esc(last.meta?.fecha||'')}</span>`:draft?'<span class="visitBadge warn">Borrador pendiente</span>':'<span class="visitBadge">Sin visita</span>';let btn=draft?`<button onclick="resumeVisit('${draft.id}')">Continuar visita</button>`:last?`<button onclick="selectIE('${x.COD_MOD.replace(/'/g,'')}','${x.CODLOCAL.replace(/'/g,'')}',true)">＋ Seguimiento</button>`:`<button onclick="selectIE('${x.COD_MOD.replace(/'/g,'')}','${x.CODLOCAL.replace(/'/g,'')}')">Seleccionar</button>`;return `<div class="ieRow"><div><b>${esc(x.CEN_EDU)}</b><div class="meta">CM ${esc(x.COD_MOD)} · CL ${esc(x.CODLOCAL)} · ${esc(x.D_GESTION)} · ${esc(x.D_DIST)}</div><div class="meta">${esc(x.DIR_CEN||'Dirección no consignada')}</div>${state}${last?` <button class="linkBtn" onclick="openFicha('${last.id}')">Ver última ficha</button>`:''}</div>${btn}</div>`}).join('')+(a.length>100?'<div class="note">Se muestran los primeros 100 resultados. Use la búsqueda para precisar.</div>':'');
}
function resumeVisit(id){let v=visits.find(x=>x.id===id);if(!v)return;current=v;$('selectedIE').innerHTML=ieCard(v.ie);$('fecha').value=v.meta?.fecha||'';$('hora').value=v.meta?.hora||'';$('supervisor').value=v.meta?.supervisor||'';$('tipo').value=v.meta?.tipo||'Monitoreo inicial';$('modalidad').value=v.meta?.modalidad||'Presencial';$('gps').value=v.meta?.gps||'';$('obsGeneral').value=v.meta?.obs||'';show('visita')}
selectIE = function(cm,cl,follow=false){let ie=PADRON.find(x=>x.COD_MOD===cm&&x.CODLOCAL===cl);let prior=ieVisits(ie),draft=prior.find(v=>v.status==='Borrador');if(draft&&!follow){if(confirm('Esta institución tiene una visita en borrador. ¿Deseas continuarla?'))return resumeVisit(draft.id);return;}let last=prior.find(v=>v.status==='Finalizada');if(last&&!follow){if(!confirm(`Esta institución ya cuenta con una visita finalizada el ${last.meta?.fecha||''}.\n\nPara evitar duplicados, solo debe registrarse otra visita cuando corresponda a seguimiento, subsanación o verificación.\n\n¿Deseas crear una visita de seguimiento?`))return;follow=true;}current={id:'V'+Date.now(),ie,meta:{parentVisitId:follow&&last?last.id:'',visitSequence:prior.length+1},answers:{},measures:[],status:'Borrador'};$('selectedIE').innerHTML=ieCard(ie)+(last?`<div class="priorVisit"><b>Antecedente:</b> última visita ${esc(last.meta?.fecha||'')} · ${visitCalc(last).pct}% · <button class="linkBtn" onclick="openFicha('${last.id}')">Ver ficha</button></div>`:'');let now=new Date();$('fecha').value=now.toISOString().slice(0,10);$('hora').value=now.toTimeString().slice(0,5);$('supervisor').value=profile?.nombre||'';$('tipo').value=follow?'Seguimiento':'Monitoreo inicial';$('modalidad').value='Presencial';$('gps').value='';$('obsGeneral').value='';show('visita')}

startVisit = function(){if(!$('supervisor').value.trim())return alert('Registra el equipo o supervisor.');current.meta={...(current.meta||{}),fecha:$('fecha').value,hora:$('hora').value,supervisor:$('supervisor').value,tipo:$('tipo').value,modalidad:$('modalidad').value,gps:$('gps').value,obs:$('obsGeneral').value};renderCBC();show('cbc')}

const _saveIndicatorV15=saveIndicator;
saveIndicator = function(){let x=MATRIZ[indIndex];if(!selectedScore)return alert('Selecciona una valoración.');let f=$('evidence').files[0], existing=current.answers?.[x.Variable]?.evidenceName||'';if(selectedScore<3&&!f&&!existing){let rec=defaultMeasureFor(x);if(!confirm(`La valoración ${selectedScore} requiere evidencia o una medida correctiva.\n\n¿Registrar ${rec.code} como medida correctiva y continuar?`))return;let ms=ensureMeasures(current);if(!ms.some(m=>m.variable===x.Variable&&m.status!=='Subsanada'))ms.push({id:'M'+Date.now(),variable:x.Variable,cbc:x.CBC,codigo:x.Código,rec_code:rec.code,action:rec.action,responsible:'',days:rec.days,due_date:addDays(current.meta?.fecha||new Date().toISOString().slice(0,10),rec.days),status:'Pendiente',followup:'',created_at:new Date().toISOString()});}
 _saveIndicatorV15();
}

function measuresHTML(v,editable=false){let ms=ensureMeasures(v);if(!ms.length)return '<div class="note">No se registraron medidas correctivas.</div>';return `<div class="tableWrap"><table class="reportTable"><thead><tr><th>Código</th><th>Indicador</th><th>Medida correctiva</th><th>Responsable</th><th>Plazo</th><th>Vencimiento</th><th>Estado</th><th>Seguimiento</th></tr></thead><tbody>${ms.map((m,i)=>`<tr><td>${esc(m.rec_code)}</td><td>${esc((m.cbc||'')+' '+(m.codigo||''))}</td><td>${esc(m.action||'')}</td><td>${editable?`<input value="${esc(m.responsible||'')}" onchange="updateMeasure(${i},'responsible',this.value)">`:esc(m.responsible||'—')}</td><td>${m.days||''} días</td><td>${esc(m.due_date||'—')}</td><td>${editable?`<select onchange="updateMeasure(${i},'status',this.value)"><option ${m.status==='Pendiente'?'selected':''}>Pendiente</option><option ${m.status==='En proceso'?'selected':''}>En proceso</option><option ${m.status==='Subsanada'?'selected':''}>Subsanada</option></select>`:esc(m.status||'Pendiente')}</td><td>${editable?`<input value="${esc(m.followup||'')}" onchange="updateMeasure(${i},'followup',this.value)">`:esc(m.followup||'—')}</td></tr>`).join('')}</tbody></table></div>`}
function updateMeasure(i,k,val){if(!current)return;ensureMeasures(current)[i][k]=val;saveDraft(true)}
const _summaryV15=summary;
summary = function(){_summaryV15();let sec=$('summaryMeasures');if(sec){sec.innerHTML=measuresHTML(current,true)}}

const _renderFichaV15=renderFicha;
renderFicha = function(){_renderFichaV15();if(!current)return;let fc=$('fichaContent');let box=document.createElement('div');box.className='fichaSection';box.innerHTML=`<h3>Medidas correctivas y seguimiento</h3>${measuresHTML(current,false)}`;fc.insertBefore(box,fc.lastElementChild)}

const _exportAllV15=exportAllVisits;
exportAllVisits = function(){
 if(!visits.length||!window.XLSX)return _exportAllV15();
 const base=visits.map(v=>{const c=visitCalc(v),row={ID_VISITA:v.id,VISITA_ORIGEN:v.meta?.parentVisitId||'',N_VISITA:v.meta?.visitSequence||'',COD_MOD:v.ie?.COD_MOD||'',COD_LOCAL:v.ie?.CODLOCAL||'',IESTP:v.ie?.CEN_EDU||'',GESTION:v.ie?.D_GESTION||'',DISTRITO:v.ie?.D_DIST||'',FECHA:v.meta?.fecha||'',HORA:v.meta?.hora||'',ESPECIALISTA:v.meta?.supervisor||'',TIPO_VISITA:v.meta?.tipo||'',MODALIDAD:v.meta?.modalidad||'',GPS:v.meta?.gps||'',ESTADO:v.status||'',OBS_GENERAL:v.meta?.obs||'',PUNTAJE_TOTAL:c.sum,PORCENTAJE_GLOBAL:c.pct,DIAGNOSTICO:diagnosis(c),N_MEDIDAS:ensureMeasures(v).length,N_PENDIENTES:ensureMeasures(v).filter(m=>m.status!=='Subsanada').length};c.res.forEach((r,i)=>row[`CBC${i+1}_PORCENTAJE`]=r.pct);MATRIZ.forEach(x=>{let a=v.answers?.[x.Variable]||{},k=x.Variable.toUpperCase();row[k]=a.score??'';row[`${k}_DATO`]=a.extra||'';row[`${k}_OBS`]=a.obs||'';row[`${k}_EVIDENCIA`]=a.evidenceName||''});return row});
 const measures=visits.flatMap(v=>ensureMeasures(v).map(m=>({ID_VISITA:v.id,COD_MOD:v.ie?.COD_MOD||'',IESTP:v.ie?.CEN_EDU||'',FECHA_VISITA:v.meta?.fecha||'',ESPECIALISTA:v.meta?.supervisor||'',CBC:m.cbc,COD_INDICADOR:m.codigo,VARIABLE:m.variable,COD_MEDIDA:m.rec_code,MEDIDA_CORRECTIVA:m.action,RESPONSABLE:m.responsible||'',PLAZO_DIAS:m.days,VENCIMIENTO:m.due_date,ESTADO:m.status,SEGUIMIENTO:m.followup||''})));
 const dic=[{CAMPO:'TIPO_VISITA',DESCRIPCION:'Monitoreo inicial, Seguimiento, Subsanación o Verificación',VALORES:'Monitoreo inicial; Seguimiento; Subsanación; Verificación'},{CAMPO:'VISITA_ORIGEN',DESCRIPCION:'Identificador de la visita finalizada que origina el seguimiento',VALORES:'UUID/ID visita'},{CAMPO:'GPS',DESCRIPCION:'Latitud y longitud capturada durante la visita',VALORES:'latitud, longitud'},{CAMPO:'N_MEDIDAS',DESCRIPCION:'Número de medidas correctivas vinculadas a la visita',VALORES:'Entero'}];MATRIZ.forEach(x=>{let k=x.Variable.toUpperCase();dic.push({CAMPO:k,CBC:`${x.CBC} - ${cbcName(x.CBC)}`,INDICADOR:`${x.Código} - ${x.Indicador}`,DESCRIPCION:x['Criterio técnico de verificación']||'',TIPO:'Ordinal',VALORES:'1=Deficiente / No cumple; 2=Inicio / Insuficiente; 3=En proceso / Regular; 4=Satisfactorio / Bueno; 5=Sobresaliente / Excelente'});dic.push({CAMPO:`${k}_DATO`,DESCRIPCION:'Dato complementario',VALORES:x['Tipo de evaluación (fuente)']||''},{CAMPO:`${k}_OBS`,DESCRIPCION:'Observación o sustento',VALORES:''},{CAMPO:`${k}_EVIDENCIA`,DESCRIPCION:'Nombre de evidencia registrada',VALORES:x['Evidencias exigibles']||''})});
 const wb=XLSX.utils.book_new();[['Base_Visitas',base],['Medidas_Correctivas',measures],['Diccionario',dic]].forEach(([n,d])=>{let ws=XLSX.utils.json_to_sheet(d);ws['!autofilter']={ref:ws['!ref']||'A1'};XLSX.utils.book_append_sheet(wb,ws,n)});XLSX.writeFile(wb,`Base_Monitoreo_CBC_IESTP_${new Date().toISOString().slice(0,10)}.xlsx`);
}

const _renderDashV15=renderDash;
renderDash = function(){_renderDashV15();let from=$('dashFrom')?.value||'',to=$('dashTo')?.value||'',sp=$('dashSpecialist')?.value||'';let data=visits.filter(v=>(!from||v.meta?.fecha>=from)&&(!to||v.meta?.fecha<=to)&&(!sp||v.meta?.supervisor===sp));let follow=data.filter(v=>['Seguimiento','Subsanación','Verificación'].includes(v.meta?.tipo)).length,pending=data.reduce((s,v)=>s+ensureMeasures(v).filter(m=>m.status!=='Subsanada').length,0),unique=new Set(data.filter(v=>v.status==='Finalizada').map(v=>(v.ie?.COD_MOD||'')+'|'+(v.ie?.CODLOCAL||''))).size;let cards=$('dashCards');cards.innerHTML+=`<article><b>${unique}</b><span>IESTP únicos</span></article><article><b>${follow}</b><span>Seguimientos</span></article><article><b>${pending}</b><span>Medidas pendientes</span></article>`;let mb=$('dashMeasures');if(mb){let all=data.flatMap(v=>ensureMeasures(v));mb.innerHTML=all.length?all.map(m=>`<div class="rankRow"><span>${esc(m.rec_code+' · '+m.status)}</span><div class="bar"><i style="width:${m.status==='Subsanada'?100:m.status==='En proceso'?60:25}%"></i></div><b>${esc(m.due_date||'')}</b></div>`).join(''):'<div class="note">Sin medidas correctivas registradas.</div>'}}


/* ===== v2.0: cumplimiento reforzado del documento base CBC ===== */
const REC_CATALOG_WORD=[
 {code:'REC-01',cbc:'CBC 1',action:'Actualización de Instrumentos de Gestión: formalizar mediante R.D. el PEI, PAT y RI con alineamiento a la Ley N.° 30512.',days:30},
 {code:'REC-02',cbc:'CBC 1',action:'Fortalecimiento de Transparencia Digital: habilitar el módulo de notas e interoperabilidad del portal web transparente.',days:15},
 {code:'REC-03',cbc:'CBC 2',action:'Activación del Plan de Investigación: asignar presupuesto y horas no lectivas para el Repositorio Digital y proyectos.',days:45},
 {code:'REC-04',cbc:'CBC 3',action:'Reestructuración Curricular CNOF: reestructurar los itinerarios formativos para su total adecuación al CNOF.',days:60},
 {code:'REC-05',cbc:'CBC 3',action:'Formalización de Convenios para EFSRT: suscribir convenios con empresas del sector productivo para prácticas modulares.',days:45},
 {code:'REC-06',cbc:'CBC 5',action:'Ejecución del Plan de Capacitación Docente: desplegar el programa de actualización pedagógica en didáctica y tecnología.',days:30},
 {code:'REC-07',cbc:'CBC 4',action:'Mantenimiento de Equipos e Infraestructura: tramitar fichas de mantenimiento correctivo de maquinaria e informática.',days:30},
 {code:'REC-08',cbc:'CBC 4',action:'Adecuación de Seguridad y Conectividad: actualizar señalética INDECI, extintores y garantizar ancho de banda en laboratorios.',days:15},
 {code:'REC-09',cbc:'CBC 7',action:'Implementación de Servicios de Bienestar: equipar el tópico de primeros auxilios y activar la plataforma de seguimiento a egresados.',days:30},
 {code:'REC-10',cbc:'CBC 7',action:'Institucionalización de la Representación: convocar elecciones para la conformación del Comité de Representación Estudiantil.',days:20}
];
function wordMeasuresFor(x){return REC_CATALOG_WORD.filter(r=>r.cbc===x.CBC)}
function extraSpec(x){const t=(x['Tipo de evaluación (fuente)']||'').toLowerCase();let type='text',min=null,max=null,step='any',label='Dato complementario',help=x['Tipo de evaluación (fuente)']||'';if(t.includes('%')){type='number';min=0;max=100;step='0.01';label='Dato cuantitativo (%)'}else if(t.includes('n.°')||t.includes('atenciones')||t.includes('vacantes')||t.includes('eventos')){type='number';min=0;step='1';label='Dato cuantitativo (N.°)'}else if(t.includes('m²')||t.includes('soles')||t.includes('ancho')||t.includes('promedio')){type='number';min=0;step='0.01';label='Dato cuantitativo'}return{type,min,max,step,label,help,required:t.includes('mixta')||t.includes('cuantitativa')}}
const _openIndV20=openInd;
openInd=function(i){_openIndV20(i);const x=MATRIZ[indIndex],sp=extraSpec(x),inp=$('extraValue');inp.type=sp.type;inp.step=sp.step;if(sp.min!==null)inp.min=sp.min;else inp.removeAttribute('min');if(sp.max!==null)inp.max=sp.max;else inp.removeAttribute('max');$('extraLabel').childNodes[0].nodeValue=sp.label+' ';$('extraHelp').textContent=sp.required?'Requerido por el tipo de evaluación: '+sp.help:'Tipo de evaluación: '+sp.help;$('extraHelp').className=sp.required?'validationWarn':'';$('evidenceRule').textContent=selectedScore&&selectedScore<3?'Valoración menor a 3: debe adjuntarse evidencia o registrarse una medida correctiva.':''}
function validateIndicatorWord(){const x=MATRIZ[indIndex],sp=extraSpec(x),val=$('extraValue').value.trim(),old=current.answers?.[x.Variable]||{},file=$('evidence').files[0];if(!selectedScore)return 'Selecciona una valoración de 1 a 5.';if(sp.required&&!val)return 'Este indicador requiere el dato cuantitativo complementario ('+sp.help+').';if(sp.type==='number'&&val){const n=Number(val);if(!Number.isFinite(n))return 'El dato complementario debe ser numérico.';if(sp.min!==null&&n<sp.min)return 'El valor no puede ser menor que '+sp.min+'.';if(sp.max!==null&&n>sp.max)return 'El valor no puede ser mayor que '+sp.max+'.'}if(selectedScore<3&&!file&&!old.evidenceName&&!ensureMeasures(current).some(m=>m.variable===x.Variable&&m.status!=='Subsanada')){const opts=wordMeasuresFor(x);if(!opts.length)return 'La valoración menor a 3 requiere evidencia. El documento base no define una medida REC específica para '+x.CBC+'.';const r=opts[0];ensureMeasures(current).push({id:'M'+Date.now(),variable:x.Variable,cbc:x.CBC,codigo:x.Código,rec_code:r.code,action:r.action,responsible:'',days:r.days,due_date:addDays(current.meta?.fecha||new Date().toISOString().slice(0,10),r.days),status:'Pendiente',followup:'',created_at:new Date().toISOString()});}return ''}
async function uploadEvidenceFile(file,x){if(!file||!sb||!authUser)return null;try{const ext=(file.name.split('.').pop()||'bin').replace(/[^a-z0-9]/gi,'');const key=`${authUser.id}/${current.id}/${x.Variable}_${Date.now()}.${ext}`;const {error}=await sb.storage.from('evidencias-cbc').upload(key,file,{upsert:false});if(error){console.warn(error);return null}return key}catch(e){console.warn(e);return null}}
saveIndicator=async function(){const err=validateIndicatorWord();if(err)return alert(err);const x=MATRIZ[indIndex],old=current.answers?.[x.Variable]||{},f=$('evidence').files[0];let path=old.evidencePath||'';if(f){const up=await uploadEvidenceFile(f,x);if(up)path=up}current.answers[x.Variable]={score:selectedScore,extra:$('extraValue').value,obs:$('indObs').value,evidenceName:f?f.name:old.evidenceName||'',evidencePath:path};saveDraft(true);if(indIndex<MATRIZ.length-1)openInd(indIndex+1);else summary()}
saveAndExit=async function(){if(selectedScore){const err=validateIndicatorWord();if(err)return alert(err);const x=MATRIZ[indIndex],old=current.answers?.[x.Variable]||{},f=$('evidence').files[0];let path=old.evidencePath||'';if(f){const up=await uploadEvidenceFile(f,x);if(up)path=up}current.answers[x.Variable]={score:selectedScore,extra:$('extraValue').value,obs:$('indObs').value,evidenceName:f?f.name:old.evidenceName||'',evidencePath:path}}saveDraft(true);renderCBC();show('cbc')}
getGPS=function(){if(!navigator.geolocation)return alert('Geolocalización no disponible.');navigator.geolocation.getCurrentPosition(p=>{$('gps').value=p.coords.latitude.toFixed(6)+', '+p.coords.longitude.toFixed(6);$('gpsAccuracy').textContent='Precisión aproximada: ±'+Math.round(p.coords.accuracy)+' m';$('gpsAccuracy').className=p.coords.accuracy<=30?'':'validationWarn';if(current){current.meta ||= {};current.meta.gpsAccuracy=Math.round(p.coords.accuracy)}},()=>alert('No fue posible obtener la ubicación.'),{enableHighAccuracy:true,timeout:15000,maximumAge:0})}
const _startVisitV20=startVisit;
startVisit=function(){_startVisitV20();if(current){current.meta.gpsAccuracy=current.meta.gpsAccuracy||null;const sf=$('visitSignature')?.files?.[0];if(sf){current.meta.signatureName=sf.name;current.meta.signatureFile=sf;$('signatureName').textContent='Registrado: '+sf.name}saveDraft(true)}}
const _resumeVisitV20=resumeVisit;
resumeVisit=function(id){_resumeVisitV20(id);if($('gpsAccuracy'))$('gpsAccuracy').textContent=current?.meta?.gpsAccuracy?'Precisión aproximada: ±'+current.meta.gpsAccuracy+' m':'Precisión: sin registrar';if($('signatureName'))$('signatureName').textContent=current?.meta?.signatureName?'Registrado: '+current.meta.signatureName:''}
const _finishV20=finishVisit;
finishVisit=function(){if(Object.keys(current?.answers||{}).length<MATRIZ.length)return alert('Para finalizar la visita deben registrarse los 36 indicadores. Puedes guardarla como borrador y continuar después.');for(const x of MATRIZ){const a=current.answers[x.Variable]||{},sp=extraSpec(x);if(!a.score)return alert('Falta valoración en '+x.Código+' · '+x.Indicador);if(sp.required&&!String(a.extra||'').trim())return alert('Falta dato cuantitativo en '+x.Código+' · '+x.Indicador);if(Number(a.score)<3&&!a.evidenceName&&!ensureMeasures(current).some(m=>m.variable===x.Variable))return alert('La valoración menor a 3 en '+x.Código+' requiere evidencia o medida correctiva.')}return _finishV20()}
// nombres completos en tarjetas CBC
renderCBC=function(){let groups=grouped();$('cbcInstitute').textContent=current.ie.CEN_EDU;let done=Object.keys(current.answers).length,total=MATRIZ.length;$('progressText').textContent=`${done} de ${total} indicadores registrados`;$('progressBar').style.width=(done/total*100)+'%';$('cbcList').innerHTML=Object.entries(groups).map(([cbc,arr],k)=>{let n=arr.filter(x=>current.answers[x.Variable]).length,p=Math.round(n/arr.length*100);return `<div class="cbcCard" onclick="openCBC('${cbc}')"><div class="cbcIcon">${k+1}</div><div><b>${esc(cbc)} · ${esc(cbcName(cbc))}</b><div class="meta">${arr.length} indicadores</div><div class="bar"><i style="width:${p}%"></i></div><div class="meta">${n}/${arr.length} registrados · ${p}%</div></div><span>›</span></div>`}).join('')+`<button onclick="summary()">Ver resumen →</button>`}


/* ===== v2.1: evidencia móvil robusta + persistencia completa ===== */
function persistIndicatorBeforeExternalApp(){
  if(!current || !MATRIZ[indIndex]) return;
  const x=MATRIZ[indIndex], old=current.answers?.[x.Variable]||{};
  if(selectedScore){ current.answers[x.Variable]={...old,score:selectedScore,extra:$('extraValue').value,obs:$('indObs').value}; }
  const i=visits.findIndex(v=>v.id===current.id); if(i>=0) visits[i]=current; else visits.push(current);
  localStorage.setItem('cbc_visits',JSON.stringify(visits));
  sessionStorage.setItem('cbc_restore',JSON.stringify({visitId:current.id,indicator:indIndex,at:Date.now()}));
  if(backendConfigured&&authUser) cloudSave(current);
}
function prepareEvidenceCapture(){persistIndicatorBeforeExternalApp()}
async function handleEvidenceSelected(file){
  if(!file||!current||!MATRIZ[indIndex]) return;
  const x=MATRIZ[indIndex], old=current.answers?.[x.Variable]||{};
  current.answers[x.Variable]={...old,score:selectedScore||old.score,extra:$('extraValue').value,obs:$('indObs').value,evidenceName:file.name,evidencePath:old.evidencePath||''};
  $('evidenceName').textContent='Preparando evidencia: '+file.name;
  const prev=$('evidencePreview'); prev.innerHTML='';
  if(file.type?.startsWith('image/')){const img=document.createElement('img');img.alt='Vista previa de evidencia';img.src=URL.createObjectURL(file);prev.appendChild(img)}
  const st=document.createElement('span');st.className='warnUpload';st.textContent='Guardando…';prev.appendChild(st);
  persistIndicatorBeforeExternalApp();
  const path=await uploadEvidenceFile(file,x);
  if(path){current.answers[x.Variable].evidencePath=path;st.className='okUpload';st.textContent='✓ Evidencia guardada en Supabase';$('evidenceName').textContent='Registrado: '+file.name;saveDraft(true)}
  else {st.className='warnUpload';st.textContent='⚠ No se pudo subir. No avances hasta revisar conexión.';$('evidenceName').textContent='Pendiente de carga: '+file.name;}
}
const _openIndV21=openInd;
openInd=function(i){_openIndV21(i);const a=current?.answers?.[MATRIZ[indIndex]?.Variable]||{};const prev=$('evidencePreview');if(prev){prev.innerHTML=a.evidencePath?'<span class="okUpload">✓ Evidencia almacenada</span>':a.evidenceName?'<span class="warnUpload">Evidencia pendiente de confirmar</span>':''}sessionStorage.setItem('cbc_restore',JSON.stringify({visitId:current?.id,indicator:indIndex,at:Date.now()}));}
const _enterSessionV21=enterSession;
enterSession=async function(user){await _enterSessionV21(user);try{const r=JSON.parse(sessionStorage.getItem('cbc_restore')||'null');if(r&&Date.now()-r.at<30*60*1000){const v=visits.find(x=>x.id===r.visitId);if(v&&v.status!=='Finalizada'){current=v;openInd(Number(r.indicator)||0)}}}catch(e){console.warn(e)}}
const _finishV21=finishVisit;
finishVisit=function(){sessionStorage.removeItem('cbc_restore');return _finishV21()}

// Sincroniza medidas correctivas con Supabase después de guardar la visita.
const _cloudSaveV21=cloudSave;
cloudSave=async function(v){
  await _cloudSaveV21(v);
  if(!sb||!authUser||!v.cloudId) return;
  const rows=(v.measures||[]).map(m=>({visita_id:v.cloudId,variable:m.variable,cbc:m.cbc||'',codigo_indicador:m.codigo||'',codigo_medida:m.rec_code,medida:m.action,responsable:m.responsible||null,plazo_dias:m.days||null,fecha_vencimiento:m.due_date||null,estado:m.status||'Pendiente',seguimiento:m.followup||null,updated_at:new Date().toISOString()}));
  if(rows.length){const rr=await sb.from('medidas_correctivas').upsert(rows,{onConflict:'visita_id,variable,codigo_medida'});if(rr.error)console.warn('Medidas sync',rr.error)}
}

/* ===== v2.2: especialistas, cuenta personal y cierre inmutable ===== */
let lastFinalVisitId = null;
function roleLabel(role){ const r=String(role||'').toLowerCase(); return r==='admin'?'Administrador':'Especialista'; }
function visitCode(v){
  if(!v) return '';
  const year=(v.meta?.fecha||new Date().toISOString().slice(0,10)).slice(0,4);
  const raw=String(v.cloudId||v.id||'').replace(/[^a-zA-Z0-9]/g,'').toUpperCase();
  return `CBC-${year}-${(raw.slice(-8)||Date.now().toString().slice(-8))}`;
}
const _enterSessionV22=enterSession;
enterSession=async function(user){
  await _enterSessionV22(user);
  if($('userLabel')) $('userLabel').textContent=(profile?.nombre||user.email)+' · '+roleLabel(profile?.rol);
  if($('accountBtn')) $('accountBtn').classList.remove('hidden');
  const admin=(profile?.rol||'').toLowerCase()==='admin';
  if($('navAdmin')) $('navAdmin').classList.toggle('hidden',!admin);
  if($('quickAdmin')) $('quickAdmin').classList.toggle('hidden',!admin);
};
const _logoutV22=logout;
logout=async function(){ if($('accountBtn')) $('accountBtn').classList.add('hidden'); return _logoutV22(); };
function showAccount(){
  if(!authUser) return;
  $('accountName').value=profile?.nombre||'';
  $('accountEmail').value=authUser.email||'';
  $('accountRole').value=roleLabel(profile?.rol);
  $('newPassword').value=''; $('confirmPassword').value='';
  $('accountMsg').classList.add('hidden');
  show('account');
}
async function saveAccountName(){
  const nombre=$('accountName').value.trim(); if(!nombre) return accountMessage('Ingresa tu nombre.',true);
  const {error}=await sb.rpc('update_my_profile_name',{p_nombre:nombre});
  if(error) return accountMessage('No se pudo actualizar el nombre.',true);
  profile.nombre=nombre; $('userLabel').textContent=nombre+' · '+roleLabel(profile.rol); accountMessage('✓ Nombre actualizado correctamente.');
}
async function changePassword(){
  const a=$('newPassword').value,b=$('confirmPassword').value;
  if(a.length<8) return accountMessage('La nueva contraseña debe tener al menos 8 caracteres.',true);
  if(a!==b) return accountMessage('Las contraseñas no coinciden.',true);
  const {error}=await sb.auth.updateUser({password:a});
  if(error) return accountMessage('No se pudo actualizar la contraseña: '+error.message,true);
  $('newPassword').value=''; $('confirmPassword').value=''; accountMessage('✓ Contraseña actualizada correctamente.');
}
function accountMessage(t,bad=false){const e=$('accountMsg');e.textContent=t;e.classList.remove('hidden');e.style.color=bad?'#9d2525':'';}
async function forgotPassword(){
  if(!backendConfigured) return backendMsg('Supabase no está configurado.',true);
  const email=$('loginEmail').value.trim();
  if(!email) return backendMsg('Escribe primero tu correo institucional.',true);
  const redirectTo=location.origin+location.pathname;
  const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo});
  if(error) return backendMsg('No fue posible enviar el enlace de recuperación.',true);
  backendMsg('✓ Revisa tu correo institucional. Te enviamos un enlace para crear una nueva contraseña.');
}
if(sb){ sb.auth.onAuthStateChange((event)=>{ if(event==='PASSWORD_RECOVERY'){ setTimeout(()=>{ if(authUser) showAccount(); },500); } }); }

const _saveDraftV22=saveDraft;
saveDraft=function(silent=false){
  if(current?.status==='Finalizada'){ if(!silent) alert('🔒 Esta ficha está finalizada y es de solo lectura. Para solicitar una corrección, comuníquese con el administrador indicando el código de visita '+visitCode(current)+'.'); return; }
  return _saveDraftV22(silent);
};
const _resumeVisitV22=resumeVisit;
resumeVisit=function(id){
  const v=visits.find(x=>x.id===id);
  if(v?.status==='Finalizada'){ current=v; alert('🔒 Esta ficha ya fue finalizada y no puede volver a abrirse para edición.\n\nCódigo: '+visitCode(v)+'\nPara solicitar una corrección, comuníquese con el administrador.'); return openFicha(id); }
  return _resumeVisitV22(id);
};

finishVisit=async function(){
  if(!current) return;
  if(current.status==='Finalizada') return alert('Esta ficha ya se encuentra finalizada.');
  if(current.ownerId&&authUser&&current.ownerId!==authUser.id&&(profile?.rol||'').toLowerCase()!=='admin') return alert('Esta visita pertenece a otro especialista y está disponible solo para consulta.');
  if(Object.keys(current.answers||{}).length<MATRIZ.length) return alert('Para finalizar la visita deben registrarse los 36 indicadores. Puedes guardarla como borrador y continuar después.');
  for(const x of MATRIZ){
    const a=current.answers[x.Variable]||{},sp=extraSpec(x);
    if(!a.score) return alert('Falta valoración en '+x.Código+' · '+x.Indicador);
    if(sp.required&&!String(a.extra||'').trim()) return alert('Falta dato cuantitativo en '+x.Código+' · '+x.Indicador);
    if(Number(a.score)<3&&!a.evidenceName&&!ensureMeasures(current).some(m=>m.variable===x.Variable)) return alert('La valoración menor a 3 en '+x.Código+' requiere evidencia o medida correctiva.');
  }
  if(!confirm('FINALIZAR Y ENVIAR FICHA\n\nUna vez enviada, la ficha quedará cerrada y ya no podrá ser modificada por el especialista.\n\n¿Confirmas que has revisado la información y deseas finalizarla?')) return;
  current.status='Finalizada'; current.finishedAt=new Date().toISOString();
  const i=visits.findIndex(v=>v.id===current.id); if(i>=0) visits[i]=current; else visits.push(current);
  localStorage.setItem('cbc_visits',JSON.stringify(visits));
  if(backendConfigured&&authUser) await cloudSave(current);
  sessionStorage.removeItem('cbc_restore');
  lastFinalVisitId=current.id;
  const code=visitCode(current), dt=new Date(current.finishedAt);
  $('finalSuccessInfo').innerHTML=`<div><small>Institución</small><b>${esc(current.ie?.CEN_EDU||'')}</b></div><div><small>Código de visita</small><b>${esc(code)}</b></div><div><small>Fecha y hora de envío</small><b>${esc(dt.toLocaleString('es-PE'))}</b></div><div><small>Especialista</small><b>${esc(current.meta?.supervisor||profile?.nombre||'')}</b></div>`;
  show('finalSuccess');
};
function openLastFinalFicha(){ const v=visits.find(x=>x.id===lastFinalVisitId)||current; if(v){current=v;show('ficha');} }
function downloadLastFinalPDF(){ const v=visits.find(x=>x.id===lastFinalVisitId)||current; if(v){current=v;downloadFichaPDF();} }

renderHistory=function(){
  $('historyList').innerHTML=visits.length?visits.slice().reverse().map(v=>{let old=current;current=v;let c=calc();current=old;const fin=v.status==='Finalizada',ann=v.status==='Anulada';return `<div class="historyRow"><div><b>${esc(v.ie?.CEN_EDU||'')}</b><div class="meta">${esc(v.meta?.fecha||'')} · ${esc(v.meta?.tipo||'')} · ${esc(v.meta?.supervisor||'')}</div><div class="meta">${ann?'⛔ Anulada':fin?'🔒 Finalizada':'📝 Borrador'} · Índice global ${c.pct}%${fin?' · '+esc(visitCode(v)):''}</div></div><div class="historyTools">${(fin||ann)?`<button onclick="openFicha('${v.id}')">Ver ficha</button>`:`<button onclick="resumeVisit('${v.id}')">Continuar</button>`}</div></div>`}).join(''):'<div class="note">Aún no hay visitas guardadas.</div>';
};
const _renderFichaV22=renderFicha;
renderFicha=function(){
  _renderFichaV22(); if(!current) return;
  const head=$('fichaContent')?.querySelector('.fichaHead');
  if(head&&current.status==='Finalizada'){
    const n=document.createElement('div'); n.className='lockedNotice fichaLocked'; n.innerHTML=`<b>🔒 Ficha finalizada · Solo lectura</b><p>Código de visita: <b>${esc(visitCode(current))}</b>. Esta ficha no admite modificaciones. Para solicitar una corrección, comuníquese con el administrador indicando este código y el motivo.</p>`; head.after(n);
  }
};


/* ===== v2.3: administración segura ===== */
function isAdmin(){return String(profile?.rol||'').toLowerCase()==='admin';}
function fmtDateTime(v){if(!v)return '—';try{return new Date(v).toLocaleString('es-PE')}catch{return v}}
async function showAdmin(){
  if(!isAdmin()) return alert('Acceso exclusivo para el administrador.');
  show('admin');
  await Promise.all([loadAdminUsers(),loadAdminAudit()]);
  renderAdminVisits();
}
async function loadAdminUsers(){
  if(!isAdmin()||!sb)return;
  const {data,error}=await sb.rpc('admin_list_users');
  if(error){console.warn(error);$('adminUsersBody').innerHTML='<tr><td colspan="6">Ejecuta ACTUALIZACION_V23_ADMIN.sql en Supabase para habilitar este módulo.</td></tr>';return;}
  window._adminUsers=data||[];
  $('adminUsersKpi').textContent=window._adminUsers.length;
  $('adminActiveKpi').textContent=window._adminUsers.filter(x=>x.activo).length;
  $('adminVisitsKpi').textContent=visits.length;
  $('adminFinalKpi').textContent=visits.filter(v=>v.status==='Finalizada').length;
  $('adminUsersBody').innerHTML=window._adminUsers.map(u=>{
    const self=u.user_id===authUser?.id, active=!!u.activo;
    return `<tr><td><b>${esc(u.nombre||'Sin nombre')}</b></td><td>${esc(u.email||'')}</td><td>${esc(roleLabel(u.rol))}</td><td><span class="adminStatus ${active?'on':'off'}">${active?'Habilitado':'Retirado'}</span></td><td>${esc(fmtDateTime(u.last_sign_in_at))}</td><td>${self?'<span class="muted">Tu cuenta</span>':`<button class="${active?'dangerSmall':'secondary'}" onclick="adminToggleUser('${u.user_id}',${!active})">${active?'Retirar acceso':'Habilitar'}</button>`}</td></tr>`;
  }).join('')||'<tr><td colspan="6">No hay usuarios.</td></tr>';
}
async function adminToggleUser(id,enable){
  if(!isAdmin())return;
  const action=enable?'habilitar':'retirar';
  if(!confirm(`¿Confirmas ${action} el acceso de este usuario?`))return;
  const {error}=await sb.rpc('admin_set_user_active',{p_user_id:id,p_activo:enable});
  if(error)return alert('No se pudo actualizar el usuario: '+error.message);
  await loadAdminUsers(); await loadAdminAudit();
}
function renderAdminVisits(){
  if(!isAdmin()||!$('adminVisitsList'))return;
  const q=($('adminVisitSearch')?.value||'').toLowerCase();
  const rows=visits.slice().reverse().filter(v=>!q||[v.ie?.CEN_EDU,v.meta?.supervisor,visitCode(v),v.meta?.fecha,v.status].join(' ').toLowerCase().includes(q));
  $('adminVisitsList').innerHTML=rows.map(v=>{
    const fin=v.status==='Finalizada', ann=v.status==='Anulada';
    return `<div class="historyRow adminVisitRow"><div><b>${esc(v.ie?.CEN_EDU||'')}</b><div class="meta">${esc(visitCode(v))} · ${esc(v.meta?.fecha||'')} · ${esc(v.meta?.supervisor||'')}</div><div class="meta">${ann?'⛔ Anulada':fin?'🔒 Finalizada':'📝 Borrador'} · ${esc(v.meta?.tipo||'')}</div></div><div class="historyTools"><button onclick="openFicha('${v.id}')">Ver</button>${fin?`<button class="secondary" onclick="adminAnnulVisit('${v.id}')">Anular</button>`:''}<button class="dangerSmall" onclick="adminDeleteVisit('${v.id}')">Eliminar prueba</button></div></div>`;
  }).join('')||'<div class="note">No hay fichas que coincidan con la búsqueda.</div>';
}
async function adminAnnulVisit(id){
  if(!isAdmin())return;
  const v=visits.find(x=>x.id===id); if(!v)return;
  const motivo=prompt('Motivo de anulación de la ficha '+visitCode(v)+':');
  if(!motivo?.trim())return;
  if(!confirm('La ficha quedará ANULADA y se conservará para trazabilidad. ¿Continuar?'))return;
  const {error}=await sb.rpc('admin_annul_visit',{p_visita_id:v.cloudId||v.id,p_motivo:motivo.trim()});
  if(error)return alert('No se pudo anular: '+error.message);
  await syncFromCloud(); renderAdminVisits(); await loadAdminAudit(); alert('Ficha anulada. Se conserva en el historial para trazabilidad.');
}
async function removeEvidenceForVisit(v){
  if(!sb||!v)return;
  const paths=Object.values(v.answers||{}).map(a=>a.evidencePath).filter(Boolean);
  if(paths.length)try{await sb.storage.from('evidencias-cbc').remove(paths)}catch(e){console.warn(e)}
}
async function adminDeleteVisit(id){
  if(!isAdmin())return;
  const v=visits.find(x=>x.id===id);if(!v)return;
  const code=visitCode(v);
  const typed=prompt(`ELIMINAR FICHA DE PRUEBA\n\n${code} · ${v.ie?.CEN_EDU||''}\n\nEsta acción es definitiva. Escribe ELIMINAR para confirmar:`);
  if(typed!=='ELIMINAR')return;
  await removeEvidenceForVisit(v);
  const {error}=await sb.rpc('admin_delete_visit',{p_visita_id:v.cloudId||v.id,p_motivo:'Eliminación de registro de prueba desde panel administrador'});
  if(error)return alert('No se pudo eliminar: '+error.message);
  await syncFromCloud(); renderAdminVisits(); await loadAdminAudit(); alert('Ficha de prueba eliminada.');
}
async function adminClearTestData(){
  if(!isAdmin())return;
  const typed=prompt('LIMPIAR DATOS DE PRUEBA\n\nSe eliminarán TODAS las fichas, evaluaciones y medidas correctivas. NO se eliminarán usuarios ni padrón.\n\nEscribe LIMPIAR PRUEBAS para confirmar:');
  if(typed!=='LIMPIAR PRUEBAS')return;
  if(!confirm('Última confirmación: esta acción eliminará todas las fichas registradas. ¿Continuar?'))return;
  for(const v of visits) await removeEvidenceForVisit(v);
  const {error}=await sb.rpc('admin_clear_test_data',{p_confirmacion:'LIMPIAR PRUEBAS'});
  if(error)return alert('No se pudo realizar la limpieza: '+error.message);
  visits=[];current=null;localStorage.removeItem('cbc_visits');renderAdminVisits();await loadAdminAudit();$('adminVisitsKpi').textContent='0';$('adminFinalKpi').textContent='0';alert('Datos de prueba eliminados. Usuarios y padrón se conservaron.');
}
async function loadAdminAudit(){
  if(!isAdmin()||!sb||!$('adminAuditBody'))return;
  const {data,error}=await sb.from('admin_actions').select('created_at,accion,detalle').order('created_at',{ascending:false}).limit(100);
  if(error){$('adminAuditBody').innerHTML='<tr><td colspan="3">Registro disponible después de ejecutar la actualización v2.3.</td></tr>';return;}
  $('adminAuditBody').innerHTML=(data||[]).map(r=>`<tr><td>${esc(fmtDateTime(r.created_at))}</td><td>${esc(r.accion||'')}</td><td>${esc(r.detalle||'')}</td></tr>`).join('')||'<tr><td colspan="3">Sin acciones registradas.</td></tr>';
}
