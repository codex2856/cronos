'use strict';

// ---------- Configuración ----------
const STORAGE_KEY = 'cronos.v1';
const DOUBLE_TAP_MS = 60 * 1000;          // ignora un segundo toque en menos de 1 minuto
const FORGOTTEN_MS = 16 * 60 * 60 * 1000; // una entrada abierta >16 h se considera "salida olvidada"

// ---------- Datos ----------
// sesión: { id, start: ISO, end: ISO|null, note?: string, forgotten?: true }
function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (data && Array.isArray(data.sessions)) return data;
  } catch (_) { /* datos corruptos o sin acceso */ }
  return { sessions: [] };
}
function save() {
  state.sessions.sort((a, b) => a.start.localeCompare(b.start));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
const state = load();

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const openSession = () => state.sessions.find(s => !s.end && !s.forgotten);
const lastEventTime = () => state.sessions.reduce(
  (max, s) => Math.max(max, Date.parse(s.end || s.start)), 0);

// ---------- Nombre ----------
// Cada teléfono guarda sus propias horas; el nombre solo sirve para saludar.
const who = () => (state.name ? `, ${state.name}` : '');

function askName() {
  return new Promise(resolve => {
    const dlg = $('#nameDialog');
    $('#nameInput').value = state.name || '';
    dlg.showModal();
    dlg.addEventListener('close', () => {
      const name = $('#nameInput').value.trim();
      if (name) {
        state.name = name;
        save();
      }
      renderName();
      resolve();
    }, { once: true });
  });
}

function renderName() {
  $('#greeting').textContent = state.name ? `Hola, ${state.name}` : '';
}

// ---------- Fichar ----------
function punch(source) {
  const now = new Date();
  if (source === 'tap' && now - lastEventTime() < DOUBLE_TAP_MS) {
    flash('Ya se registró hace un momento. Toque ignorado.', 'warn');
    return;
  }
  const open = openSession();
  if (open && now - Date.parse(open.start) > FORGOTTEN_MS) {
    // No cerramos una jornada de ayer con la hora de hoy: queda marcada para corregir.
    open.forgotten = true;
    state.sessions.push({ id: uid(), start: now.toISOString(), end: null });
    save();
    flash(`¡Hola${who()}! Entrada registrada a las ${fmtTime(now)}. Ojo: la jornada del ${fmtDay(new Date(open.start))} quedó sin salida, corrígela en el historial.`, 'warn');
  } else if (open) {
    open.end = now.toISOString();
    save();
    flash(`¡Hasta luego${who()}! Salida registrada a las ${fmtTime(now)} · trabajaste ${fmtDur(now - Date.parse(open.start))}`, 'out');
  } else {
    state.sessions.push({ id: uid(), start: now.toISOString(), end: null });
    save();
    flash(`¡Hola${who()}, bienvenido al trabajo! Entrada registrada a las ${fmtTime(now)}.`, 'in');
  }
  render();
}

// ---------- Formato ----------
const pad = n => String(n).padStart(2, '0');
const fmtTime = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const fmtDay = d => d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
function fmtDur(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  return `${Math.floor(m / 60)}h ${pad(m % 60)}m`;
}
function fmtClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
}
const toLocalInput = iso => {
  const d = new Date(iso);
  return `${dayKey(d)}T${fmtTime(d)}`;
};
const fromLocalInput = v => (v ? new Date(v).toISOString() : null);

function duration(s, now = Date.now()) {
  if (s.forgotten && !s.end) return 0;
  return (s.end ? Date.parse(s.end) : now) - Date.parse(s.start);
}

// ---------- Interfaz ----------
const $ = sel => document.querySelector(sel);
let flashTimer;
function flash(msg, kind = '') {
  const el = $('#flash');
  el.textContent = msg;
  el.className = `flash ${kind}`;
  el.hidden = false;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { el.hidden = true; }, 8000);
}

function startOfWeek(d) {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  r.setDate(r.getDate() - ((r.getDay() + 6) % 7)); // lunes
  return r;
}

function renderStatus() {
  const open = openSession();
  const card = $('.status');
  card.classList.toggle('working', !!open);
  if (open) {
    const start = new Date(open.start);
    const elapsed = Date.now() - start;
    $('#statusLabel').textContent = elapsed > FORGOTTEN_MS ? '¿Olvidaste registrar la salida?' : 'Trabajando';
    $('#statusTimer').textContent = fmtClock(elapsed);
    $('#statusSince').textContent = `Entrada: ${fmtDay(start)}, ${fmtTime(start)}`;
    $('#toggleBtn').textContent = 'Registrar salida';
  } else {
    $('#statusLabel').textContent = 'Fuera del trabajo';
    $('#statusTimer').textContent = '--:--:--';
    $('#statusSince').textContent = '';
    $('#toggleBtn').textContent = 'Registrar entrada';
  }
}

