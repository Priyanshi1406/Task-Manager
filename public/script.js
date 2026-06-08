// ===== STATE =====
let token = localStorage.getItem('token');
let currentUser = JSON.parse(localStorage.getItem('user') || 'null');
let allTasks = [];
let currentFilter = 'all';
let currentPriority = 'all';
let editingTaskId = null;
let socket = null;

// ===== INIT =====
window.addEventListener('load', () => {
  if (token && currentUser) {
    showApp();
    initSocket();
    loadTasks();
  } else {
    document.getElementById('auth-screen').classList.remove('hidden');
  }
});

// ===== SOCKET.IO REALTIME =====
function initSocket() {
  socket = io();
  socket.on('connect', () => {
    socket.emit('join', currentUser._id);
  });
  socket.on('taskCreated', (task) => {
    if (task.user === currentUser._id) {
      allTasks.unshift(task);
      renderTasks();
      updateCounts();
      showToast('✦ New task created');
    }
  });
  socket.on('taskUpdated', (task) => {
    if (task.user === currentUser._id) {
      const idx = allTasks.findIndex(t => t._id === task._id);
      if (idx !== -1) allTasks[idx] = task;
      renderTasks();
      updateCounts();
    }
  });
  socket.on('taskDeleted', ({ id }) => {
    allTasks = allTasks.filter(t => t._id !== id);
    renderTasks();
    updateCounts();
    showToast('✦ Task deleted');
  });
}

// ===== AUTH =====
function switchTab(tab) {
  document.getElementById('login-form').classList.toggle('hidden', tab !== 'login');
  document.getElementById('register-form').classList.toggle('hidden', tab !== 'register');
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
}

async function login() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');
  errorEl.textContent = '';

  if (!email || !password) { errorEl.textContent = 'Please fill all fields'; return; }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    token = data.token;
    currentUser = data.user;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(currentUser));
    showApp();
    initSocket();
    loadTasks();
  } catch (err) {
    errorEl.textContent = err.message || 'Login failed';
  }
}

async function register() {
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const errorEl = document.getElementById('reg-error');
  errorEl.textContent = '';

  if (!name || !email || !password) { errorEl.textContent = 'Please fill all fields'; return; }
  if (password.length < 6) { errorEl.textContent = 'Password must be at least 6 characters'; return; }

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    token = data.token;
    currentUser = data.user;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(currentUser));
    showApp();
    initSocket();
    loadTasks();
  } catch (err) {
    errorEl.textContent = err.message || 'Registration failed';
  }
}

function logout() {
  token = null;
  currentUser = null;
  allTasks = [];
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  if (socket) socket.disconnect();
  document.getElementById('app').classList.add('hidden');
  document.getElementById('auth-screen').classList.remove('hidden');
}

function showApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  if (currentUser) {
    document.getElementById('user-name').textContent = currentUser.name;
    document.getElementById('user-avatar').textContent = currentUser.name[0].toUpperCase();
  }
}

// ===== TASKS =====
async function loadTasks() {
  try {
    const res = await fetch('/api/tasks', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.status === 401) { logout(); return; }
    allTasks = await res.json();
    renderTasks();
    updateCounts();
  } catch (err) {
    console.error(err);
  }
}

function renderTasks() {
  const container = document.getElementById('tasks-container');
  const emptyState = document.getElementById('empty-state');
  const search = document.getElementById('search-input').value.toLowerCase();

  let tasks = [...allTasks];

  // Filter by status
  if (currentFilter !== 'all') tasks = tasks.filter(t => t.status === currentFilter);

  // Filter by priority
  if (currentPriority !== 'all') tasks = tasks.filter(t => t.priority === currentPriority);

  // Search
  if (search) tasks = tasks.filter(t =>
    t.title.toLowerCase().includes(search) ||
    (t.description || '').toLowerCase().includes(search)
  );

  // Clear existing cards
  container.querySelectorAll('.task-card').forEach(el => el.remove());

  if (tasks.length === 0) {
    emptyState.classList.remove('hidden');
    return;
  }
  emptyState.classList.add('hidden');

  tasks.forEach(task => {
    const card = createTaskCard(task);
    container.appendChild(card);
  });
}

