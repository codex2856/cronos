'use strict';

// ---------- Configuración ----------
const STORAGE_KEY = 'cronos.v1';
const DOUBLE_TAP_MS = 60 * 1000;          // ignora un segundo toque en menos de 1 minuto
const FORGOTTEN_MS = 16 * 60 * 60 * 1000; // una entrada abierta >16 h se considera "salida olvidada"
const TASKS = ['Kast', 'Long car', 'PostNL', 'Exp. container', 'Exp. pallet', 'Inbound floor',
  'Kantoor', 'Inbound', 'Outbound', 'Refill', 'Small car'];
const NO_TASK = 'No task'; // tiempo fichado antes de elegir tarea

// ---------- Datos ----------
// sesión: { id, start: ISO, end: ISO|null, note?: string, forgotten?: true,
//           tasks?: [{ task, at: ISO }] }  ← cada cambio de tarea dentro de la jornada
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
  $('#greeting').textContent = state.name ? `Hi, ${state.name}` : '';
}

// ---------- Fichar ----------
function punch(source) {
  const now = new Date();
  if (source === 'tap' && now - lastEventTime() < DOUBLE_TAP_MS) {
    flash('Already recorded a moment ago. Tap ignored.', 'warn');
    return;
  }
  const open = openSession();
  if (open && now - Date.parse(open.start) > FORGOTTEN_MS) {
    // No cerramos una jornada de ayer con la hora de hoy: queda marcada para corregir.
    open.forgotten = true;
    state.sessions.push({ id: uid(), start: now.toISOString(), end: null });
    save();
    flash(`Hi${who()}! Clock-in recorded at ${fmtTime(now)}. Heads up: your shift on ${fmtDay(new Date(open.start))} has no clock-out, fix it in the history.`, 'warn');
  } else if (open) {
    open.end = now.toISOString();
    save();
    flash(`See you later${who()}! Clock-out recorded at ${fmtTime(now)} · you worked ${fmtDur(now - Date.parse(open.start))}`, 'out');
  } else {
    state.sessions.push({ id: uid(), start: now.toISOString(), end: null });
    save();
    flash(`Hi${who()}, welcome to work! Clock-in recorded at ${fmtTime(now)}.`, 'in');
  }
  render();
}

// ---------- Tareas ----------
function currentTask(s) {
  const t = s?.tasks;
  return t && t.length ? t[t.length - 1].task : null;
}

function chooseTask(task) {
  let open = openSession();
  if (!open || Date.now() - Date.parse(open.start) > FORGOTTEN_MS) {
    punch('button'); // fichamos la entrada y empezamos directamente con esta tarea
    open = openSession();
    if (!open) return;
    open.tasks = [{ task, at: open.start }];
    save();
    flash(`Hi${who()}, welcome to work! Clocked in at ${fmtTime(new Date(open.start))} on ${task}.`, 'in');
    render();
    return;
  }
  if (currentTask(open) === task) return;
  const now = new Date();
  (open.tasks ||= []).push({ task, at: now.toISOString() });
  save();
  flash(`Now working on ${task} (since ${fmtTime(now)}).`);
  render();
}

// Reparte la duración de una jornada entre sus tareas → Map(tarea → ms).
// Las horas se recortan a la jornada, así que editar entrada/salida no las descuadra.
function taskBreakdown(s, now = Date.now()) {
  const out = new Map();
  if (s.forgotten && !s.end) return out;
  const start = Date.parse(s.start);
  const end = s.end ? Date.parse(s.end) : now;
  const add = (task, ms) => { if (ms > 0) out.set(task, (out.get(task) || 0) + ms); };
  const segs = (s.tasks || [])
    .map(t => ({ task: t.task, at: Math.min(Math.max(Date.parse(t.at), start), end) }))
    .sort((a, b) => a.at - b.at);
  let cursor = start, current = NO_TASK;
  for (const seg of segs) {
    add(current, seg.at - cursor);
    cursor = seg.at;
    current = seg.task;
  }
  add(current, end - cursor);
  return out;
}

// ---------- Formato ----------
const pad = n => String(n).padStart(2, '0');
const fmtTime = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const fmtDay = d => d.toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'long' });
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
    $('#statusLabel').textContent = elapsed > FORGOTTEN_MS ? 'Forgot to clock out?' : 'Working';
    $('#statusTimer').textContent = fmtClock(elapsed);
    $('#statusSince').textContent = `Clocked in: ${fmtDay(start)}, ${fmtTime(start)}`;
    $('#toggleBtn').textContent = 'Clock out';
    const task = currentTask(open);
    $('#currentTask').textContent = task ? `Current task: ${task}` : 'Pick the task you are working on 👇';
  } else {
    $('#currentTask').textContent = 'Pick a task to clock in on it, or use the button.';
    $('#statusLabel').textContent = 'Off the clock';
    $('#statusTimer').textContent = '--:--:--';
    $('#statusSince').textContent = '';
    $('#toggleBtn').textContent = 'Clock in';
  }
}