function renderTotals() {
  const now = new Date();
  const today = dayKey(now);
  const week = startOfWeek(now).getTime();
  const month = monthKey(now);
  let t = 0, w = 0, m = 0;
  for (const s of state.sessions) {
    const d = new Date(s.start);
    const dur = duration(s);
    if (dayKey(d) === today) t += dur;
    if (d.getTime() >= week) w += dur;
    if (monthKey(d) === month) m += dur;
  }
  $('#totToday').textContent = fmtDur(t);
  $('#totWeek').textContent = fmtDur(w);
  $('#totMonth').textContent = fmtDur(m);
}

function renderMonthSelect() {
  const sel = $('#monthSelect');
  const current = sel.value || monthKey(new Date());
  const months = new Set([monthKey(new Date()), ...state.sessions.map(s => monthKey(new Date(s.start)))]);
  sel.innerHTML = '';
  [...months].sort().reverse().forEach(k => {
    const [y, mo] = k.split('-').map(Number);
    const opt = document.createElement('option');
    opt.value = k;
    opt.textContent = new Date(y, mo - 1, 1).toLocaleDateString('es', { month: 'long', year: 'numeric' });
    sel.append(opt);
  });
  sel.value = months.has(current) ? current : monthKey(new Date());
}

function renderHistory() {
  const month = $('#monthSelect').value;
  const box = $('#history');
  box.innerHTML = '';
  const days = new Map();
  for (const s of state.sessions) {
    const d = new Date(s.start);
    if (monthKey(d) !== month) continue;
    const k = dayKey(d);
    if (!days.has(k)) days.set(k, []);
    days.get(k).push(s);
  }
  if (!days.size) {
    box.innerHTML = '<p class="empty">No hay jornadas registradas este mes.</p>';
    return;
  }
  let monthTotal = 0;
  for (const [, list] of [...days].sort((a, b) => b[0].localeCompare(a[0]))) {
    const total = list.reduce((acc, s) => acc + duration(s), 0);
    monthTotal += total;
    const day = document.createElement('div');
    day.className = 'day';
    const head = document.createElement('div');
    head.className = 'day-head';
    head.innerHTML = `<span></span><span class="sum">${fmtDur(total)}</span>`;
    head.firstChild.textContent = fmtDay(new Date(list[0].start));
    day.append(head);
    for (const s of list) {
      const btn = document.createElement('button');
      btn.className = 'entry';
      const start = fmtTime(new Date(s.start));
      let end;
      if (s.end) end = fmtTime(new Date(s.end));
      else if (s.forgotten) end = '<span class="warn">sin salida · toca para corregir</span>';
      else end = 'en curso';
      btn.innerHTML = `<span>${start} → ${end}</span><span>${s.end ? fmtDur(duration(s)) : ''}</span>`;
      if (s.note) {
        const note = document.createElement('span');
        note.className = 'note';
        note.textContent = ` · ${s.note}`;
        btn.firstChild.append(note);
      }
      btn.addEventListener('click', () => openEditor(s));
      day.append(btn);
    }
    box.append(day);
  }
  const foot = document.createElement('p');
  foot.className = 'hint';
  foot.textContent = `Total del mes: ${fmtDur(monthTotal)} en ${days.size} día${days.size === 1 ? '' : 's'}.`;
  box.append(foot);
}

function render() {
  renderStatus();
  renderTotals();
  renderMonthSelect();
  renderHistory();
}

// ---------- Editor ----------
let editing = null;
function openEditor(session) {
  editing = session;
  $('#editorTitle').textContent = session ? 'Editar jornada' : 'Añadir jornada';
  $('#edDelete').hidden = !session;
  const now = new Date();
  $('#edStart').value = session ? toLocalInput(session.start) : `${dayKey(now)}T08:00`;
  $('#edEnd').value = session && session.end ? toLocalInput(session.end) : (session ? '' : `${dayKey(now)}T17:00`);
  $('#edNote').value = session?.note || '';
  $('#edError').hidden = true;
  $('#editor').showModal();
}

$('#editorForm').addEventListener('submit', e => {
  if (e.submitter?.value !== 'save') return;
  const start = fromLocalInput($('#edStart').value);
  const end = fromLocalInput($('#edEnd').value);
  const err = $('#edError');
  if (end && end <= start) {
    e.preventDefault();
    err.textContent = 'La salida debe ser posterior a la entrada.';
    err.hidden = false;
    return;
  }
  if (!end && openSession() && openSession() !== editing) {
    e.preventDefault();
    err.textContent = 'Ya hay una jornada en curso; indica la hora de salida.';
    err.hidden = false;
    return;
  }
  const s = editing || { id: uid() };
  s.start = start;
  s.end = end;
  s.note = $('#edNote').value.trim() || undefined;
  delete s.forgotten;
  if (!editing) state.sessions.push(s);
  save();
  render();
});