function createTaskCard(task) {
  const card = document.createElement('div');
  card.className = `task-card ${task.priority} ${task.status === 'done' ? 'done' : ''}`;
  card.dataset.id = task._id;

  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'done';
  const dueText = task.dueDate ? new Date(task.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '';

  const statusLabels = { todo: 'To Do', inprogress: 'In Progress', done: 'Done' };

  card.innerHTML = `
    <div class="task-header">
      <span class="task-title">${escapeHtml(task.title)}</span>
      <div class="task-actions">
        <button class="task-btn" onclick="editTask('${task._id}')">Edit</button>
        <button class="task-btn delete" onclick="deleteTask('${task._id}')">✕</button>
      </div>
    </div>
    ${task.description ? `<p class="task-desc">${escapeHtml(task.description)}</p>` : ''}
    <div class="task-footer">
      <button class="task-status ${task.status}" onclick="cycleStatus('${task._id}')">
        ${statusLabels[task.status] || task.status}
      </button>
      <div class="task-meta">
        <span class="task-priority ${task.priority}">${task.priority}</span>
        ${dueText ? `<span class="task-due ${isOverdue ? 'overdue' : ''}">${isOverdue ? '⚠ ' : ''}${dueText}</span>` : ''}
      </div>
    </div>
  `;
  return card;
}

async function cycleStatus(id) {
  const task = allTasks.find(t => t._id === id);
  if (!task) return;
  const next = { todo: 'inprogress', inprogress: 'done', done: 'todo' };
  await updateTask(id, { status: next[task.status] });
}

function updateCounts() {
  const counts = { all: allTasks.length, todo: 0, inprogress: 0, done: 0 };
  const now = new Date();
  let overdue = 0;

  allTasks.forEach(t => {
    counts[t.status] = (counts[t.status] || 0) + 1;
    if (t.dueDate && new Date(t.dueDate) < now && t.status !== 'done') overdue++;
  });

  document.getElementById('count-all').textContent = counts.all;
  document.getElementById('count-todo').textContent = counts.todo;
  document.getElementById('count-inprogress').textContent = counts.inprogress;
  document.getElementById('count-done').textContent = counts.done;
  document.getElementById('stat-total').textContent = counts.all;
  document.getElementById('stat-inprogress').textContent = counts.inprogress;
  document.getElementById('stat-done').textContent = counts.done;
  document.getElementById('stat-overdue').textContent = overdue;
}

// ===== MODAL =====
function openModal(task = null) {
  editingTaskId = task ? task._id : null;
  document.getElementById('modal-title').textContent = task ? 'Edit Task' : 'New Task';
  document.getElementById('modal-save-btn').textContent = task ? 'Update Task' : 'Save Task';
  document.getElementById('task-title').value = task ? task.title : '';
  document.getElementById('task-desc').value = task ? (task.description || '') : '';
  document.getElementById('task-priority').value = task ? task.priority : 'medium';
  document.getElementById('task-status').value = task ? task.status : 'todo';
  document.getElementById('task-due').value = task?.dueDate ? task.dueDate.split('T')[0] : '';
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById('task-title').focus();
}

function closeModal(e) {
  if (e && e.target !== document.getElementById('modal-overlay')) return;
  document.getElementById('modal-overlay').classList.add('hidden');
  editingTaskId = null;
}

async function saveTask() {
  const title = document.getElementById('task-title').value.trim();
  if (!title) { document.getElementById('task-title').focus(); return; }

  const data = {
    title,
    description: document.getElementById('task-desc').value.trim(),
    priority: document.getElementById('task-priority').value,
    status: document.getElementById('task-status').value,
    dueDate: document.getElementById('task-due').value || null
  };

  if (editingTaskId) {
    await updateTask(editingTaskId, data);
  } else {
    await createTask(data);
  }
  document.getElementById('modal-overlay').classList.add('hidden');
}

async function createTask(data) {
  try {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to create task');
    // Socket will handle UI update
  } catch (err) { console.error(err); }
}

async function updateTask(id, data) {
  try {
    const res = await fetch(`/api/tasks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to update task');
    // Socket will handle UI update
  } catch (err) { console.error(err); }
}

async function deleteTask(id) {
  if (!confirm('Delete this task?')) return;
  try {
    await fetch(`/api/tasks/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    // Socket will handle UI update
  } catch (err) { console.error(err); }
}

function editTask(id) {
  const task = allTasks.find(t => t._id === id);
  if (task) openModal(task);
}

// ===== FILTERS =====
function filterTasks(status) {
  currentFilter = status;
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.getElementById(`nav-${status}`).classList.add('active');
  const titles = { all: 'All Tasks', todo: 'To Do', inprogress: 'In Progress', done: 'Done' };
  document.getElementById('page-title').textContent = titles[status];
  renderTasks();
}

function filterPriority(priority, btn) {
  currentPriority = priority;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderTasks();
}

function searchTasks() { renderTasks(); }

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// ===== TOAST =====
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3000);
}

// ===== UTILS =====
function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Close modal on Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.getElementById('modal-overlay').classList.add('hidden');
});