function renderTaskButtons() {
  const active = currentTask(openSession());
  document.querySelectorAll('#taskGrid button').forEach(b => {
    const on = b.dataset.task === active;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on);
  });
}

let taskPeriod = 'today';
function renderTaskTotals() {
  const now = new Date();
  const inPeriod = {
    today: d => dayKey(d) === dayKey(now),
    week: d => d >= startOfWeek(now),
    month: d => monthKey(d) === monthKey(now),
  }[taskPeriod];
  const totals = new Map();
  for (const s of state.sessions) {
    if (!inPeriod(new Date(s.start))) continue;
    for (const [task, ms] of taskBreakdown(s)) totals.set(task, (totals.get(task) || 0) + ms);
  }
  const rows = [...totals].filter(([t]) => t !== NO_TASK).sort((a, b) => b[1] - a[1]);
  if (totals.has(NO_TASK)) rows.push([NO_TASK, totals.get(NO_TASK)]);
  const box = $('#taskTotals');
  if (!rows.length) {
    box.innerHTML = '<p class="empty">No time recorded in this period.</p>';
    return;
  }
  const max = Math.max(...rows.map(r => r[1]));
  box.innerHTML = '';
  for (const [task, ms] of rows) {
    const row = document.createElement('div');
    row.className = 'task-row' + (task === NO_TASK ? ' muted' : '');
    row.innerHTML = '<span class="task-name"></span><span class="task-bar"><span></span></span><span class="task-val"></span>';
    row.children[0].textContent = task;
    row.children[1].firstChild.style.width = `${Math.max(2, (ms / max) * 100)}%`;
    row.children[2].textContent = fmtDur(ms);
    row.title = `${task}: ${fmtDur(ms)}`;
    box.append(row);
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
    opt.textContent = new Date(y, mo - 1, 1).toLocaleDateString('en', { month: 'long', year: 'numeric' });
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
    box.innerHTML = '<p class="empty">No shifts recorded this month.</p>';
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
      else if (s.forgotten) end = '<span class="warn">no clock-out · tap to fix</span>';
      else end = 'in progress';
      btn.innerHTML = `<span>${start} → ${end}</span><span>${s.end ? fmtDur(duration(s)) : ''}</span>`;
      if (s.note) {
        const note = document.createElement('span');
        note.className = 'note';
        note.textContent = ` · ${s.note}`;
        btn.firstChild.append(note);
      }
      const parts = [...taskBreakdown(s)].map(([t, ms]) => `${t} ${fmtDur(ms)}`);
      if (parts.length && !(parts.length === 1 && parts[0].startsWith(NO_TASK))) {
        const line = document.createElement('span');
        line.className = 'entry-tasks';
        line.textContent = parts.join(' · ');
        btn.append(line);
      }
      btn.addEventListener('click', () => openEditor(s));
      day.append(btn);
    }
    box.append(day);
  }
  const foot = document.createElement('p');
  foot.className = 'hint';
  foot.textContent = `Month total: ${fmtDur(monthTotal)} over ${days.size} day${days.size === 1 ? '' : 's'}.`;
  box.append(foot);
}

function render() {
  renderStatus();
  renderTaskButtons();
  renderTotals();
  renderTaskTotals();
  renderMonthSelect();
  renderHistory();
}

// ---------- Editor ----------
let editing = null;
function openEditor(session) {
  editing = session;
  $('#editorTitle').textContent = session ? 'Edit shift' : 'Add shift';
  $('#edDelete').hidden = !session;
  const now = new Date();
  $('#edStart').value = session ? toLocalInput(session.start) : `${dayKey(now)}T08:00`;
  $('#edEnd').value = session && session.end ? toLocalInput(session.end) : (session ? '' : `${dayKey(now)}T17:00`);
  $('#edNote').value = session?.note || '';
  $('#edTasks').innerHTML = '';
  (session?.tasks || []).forEach(t => addTaskRow(toLocalInput(t.at), t.task));
  $('#edError').hidden = true;
  $('#editor').showModal();
}

function addTaskRow(at, task) {
  const row = document.createElement('div');
  row.className = 'ed-task';
  row.innerHTML = '<input type="datetime-local" required aria-label="From"><select aria-label="Task"></select><button type="button" class="ghost" aria-label="Remove">✕</button>';
  const [input, select, remove] = row.children;
  input.value = at;
  TASKS.forEach(t => select.append(new Option(t, t)));
  select.value = task;
  remove.addEventListener('click', () => row.remove());
  $('#edTasks').append(row);
}

$('#edAddTask').addEventListener('click', () => {
  const rows = $('#edTasks').children;
  const last = rows.length ? rows[rows.length - 1].children[0].value : $('#edStart').value;
  addTaskRow(last, TASKS[0]);
});