$('#edDelete').addEventListener('click', () => {
  if (!editing || !confirm('¿Borrar esta jornada?')) return;
  state.sessions = state.sessions.filter(s => s !== editing);
  save();
  $('#editor').close();
  render();
});

// ---------- Exportar / copia de seguridad ----------
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportCsv() {
  const month = $('#monthSelect').value;
  const rows = [['Fecha', 'Entrada', 'Salida', 'Horas', 'Horas (decimal)', 'Nota']];
  for (const s of state.sessions) {
    const d = new Date(s.start);
    if (monthKey(d) !== month) continue;
    const dur = s.end ? duration(s) : 0;
    rows.push([
      dayKey(d),
      fmtTime(d),
      s.end ? fmtTime(new Date(s.end)) : '',
      s.end ? fmtDur(dur) : '',
      s.end ? (dur / 3600000).toFixed(2).replace('.', ',') : '',
      (s.note || '').replace(/[;\n]/g, ' '),
    ]);
  }
  // Separador ";" y coma decimal para que Excel en español lo abra bien.
  download(`horas-${month}.csv`, '﻿' + rows.map(r => r.join(';')).join('\r\n'), 'text/csv;charset=utf-8');
}

function backup() {
  download(`cronos-copia-${dayKey(new Date())}.json`, JSON.stringify(state, null, 2), 'application/json');
}

$('#restoreInput').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.sessions)) throw new Error('formato');
    if (!confirm(`Se reemplazarán tus datos por ${data.sessions.length} jornadas de la copia. ¿Continuar?`)) return;
    state.sessions = data.sessions.filter(s => s && typeof s.start === 'string');
    if (typeof data.name === 'string' && data.name.trim()) state.name = data.name.trim();
    renderName();
    save();
    render();
    flash('Copia restaurada.');
  } catch (_) {
    flash('El archivo no es una copia válida de Cronos.', 'warn');
  }
});

function resetAll() {
  if (!state.sessions.length) {
    flash('No hay nada que borrar.');
    return;
  }
  if (!confirm(`¿Borrar las ${state.sessions.length} jornadas registradas en este teléfono? No se puede deshacer.`)) return;
  state.sessions = [];
  save();
  render();
  flash('Historial borrado. El contador está a cero.');
}

// ---------- NFC ----------
function tapUrl() {
  return `${location.origin}${location.pathname}?tap=1`;
}

$('#writeNfc').addEventListener('click', async () => {
  const msg = $('#nfcMsg');
  if (!('NDEFReader' in window)) {
    msg.textContent = 'Este navegador no puede grabar NFC. Usa la app NFC Tools con el enlace de arriba.';
    return;
  }
  try {
    msg.textContent = 'Acerca el sticker a la parte trasera del teléfono…';
    await new NDEFReader().write({ records: [{ recordType: 'url', data: tapUrl() }] });
    msg.textContent = '✅ Sticker grabado. Ya puedes pegarlo en tu mesa.';
  } catch (err) {
    msg.textContent = `No se pudo grabar: ${err.message}`;
  }
});

$('#copyUrl').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(tapUrl());
    $('#nfcMsg').textContent = 'Enlace copiado.';
  } catch (_) {
    $('#nfcMsg').textContent = 'No se pudo copiar; selecciónalo a mano.';
  }
});

// ---------- Eventos ----------
$('#toggleBtn').addEventListener('click', () => punch('button'));
$('#monthSelect').addEventListener('change', renderHistory);
$('#menuBtn').addEventListener('click', () => $('#menu').showModal());
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));

$('#menu').addEventListener('click', e => {
  const action = e.target.closest('button')?.dataset.action;
  if (!action) return;
  $('#menu').close();
  if (action === 'add') openEditor(null);
  if (action === 'csv') exportCsv();
  if (action === 'backup') backup();
  if (action === 'restore') $('#restoreInput').click();
  if (action === 'name') askName();
  if (action === 'reset') resetAll();
  if (action === 'nfc') {
    $('#tapUrl').textContent = tapUrl();
    $('#nfcMsg').textContent = '';
    $('#nfcDialog').showModal();
  }
});

// Si la app ya estaba abierta y se vuelve a ella, refrescamos.
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
setInterval(() => { if (!document.hidden) { renderStatus(); renderTotals(); } }, 1000);

// ---------- Inicio ----------
render();
renderName();

// El sticker NFC abre la app con ?tap=1 → fichamos y limpiamos la URL
// para que recargar la página no vuelva a fichar.
// La primera vez pedimos el nombre antes de fichar, para poder saludar.
(async () => {
  const tapped = new URLSearchParams(location.search).has('tap');
  if (tapped) history.replaceState(null, '', location.pathname);
  if (!state.name) await askName();
  if (tapped) punch('tap');
})();

if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
