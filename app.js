// =========================================================
// TRILHA — Lógica da aplicação (SPA com Supabase)
// Organizado em: cliente, estado, helpers, auth, dados,
// renderização de telas e inicialização.
// =========================================================

/* ---------------------------------------------------------
   Cliente Supabase
--------------------------------------------------------- */
let supabaseClient;
try {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (e) {
  document.getElementById('app').innerHTML =
    `<div style="padding:40px;color:#D9685C;font-family:sans-serif">
       Não foi possível conectar ao Supabase. Verifique se o arquivo
       <code>config.js</code> existe e contém SUPABASE_URL e SUPABASE_ANON_KEY válidos.
     </div>`;
  throw e;
}

/* ---------------------------------------------------------
   Estado global em memória
--------------------------------------------------------- */
const state = {
  session: null,
  user: null,
  view: 'dashboard',       // dashboard | tasks | settings
  tasks: [],
  dailyTasks: [],
  dailyLogs: [],            // logs dos últimos 35 dias (para streaks)
  settings: { display_name: '', theme: 'dark', language: 'pt' },
  taskFilters: { status: 'all', priority: 'all', search: '' },
  authMode: 'login',        // login | signup
  authError: '',
  modal: null,              // { type: 'task'|'daily', data }
};

const $app = document.getElementById('app');
const todayISO = () => new Date().toISOString().slice(0, 10);

/* ---------------------------------------------------------
   Helpers de data e formatação
--------------------------------------------------------- */
function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}
function daysUntil(d) {
  if (!d) return null;
  const diff = (new Date(d + 'T00:00:00') - new Date(todayISO() + 'T00:00:00'));
  return Math.round(diff / 86400000);
}
function isOverdue(task) {
  return task.end_date && !task.is_completed && daysUntil(task.end_date) < 0;
}
function escapeHtml(str) {
  return (str || '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

/* ---------------------------------------------------------
   Render raiz — decide qual tela mostrar
--------------------------------------------------------- */
function render() {
  if (!state.session) {
    renderAuth();
    return;
  }
  renderShell();
}

/* ===========================================================
   TELA: AUTENTICAÇÃO
=========================================================== */
function renderAuth() {
  const isLogin = state.authMode === 'login';
  $app.innerHTML = `
    <div class="auth-wrap">
      <div class="auth-card">
        <h1>🥾 Trilha</h1>
        <div class="sub">${isLogin ? 'Entre para continuar sua jornada.' : 'Crie sua conta e comece a trilhar.'}</div>
        ${state.authError ? `<div class="error-msg">${escapeHtml(state.authError)}</div>` : ''}
        <form id="auth-form">
          <div class="field">
            <label for="auth-email">E-mail</label>
            <input id="auth-email" type="email" required placeholder="voce@email.com" />
          </div>
          <div class="field">
            <label for="auth-pass">Senha</label>
            <input id="auth-pass" type="password" required minlength="6" placeholder="••••••••" />
          </div>
          <button class="btn" type="submit" style="width:100%">${isLogin ? 'Entrar' : 'Criar conta'}</button>
        </form>
        <div class="auth-switch">
          ${isLogin ? 'Ainda não tem conta?' : 'Já tem conta?'}
          <a href="#" id="auth-toggle">${isLogin ? 'Cadastre-se' : 'Entrar'}</a>
        </div>
      </div>
    </div>
  `;
  document.getElementById('auth-form').addEventListener('submit', handleAuthSubmit);
  document.getElementById('auth-toggle').addEventListener('click', (e) => {
    e.preventDefault();
    state.authMode = isLogin ? 'signup' : 'login';
    state.authError = '';
    render();
  });
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-pass').value;
  state.authError = '';
  try {
    if (state.authMode === 'login') {
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } else {
      const { error } = await supabaseClient.auth.signUp({ email, password });
      if (error) throw error;
    }
    await bootstrapSession();
  } catch (err) {
    state.authError = translateAuthError(err.message);
    render();
  }
}

function translateAuthError(msg) {
  if (/invalid login credentials/i.test(msg)) return 'E-mail ou senha inválidos.';
  if (/already registered/i.test(msg)) return 'Este e-mail já está cadastrado.';
  if (/password/i.test(msg) && /6/i.test(msg)) return 'A senha precisa ter ao menos 6 caracteres.';
  return msg;
}

async function handleLogout() {
  await supabaseClient.auth.signOut();
  state.session = null;
  state.user = null;
  render();
}

/* ===========================================================
   SHELL — cabeçalho + navegação + conteúdo da view atual
=========================================================== */
function renderShell() {
  $app.innerHTML = `
    <header class="topbar">
      <div class="brand">🥾 Trilha <small>gestão de tarefas</small></div>
      <nav class="tabs">
        <button data-view="dashboard" class="${state.view === 'dashboard' ? 'active' : ''}">Painel</button>
        <button data-view="tasks" class="${state.view === 'tasks' ? 'active' : ''}">Tarefas</button>
        <button data-view="settings" class="${state.view === 'settings' ? 'active' : ''}">Configurações</button>
      </nav>
      <div class="user-pill">
        <span class="mono" style="font-size:0.8rem;color:var(--paper-dim)">${escapeHtml(state.user?.email || '')}</span>
        <button class="btn-ghost" id="logout-btn">Saír</button>
      </div>
    </header>
    <main id="main"></main>
  `;
  document.querySelectorAll('nav.tabs button').forEach(b =>
    b.addEventListener('click', () => { state.view = b.dataset.view; render(); })
  );
  document.getElementById('logout-btn').addEventListener('click', handleLogout);

  const main = document.getElementById('main');
  if (state.view === 'dashboard') renderDashboard(main);
  else if (state.view === 'tasks') renderTasksView(main);
  else if (state.view === 'settings') renderSettingsView(main);

  if (state.modal) renderModal();
}

/* ===========================================================
   VIEW: PAINEL (DASHBOARD)
=========================================================== */
function streakFor(dailyTaskId) {
  let streak = 0;
  let cursor = new Date(todayISO() + 'T00:00:00');
  const logsById = state.dailyLogs.filter(l => l.daily_task_id === dailyTaskId && l.completed);
  const logSet = new Set(logsById.map(l => l.log_date));
  // conta dias consecutivos terminando hoje (ou ontem, se hoje ainda não marcado)
  if (!logSet.has(todayISO())) cursor.setDate(cursor.getDate() - 1);
  while (logSet.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function renderDashboard(main) {
  const today = todayISO();
  const activeDaily = state.dailyTasks.filter(d => d.is_active);
  const logsToday = new Map(
    state.dailyLogs.filter(l => l.log_date === today).map(l => [l.daily_task_id, l.completed])
  );

  const upcoming = state.tasks
    .filter(t => !t.is_completed && t.end_date)
    .sort((a, b) => new Date(a.end_date) - new Date(b.end_date))
    .slice(0, 5);

  const totalTasks = state.tasks.length;
  const completedTasks = state.tasks.filter(t => t.is_completed).length;

  // últimos 7 dias: conclusões diárias
  const days = [...Array(7)].map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });
  const dayCounts = days.map(d => state.dailyLogs.filter(l => l.log_date === d && l.completed).length);
  const maxCount = Math.max(1, ...dayCounts);

  main.innerHTML = `
    <div class="greeting">
      <h1>${greetingText()}</h1>
      <div class="date">${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
    </div>

    <div class="stats-row">
      <div class="stat-box"><div class="num">${activeDaily.filter(d => logsToday.get(d.id)).length}/${activeDaily.length}</div><div class="label">Hábitos hoje</div></div>
      <div class="stat-box"><div class="num">${completedTasks}/${totalTasks}</div><div class="label">Tarefas concluídas</div></div>
      <div class="stat-box"><div class="num">${upcoming.filter(t => daysUntil(t.end_date) <= 7 && daysUntil(t.end_date) >= 0).length}</div><div class="label">Prazos em 7 dias</div></div>
    </div>

    <div class="section-title">Trilha de hoje</div>
    ${activeDaily.length === 0
      ? `<div class="trail-empty">Nenhum hábito diário cadastrado ainda. Crie um para começar sua trilha.</div>`
      : `<div class="trail">${activeDaily.map(d => {
          const done = !!logsToday.get(d.id);
          const streak = streakFor(d.id);
          return `
            <div class="marker ${done ? 'done' : ''}">
              <button class="marker-dot" data-daily-id="${d.id}" title="${done ? 'Desmarcar' : 'Marcar como feito'}">${done ? '✓' : '○'}</button>
              <div class="marker-label">${escapeHtml(d.title)}</div>
              ${streak > 0 ? `<div class="marker-streak">🔥 ${streak} dia${streak > 1 ? 's' : ''}</div>` : ''}
            </div>`;
        }).join('')}</div>`
    }
    <div class="btn-row" style="margin-bottom: 10px;">
      <button class="btn-secondary btn-sm" id="new-daily-btn">+ Novo hábito diário</button>
    </div>

    <div class="section-title">Próximos prazos</div>
    ${upcoming.length === 0
      ? `<div class="empty-state">Nenhuma tarefa com prazo definido. Tudo tranquilo na trilha!</div>`
      : `<div class="grid-cards">${upcoming.map(taskCardHTML).join('')}</div>`
    }
    <div class="btn-row" style="margin-top:16px;">
      <button class="btn" id="new-task-btn">+ Nova tarefa de longo prazo</button>
    </div>

    <div class="section-title">Produtividade — últimos 7 dias</div>
    <div class="bar-chart">
      ${dayCounts.map((c, i) => `<div class="bar fill" style="height:${Math.max(4, (c / maxCount) * 90)}px" title="${days[i]}: ${c}"></div>`).join('')}
    </div>
  `;

  main.querySelectorAll('.marker-dot').forEach(btn =>
    btn.addEventListener('click', () => toggleDailyLog(btn.dataset.dailyId))
  );
  main.querySelectorAll('.task-card').forEach(card =>
    card.addEventListener('click', () => openTaskModal(card.dataset.taskId))
  );
  document.getElementById('new-task-btn').addEventListener('click', () => openTaskModal(null));
  document.getElementById('new-daily-btn').addEventListener('click', () => openDailyModal());
}

function greetingText() {
  const h = new Date().getHours();
  const name = state.settings.display_name ? `, ${state.settings.display_name}` : '';
  if (h < 12) return `Bom dia${name} ☀️`;
  if (h < 18) return `Boa tarde${name} 🥾`;
  return `Boa noite${name} 🌙`;
}

function taskCardHTML(t) {
  const overdue = isOverdue(t);
  const d = daysUntil(t.end_date);
  let deadlineTag = '';
  if (t.end_date) {
    deadlineTag = overdue
      ? `<span class="tag overdue">Atrasada · ${fmtDate(t.end_date)}</span>`
      : `<span class="tag">${d === 0 ? 'Hoje' : d === 1 ? 'Amanhã' : `${d} dias`} · ${fmtDate(t.end_date)}</span>`;
  }
  return `
    <div class="task-card priority-${t.priority} ${t.is_completed ? 'completed' : ''}" data-task-id="${t.id}">
      <h3>${escapeHtml(t.title)}</h3>
      <div class="meta">
        <span class="tag">${priorityLabel(t.priority)}</span>
        ${deadlineTag}
      </div>
      <div class="progress-track"><div class="progress-fill" style="width:${t.progress_percentage}%"></div></div>
      <div class="progress-pct">${t.progress_percentage}%</div>
    </div>
  `;
}
function priorityLabel(p) { return { low: 'Baixa', medium: 'Média', high: 'Alta' }[p] || p; }

/* ===========================================================
   VIEW: LISTA DE TAREFAS
=========================================================== */
function renderTasksView(main) {
  const f = state.taskFilters;
  let list = [...state.tasks];

  if (f.status === 'completed') list = list.filter(t => t.is_completed);
  else if (f.status === 'pending') list = list.filter(t => !t.is_completed);
  else if (f.status === 'overdue') list = list.filter(isOverdue);

  if (f.priority !== 'all') list = list.filter(t => t.priority === f.priority);
  if (f.search) list = list.filter(t => t.title.toLowerCase().includes(f.search.toLowerCase()));

  list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  main.innerHTML = `
    <div class="greeting">
      <h1>Tarefas de longo prazo</h1>
      <button class="btn" id="new-task-btn">+ Nova tarefa</button>
    </div>
    <div class="filters-bar">
      <input type="text" id="search-input" placeholder="Buscar por título…" value="${escapeHtml(f.search)}" />
      <select id="status-filter">
        <option value="all" ${f.status === 'all' ? 'selected' : ''}>Todas</option>
        <option value="pending" ${f.status === 'pending' ? 'selected' : ''}>Pendentes</option>
        <option value="completed" ${f.status === 'completed' ? 'selected' : ''}>Concluídas</option>
        <option value="overdue" ${f.status === 'overdue' ? 'selected' : ''}>Atrasadas</option>
      </select>
      <select id="priority-filter">
        <option value="all" ${f.priority === 'all' ? 'selected' : ''}>Toda prioridade</option>
        <option value="high" ${f.priority === 'high' ? 'selected' : ''}>Alta</option>
        <option value="medium" ${f.priority === 'medium' ? 'selected' : ''}>Média</option>
        <option value="low" ${f.priority === 'low' ? 'selected' : ''}>Baixa</option>
      </select>
    </div>
    ${list.length === 0
      ? `<div class="empty-state">Nenhuma tarefa encontrada com esses filtros.</div>`
      : `<div class="grid-cards">${list.map(taskCardHTML).join('')}</div>`
    }
  `;

  document.getElementById('new-task-btn').addEventListener('click', () => openTaskModal(null));
  document.getElementById('search-input').addEventListener('input', (e) => { f.search = e.target.value; renderTasksView(main); });
  document.getElementById('status-filter').addEventListener('change', (e) => { f.status = e.target.value; renderTasksView(main); });
  document.getElementById('priority-filter').addEventListener('change', (e) => { f.priority = e.target.value; renderTasksView(main); });
  main.querySelectorAll('.task-card').forEach(card =>
    card.addEventListener('click', () => openTaskModal(card.dataset.taskId))
  );
}

/* ===========================================================
   VIEW: CONFIGURAÇÕES
=========================================================== */
function renderSettingsView(main) {
  const s = state.settings;
  main.innerHTML = `
    <div class="greeting"><h1>Configurações</h1></div>
    <div class="settings-card">
      <div class="field">
        <label for="set-name">Nome de exibição</label>
        <input id="set-name" type="text" value="${escapeHtml(s.display_name || '')}" placeholder="Como te chamamos?" />
      </div>
      <div class="field">
        <label>Tema</label>
        <div class="theme-options">
          <button data-theme="dark" class="${s.theme === 'dark' ? 'active' : ''}">🌙 Escuro</button>
          <button data-theme="light" class="${s.theme === 'light' ? 'active' : ''}">☀️ Claro</button>
        </div>
      </div>
      <button class="btn" id="save-settings-btn">Salvar alterações</button>
      <div style="margin-top:18px; border-top:1px solid var(--card-line); padding-top:16px;">
        <button class="btn-secondary btn-sm" id="export-btn">Exportar dados (JSON)</button>
      </div>
    </div>
  `;
  main.querySelectorAll('.theme-options button').forEach(b =>
    b.addEventListener('click', () => {
      s.theme = b.dataset.theme;
      applyTheme();
      renderSettingsView(main);
    })
  );
  document.getElementById('save-settings-btn').addEventListener('click', async () => {
    s.display_name = document.getElementById('set-name').value.trim();
    await saveSettings();
    render();
  });
  document.getElementById('export-btn').addEventListener('click', exportData);
}

function applyTheme() {
  document.body.classList.toggle('theme-light', state.settings.theme === 'light');
  localStorage.setItem('trilha_theme', state.settings.theme);
}

function exportData() {
  const blob = new Blob([JSON.stringify({
    tasks: state.tasks, dailyTasks: state.dailyTasks, dailyLogs: state.dailyLogs
  }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `trilha-export-${todayISO()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ===========================================================
   MODAL: TAREFA (criar/editar + subtarefas)
=========================================================== */
function openTaskModal(taskId) {
  const task = taskId ? state.tasks.find(t => t.id === taskId) : null;
  state.modal = { type: 'task', task: task ? { ...task } : emptyTask(), subtasks: [] };
  if (task) loadSubtasksForModal(task.id);
  render();
}
function emptyTask() {
  return { id: null, title: '', description: '', task_type: 'project', start_date: '', end_date: '', progress_percentage: 0, progress_mode: 'manual', priority: 'medium', is_completed: false };
}
async function loadSubtasksForModal(taskId) {
  const { data, error } = await supabaseClient.from('subtasks').select('*').eq('task_id', taskId).order('position');
  if (!error) { state.modal.subtasks = data || []; render(); }
}

function openDailyModal(daily) {
  state.modal = { type: 'daily', daily: daily ? { ...daily } : { id: null, title: '', description: '', is_active: true } };
  render();
}

function renderModal() {
  const m = state.modal;
  let body = '';
  if (m.type === 'task') body = taskModalHTML(m.task, m.subtasks);
  else body = dailyModalHTML(m.daily);

  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<div class="modal" style="position:relative">
      <button class="modal-close" id="modal-close-btn">✕</button>
      ${body}
    </div>`;
  document.body.appendChild(wrap);
  wrap.addEventListener('click', (e) => { if (e.target === wrap) closeModal(); });
  document.getElementById('modal-close-btn').addEventListener('click', closeModal);

  if (m.type === 'task') wireTaskModal(m);
  else wireDailyModal(m);
}

function closeModal() {
  state.modal = null;
  document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
}

function taskModalHTML(t, subtasks) {
  const computed = t.progress_mode === 'subtasks' && subtasks.length > 0
    ? Math.round((subtasks.filter(s => s.is_done).length / subtasks.length) * 100)
    : t.progress_percentage;
  return `
    <h2>${t.id ? 'Editar tarefa' : 'Nova tarefa de longo prazo'}</h2>
    <div class="field">
      <label for="t-title">Título</label>
      <input id="t-title" type="text" value="${escapeHtml(t.title)}" placeholder="Ex: Lançar novo site" />
    </div>
    <div class="field">
      <label for="t-desc">Descrição</label>
      <textarea id="t-desc" rows="2" placeholder="Detalhes (opcional)">${escapeHtml(t.description || '')}</textarea>
    </div>
    <div class="row-2">
      <div class="field">
        <label for="t-start">Data de início</label>
        <input id="t-start" type="date" value="${t.start_date || ''}" />
      </div>
      <div class="field">
        <label for="t-end">Data de fim</label>
        <input id="t-end" type="date" value="${t.end_date || ''}" />
      </div>
    </div>
    <div class="row-2">
      <div class="field">
        <label for="t-type">Tipo</label>
        <select id="t-type">
          <option value="project" ${t.task_type==='project'?'selected':''}>Projeto</option>
          <option value="goal" ${t.task_type==='goal'?'selected':''}>Meta</option>
          <option value="long_term" ${t.task_type==='long_term'?'selected':''}>Longo prazo</option>
        </select>
      </div>
      <div class="field">
        <label for="t-priority">Prioridade</label>
        <select id="t-priority">
          <option value="low" ${t.priority==='low'?'selected':''}>Baixa</option>
          <option value="medium" ${t.priority==='medium'?'selected':''}>Média</option>
          <option value="high" ${t.priority==='high'?'selected':''}>Alta</option>
        </select>
      </div>
    </div>

    <div class="toggle-row">
      <input type="checkbox" id="t-auto-progress" ${t.progress_mode === 'subtasks' ? 'checked' : ''} />
      <label for="t-auto-progress" style="margin:0;">Calcular progresso automaticamente pelas subtarefas</label>
    </div>
    <div class="field" id="manual-progress-field" style="${t.progress_mode === 'subtasks' ? 'display:none' : ''}">
      <label for="t-progress">Progresso: <span id="t-progress-val">${t.progress_percentage}</span>%</label>
      <input id="t-progress" type="range" min="0" max="100" value="${t.progress_percentage}" />
    </div>
    <div class="field" id="auto-progress-readout" style="${t.progress_mode === 'subtasks' ? '' : 'display:none'}">
      <div class="progress-track"><div class="progress-fill" style="width:${computed}%"></div></div>
      <div class="progress-pct">${computed}% (calculado pelas subtarefas)</div>
    </div>

    <div class="toggle-row">
      <input type="checkbox" id="t-completed" ${t.is_completed ? 'checked' : ''} />
      <label for="t-completed" style="margin:0;">Marcar como concluída</label>
    </div>

    ${t.id ? `
      <div class="section-title" style="margin-top:18px;">Subtarefas</div>
      <ul class="subtask-list" id="subtask-list">
        ${subtasks.map((s, i) => subtaskRowHTML(s, i)).join('')}
      </ul>
      <div class="btn-row">
        <input type="text" id="new-subtask-input" placeholder="Nova subtarefa…" style="flex:1" />
        <button class="btn-secondary btn-sm" id="add-subtask-btn">Adicionar</button>
      </div>
    ` : `<p style="color:var(--paper-dim);font-size:0.82rem;margin-top:18px;">Salve a tarefa primeiro para poder adicionar subtarefas.</p>`}

    <div class="btn-row" style="margin-top:22px;">
      <button class="btn" id="save-task-btn">Salvar</button>
      ${t.id ? `<button class="btn-danger" id="delete-task-btn">Excluir</button>` : ''}
    </div>
  `;
}

function subtaskRowHTML(s, i) {
  return `
    <li class="subtask-item ${s.is_done ? 'done' : ''}" draggable="true" data-subtask-id="${s.id}" data-index="${i}">
      <span class="subtask-drag">⠿</span>
      <input type="checkbox" data-subtask-toggle="${s.id}" ${s.is_done ? 'checked' : ''} />
      <span>${escapeHtml(s.title)}</span>
      <button class="icon-btn" data-subtask-delete="${s.id}" title="Excluir">✕</button>
    </li>
  `;
}

function wireTaskModal(m) {
  const autoCheckbox = document.getElementById('t-auto-progress');
  autoCheckbox.addEventListener('change', () => {
    document.getElementById('manual-progress-field').style.display = autoCheckbox.checked ? 'none' : '';
    document.getElementById('auto-progress-readout').style.display = autoCheckbox.checked ? '' : 'none';
  });
  const range = document.getElementById('t-progress');
  if (range) range.addEventListener('input', () => { document.getElementById('t-progress-val').textContent = range.value; });

  document.getElementById('save-task-btn').addEventListener('click', () => saveTaskFromModal(m));
  const delBtn = document.getElementById('delete-task-btn');
  if (delBtn) delBtn.addEventListener('click', () => deleteTask(m.task.id));

  const addBtn = document.getElementById('add-subtask-btn');
  if (addBtn) addBtn.addEventListener('click', () => addSubtask(m.task.id));

  document.querySelectorAll('[data-subtask-toggle]').forEach(cb =>
    cb.addEventListener('change', () => toggleSubtask(cb.dataset.subtaskToggle, cb.checked, m.task))
  );
  document.querySelectorAll('[data-subtask-delete]').forEach(btn =>
    btn.addEventListener('click', () => deleteSubtask(btn.dataset.subtaskDelete, m.task))
  );
  wireSubtaskDrag(m.task);
}

function wireSubtaskDrag(task) {
  const list = document.getElementById('subtask-list');
  if (!list) return;
  let dragIndex = null;
  list.querySelectorAll('.subtask-item').forEach(item => {
    item.addEventListener('dragstart', () => { dragIndex = Number(item.dataset.index); });
    item.addEventListener('dragover', (e) => e.preventDefault());
    item.addEventListener('drop', async (e) => {
      e.preventDefault();
      const dropIndex = Number(item.dataset.index);
      if (dragIndex === null || dragIndex === dropIndex) return;
      const arr = [...state.modal.subtasks];
      const [moved] = arr.splice(dragIndex, 1);
      arr.splice(dropIndex, 0, moved);
      state.modal.subtasks = arr;
      await Promise.all(arr.map((s, idx) =>
        supabaseClient.from('subtasks').update({ position: idx }).eq('id', s.id)
      ));
      render();
    });
  });
}

async function saveTaskFromModal(m) {
  const t = m.task;
  const autoMode = document.getElementById('t-auto-progress').checked;
  const payload = {
    title: document.getElementById('t-title').value.trim(),
    description: document.getElementById('t-desc').value.trim(),
    task_type: document.getElementById('t-type').value,
    priority: document.getElementById('t-priority').value,
    start_date: document.getElementById('t-start').value || null,
    end_date: document.getElementById('t-end').value || null,
    progress_mode: autoMode ? 'subtasks' : 'manual',
    progress_percentage: autoMode
      ? (m.subtasks.length ? Math.round((m.subtasks.filter(s => s.is_done).length / m.subtasks.length) * 100) : 0)
      : Number(document.getElementById('t-progress').value),
    is_completed: document.getElementById('t-completed').checked,
    user_id: state.user.id,
  };
  if (!payload.title) { alert('Dê um título para a tarefa.'); return; }

  if (t.id) {
    const { error } = await supabaseClient.from('tasks').update(payload).eq('id', t.id);
    if (error) { alert('Erro ao salvar: ' + error.message); return; }
  } else {
    const { data, error } = await supabaseClient.from('tasks').insert(payload).select().single();
    if (error) { alert('Erro ao criar: ' + error.message); return; }
    m.task = data;
  }
  await loadTasks();
  closeModal();
  render();
}

async function deleteTask(taskId) {
  if (!confirm('Excluir esta tarefa e todas as suas subtarefas?')) return;
  const { error } = await supabaseClient.from('tasks').delete().eq('id', taskId);
  if (error) { alert('Erro ao excluir: ' + error.message); return; }
  await loadTasks();
  closeModal();
  render();
}

async function addSubtask(taskId) {
  const input = document.getElementById('new-subtask-input');
  const title = input.value.trim();
  if (!title) return;
  const position = state.modal.subtasks.length;
  const { data, error } = await supabaseClient.from('subtasks')
    .insert({ task_id: taskId, user_id: state.user.id, title, position })
    .select().single();
  if (error) { alert('Erro: ' + error.message); return; }
  state.modal.subtasks.push(data);
  input.value = '';
  await maybeRecalcProgress(taskId);
  render();
}

async function toggleSubtask(subtaskId, checked, task) {
  await supabaseClient.from('subtasks').update({ is_done: checked }).eq('id', subtaskId);
  const s = state.modal.subtasks.find(s => s.id === subtaskId);
  if (s) s.is_done = checked;
  await maybeRecalcProgress(task.id);
  render();
}

async function deleteSubtask(subtaskId, task) {
  await supabaseClient.from('subtasks').delete().eq('id', subtaskId);
  state.modal.subtasks = state.modal.subtasks.filter(s => s.id !== subtaskId);
  await maybeRecalcProgress(task.id);
  render();
}

async function maybeRecalcProgress(taskId) {
  const task = state.tasks.find(t => t.id === taskId) || state.modal.task;
  if (task.progress_mode !== 'subtasks') return;
  const subs = state.modal.subtasks;
  const pct = subs.length ? Math.round((subs.filter(s => s.is_done).length / subs.length) * 100) : 0;
  await supabaseClient.from('tasks').update({ progress_percentage: pct }).eq('id', taskId);
  await loadTasks();
}

/* ---------- Modal de hábito diário ---------- */
function dailyModalHTML(d) {
  return `
    <h2>${d.id ? 'Editar hábito diário' : 'Novo hábito diário'}</h2>
    <div class="field">
      <label for="d-title">Título</label>
      <input id="d-title" type="text" value="${escapeHtml(d.title)}" placeholder="Ex: Ler 10 páginas" />
    </div>
    <div class="field">
      <label for="d-desc">Descrição</label>
      <textarea id="d-desc" rows="2" placeholder="Detalhes (opcional)">${escapeHtml(d.description || '')}</textarea>
    </div>
    <div class="toggle-row">
      <input type="checkbox" id="d-active" ${d.is_active ? 'checked' : ''} />
      <label for="d-active" style="margin:0;">Ativo (aparece na trilha diária)</label>
    </div>
    <div class="btn-row" style="margin-top:18px;">
      <button class="btn" id="save-daily-btn">Salvar</button>
      ${d.id ? `<button class="btn-danger" id="delete-daily-btn">Excluir</button>` : ''}
    </div>
  `;
}

function wireDailyModal(m) {
  document.getElementById('save-daily-btn').addEventListener('click', async () => {
    const payload = {
      title: document.getElementById('d-title').value.trim(),
      description: document.getElementById('d-desc').value.trim(),
      is_active: document.getElementById('d-active').checked,
      user_id: state.user.id,
    };
    if (!payload.title) { alert('Dê um título ao hábito.'); return; }
    if (m.daily.id) {
      await supabaseClient.from('daily_tasks').update(payload).eq('id', m.daily.id);
    } else {
      await supabaseClient.from('daily_tasks').insert(payload);
    }
    await loadDaily();
    closeModal();
    render();
  });
  const delBtn = document.getElementById('delete-daily-btn');
  if (delBtn) delBtn.addEventListener('click', async () => {
    if (!confirm('Excluir este hábito diário e seu histórico?')) return;
    await supabaseClient.from('daily_tasks').delete().eq('id', m.daily.id);
    await loadDaily();
    closeModal();
    render();
  });
}

async function toggleDailyLog(dailyTaskId) {
  const today = todayISO();
  const existing = state.dailyLogs.find(l => l.daily_task_id === dailyTaskId && l.log_date === today);
  if (existing) {
    const completed = !existing.completed;
    await supabaseClient.from('daily_task_logs').update({ completed, completed_at: completed ? new Date().toISOString() : null }).eq('id', existing.id);
    existing.completed = completed;
  } else {
    const { data, error } = await supabaseClient.from('daily_task_logs')
      .insert({ daily_task_id: dailyTaskId, user_id: state.user.id, log_date: today, completed: true, completed_at: new Date().toISOString() })
      .select().single();
    if (!error) state.dailyLogs.push(data);
  }
  render();
}

/* ===========================================================
   CARREGAMENTO DE DADOS
=========================================================== */
async function loadTasks() {
  const { data, error } = await supabaseClient.from('tasks').select('*').order('created_at', { ascending: false });
  if (!error) state.tasks = data || [];
}

async function loadDaily() {
  const { data, error } = await supabaseClient.from('daily_tasks').select('*').order('created_at');
  if (!error) state.dailyTasks = data || [];

  const since = new Date();
  since.setDate(since.getDate() - 35);
  const { data: logs, error: logErr } = await supabaseClient
    .from('daily_task_logs').select('*').gte('log_date', since.toISOString().slice(0, 10));
  if (!logErr) state.dailyLogs = logs || [];
}

async function loadSettings() {
  const { data, error } = await supabaseClient.from('user_settings').select('*').eq('user_id', state.user.id).maybeSingle();
  if (!error && data) {
    state.settings = data;
  } else {
    // cria configurações padrão na primeira vez
    const defaults = { user_id: state.user.id, display_name: '', theme: 'dark', language: 'pt' };
    await supabaseClient.from('user_settings').insert(defaults);
    state.settings = defaults;
  }
  applyTheme();
}

async function saveSettings() {
  await supabaseClient.from('user_settings').upsert({ user_id: state.user.id, ...state.settings });
  applyTheme();
}

/* ===========================================================
   SESSÃO / INICIALIZAÇÃO
=========================================================== */
async function bootstrapSession() {
  const { data } = await supabaseClient.auth.getSession();
  state.session = data.session;
  state.user = data.session?.user || null;
  if (state.session) {
    await Promise.all([loadTasks(), loadDaily(), loadSettings()]);
  }
  render();
}

supabaseClient.auth.onAuthStateChange((_event, session) => {
  state.session = session;
  state.user = session?.user || null;
  if (!session) render();
});

// Tema salvo localmente antes mesmo do login (evita flash)
const localTheme = localStorage.getItem('trilha_theme');
if (localTheme) document.body.classList.toggle('theme-light', localTheme === 'light');

bootstrapSession();