$('#editorForm').addEventListener('submit', e => {
  if (e.submitter?.value !== 'save') return;
  const start = fromLocalInput($('#edStart').value);
  const end = fromLocalInput($('#edEnd').value);
  const err = $('#edError');
  if (end && end <= start) {
    e.preventDefault();
    err.textContent = 'Clock-out must be after clock-in.';
    err.hidden = false;
    return;
  }
  if (!end && openSession() && openSession() !== editing) {
    e.preventDefault();
    err.textContent = 'A shift is already in progress; enter a clock-out time.';
    err.hidden = false;
    return;
  }
  const tasks = [...$('#edTasks').children].map(r => ({
    at: fromLocalInput(r.children[0].value),
    task: r.children[1].value,
  })).sort((a, b) => a.at.localeCompare(b.at));
  if (tasks.some(t => t.at < start || (end && t.at > end))) {
    e.preventDefault();
    err.textContent = 'Task times must be between clock-in and clock-out.';
    err.hidden = false;
    return;
  }
  const s = editing || { id: uid() };
  s.start = start;
  s.end = end;
  s.tasks = tasks.length ? tasks : undefined;
  s.note = $('#edNote').value.trim() || undefined;
  delete s.forgotten;
  if (!editing) state.sessions.push(s);
  save();
  render();
});

$('#edDelete').addEventListener('click', () => {
  if (!editing || !confirm('Delete this shift?')) return;
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
  const cols = [...TASKS, NO_TASK];
  const rows = [['Date', 'Clock in', 'Clock out', 'Hours', 'Hours (decimal)', ...cols.map(t => `${t} (h)`), 'Note']];
  const hours = ms => (ms / 3600000).toFixed(2);
  for (const s of state.sessions) {
    const d = new Date(s.start);
    if (monthKey(d) !== month || !s.end) continue;
    const dur = duration(s);
    const byTask = taskBreakdown(s);
    rows.push([
      dayKey(d),
      fmtTime(d),
      fmtTime(new Date(s.end)),
      fmtDur(dur),
      hours(dur),
      ...cols.map(t => (byTask.has(t) ? hours(byTask.get(t)) : '')),
      (s.note || '').replace(/[,;\n"]/g, ' '),
    ]);
  }
  download(`hours-${month}.csv`, '\ufeff' + rows.map(r => r.join(',')).join('\r\n'), 'text/csv;charset=utf-8');
}

function backup() {
  download(`cronos-backup-${dayKey(new Date())}.json`, JSON.stringify(state, null, 2), 'application/json');
}

$('#restoreInput').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.sessions)) throw new Error('formato');
    if (!confirm(`Your data will be replaced with ${data.sessions.length} shifts from the backup. Continue?`)) return;
    state.sessions = data.sessions.filter(s => s && typeof s.start === 'string');
    if (typeof data.name === 'string' && data.name.trim()) state.name = data.name.trim();
    renderName();
    save();
    render();
    flash('Backup restored.');
  } catch (_) {
    flash('This file is not a valid Cronos backup.', 'warn');
  }
});

function resetAll() {
  if (!state.sessions.length) {
    flash('Nothing to delete.');
    return;
  }
  if (!confirm(`Delete all ${state.sessions.length} shifts recorded on this phone? This can't be undone.`)) return;
  state.sessions = [];
  save();
  render();
  flash('History deleted. The counter is back to zero.');
}

// ---------- NFC ----------
function tapUrl() {
  return `${location.origin}${location.pathname}?tap=1`;
}

$('#writeNfc').addEventListener('click', async () => {
  const msg = $('#nfcMsg');
  if (!('NDEFReader' in window)) {
    msg.textContent = 'This browser can\'t write NFC. Use the NFC Tools app with the link above.';
    return;
  }
  try {
    msg.textContent = 'Hold the sticker against the back of your phone…';
    await new NDEFReader().write({ records: [{ recordType: 'url', data: tapUrl() }] });
    msg.textContent = '✅ Sticker written. You can stick it on your desk now.';
  } catch (err) {
    msg.textContent = `Couldn\'t write: ${err.message}`;
  }
});

$('#copyUrl').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(tapUrl());
    $('#nfcMsg').textContent = 'Link copied.';
  } catch (_) {
    $('#nfcMsg').textContent = 'Couldn\'t copy; select it manually.';
  }
});

// ---------- Eventos ----------
$('#toggleBtn').addEventListener('click', () => punch('button'));
TASKS.forEach(task => {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = task;
  b.dataset.task = task;
  b.addEventListener('click', () => chooseTask(task));
  $('#taskGrid').append(b);
});
document.querySelectorAll('#taskPeriod button').forEach(b => b.addEventListener('click', () => {
  taskPeriod = b.dataset.period;
  document.querySelectorAll('#taskPeriod button').forEach(x => x.setAttribute('aria-pressed', x === b));
  renderTaskTotals();
}));
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
setInterval(() => { if (!document.hidden) { renderStatus(); renderTotals(); renderTaskTotals(); } }, 1000);

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

// App instalada (Android): con "focus-existing" el sticker reutiliza la ventana
// abierta en vez de crear otra, y el enlace llega aquí. El primer aviso es la
// propia carga de la página, que ya se gestionó arriba.
if ('launchQueue' in window) {
  let first = true;
  window.launchQueue.setConsumer(params => {
    if (first) { first = false; return; }
    if (params.targetURL && new URL(params.targetURL).searchParams.has('tap')) punch('tap');
  });
}

if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
