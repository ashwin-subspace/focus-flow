(() => {
  'use strict';

  const DURATIONS = { work: 25 * 60, short: 5 * 60, long: 15 * 60 };
  const LABELS = { work: 'Focus Session', short: 'Short Break', long: 'Long Break' };
  const RING_CIRCUMFERENCE = 2 * Math.PI * 120;
  const CYCLE_LENGTH = 4; // pomodoros before a long break
  const STORAGE_KEY = 'focus-flow-state-v1';

  const els = {
    modeTabs: document.querySelectorAll('.mode-tab'),
    ring: document.getElementById('ring-progress'),
    timeDisplay: document.getElementById('time-display'),
    sessionLabel: document.getElementById('session-label'),
    startBtn: document.getElementById('start-btn'),
    resetBtn: document.getElementById('reset-btn'),
    skipBtn: document.getElementById('skip-btn'),
    dots: document.getElementById('pomodoro-dots'),
    streakCount: document.getElementById('streak-count'),
    streakDisplay: document.getElementById('streak-display'),
    taskForm: document.getElementById('task-form'),
    taskInput: document.getElementById('task-input'),
    taskList: document.getElementById('task-list'),
    tasksCount: document.getElementById('tasks-count'),
    emptyState: document.getElementById('empty-state'),
    celebration: document.getElementById('celebration'),
  };

  els.ring.style.strokeDasharray = String(RING_CIRCUMFERENCE);

  function todayStr(d = new Date()) {
    return d.toISOString().slice(0, 10);
  }

  function loadState() {
    const defaults = {
      mode: 'work',
      remaining: DURATIONS.work,
      running: false,
      endsAt: null,
      pomodorosInCycle: 0,
      tasks: [],
      activeTaskId: null,
      streak: { count: 0, lastDate: null },
    };
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw);
      return { ...defaults, ...parsed, streak: { ...defaults.streak, ...(parsed.streak || {}) } };
    } catch {
      return defaults;
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  let state = loadState();
  let timerId = null;

  function fmt(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  function ringColor() {
    if (state.mode === 'work') return getComputedStyle(document.documentElement).getPropertyValue('--accent');
    return getComputedStyle(document.documentElement).getPropertyValue('--accent-break');
  }

  // Skip the ring's easing for one frame so a mode change snaps instead of unwinding
  function renderInstant() {
    els.ring.classList.add('no-transition');
    render();
    els.ring.getBoundingClientRect();
    els.ring.classList.remove('no-transition');
  }

  // Split from render() because this runs on every tick. Rebuilding the task list at
  // that rate would churn the DOM and steal taps from elements as they are recreated.
  function renderTimer() {
    els.modeTabs.forEach(tab => tab.classList.toggle('active', tab.dataset.mode === state.mode));
    els.timeDisplay.textContent = fmt(state.remaining);
    els.sessionLabel.textContent = LABELS[state.mode];

    const total = DURATIONS[state.mode];
    const progress = 1 - state.remaining / total;
    els.ring.style.stroke = ringColor().trim();
    els.ring.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - progress));

    els.startBtn.textContent = state.running ? 'Pause' : 'Start';
    els.startBtn.classList.toggle('running', state.running);
  }

  function render() {
    renderTimer();
    renderDots();
    renderStreak();
    renderTasks();
  }

  function renderDots() {
    els.dots.innerHTML = '';
    for (let i = 0; i < CYCLE_LENGTH; i++) {
      const dot = document.createElement('span');
      dot.className = 'dot' + (i < state.pomodorosInCycle ? ' filled' : '');
      els.dots.appendChild(dot);
    }
  }

  function renderStreak() {
    els.streakCount.textContent = state.streak.count;
    els.streakDisplay.classList.toggle('active', state.streak.count > 0);
  }

  function renderTasks() {
    els.taskList.innerHTML = '';
    const active = state.tasks.filter(t => !t.done).length;
    els.tasksCount.textContent = `${active} active`;
    els.emptyState.style.display = state.tasks.length ? 'none' : 'block';

    state.tasks.forEach(task => {
      const li = document.createElement('li');
      li.className = 'task-item' + (task.done ? ' done' : '') + (task.id === state.activeTaskId ? ' active-task' : '');

      const checkbox = document.createElement('button');
      checkbox.className = 'task-checkbox';
      checkbox.textContent = task.done ? '✓' : '';
      checkbox.setAttribute('aria-label', 'Toggle task complete');
      checkbox.addEventListener('click', () => toggleTask(task.id));

      const text = document.createElement('span');
      text.className = 'task-text';
      text.textContent = task.text;
      text.title = 'Click to set as active task';
      text.addEventListener('click', () => setActiveTask(task.id));

      const pomCount = document.createElement('span');
      pomCount.className = 'task-pomodoros';
      pomCount.textContent = task.pomodoros ? `🍅 ${task.pomodoros}` : '';

      const del = document.createElement('button');
      del.className = 'task-delete';
      del.textContent = '×';
      del.setAttribute('aria-label', 'Delete task');
      del.addEventListener('click', () => deleteTask(task.id));

      li.append(checkbox, text, pomCount, del);
      els.taskList.appendChild(li);
    });
  }

  function setActiveTask(id) {
    state.activeTaskId = state.activeTaskId === id ? null : id;
    saveState();
    render();
  }

  function toggleTask(id) {
    const task = state.tasks.find(t => t.id === id);
    if (!task) return;
    task.done = !task.done;
    saveState();
    render();
  }

  function deleteTask(id) {
    state.tasks = state.tasks.filter(t => t.id !== id);
    if (state.activeTaskId === id) state.activeTaskId = null;
    saveState();
    render();
  }

  els.taskForm.addEventListener('submit', e => {
    e.preventDefault();
    const text = els.taskInput.value.trim();
    if (!text) return;
    state.tasks.push({ id: crypto.randomUUID(), text, done: false, pomodoros: 0 });
    els.taskInput.value = '';
    saveState();
    render();
  });

  function switchMode(mode, resetRemaining = true) {
    state.mode = mode;
    if (resetRemaining) state.remaining = DURATIONS[mode];
    state.running = false;
    state.endsAt = null;
    clearInterval(timerId);
    releaseWakeLock();
    saveState();
    renderInstant();
  }

  els.modeTabs.forEach(tab => {
    tab.addEventListener('click', () => switchMode(tab.dataset.mode));
  });

  // Timing is driven by an absolute deadline rather than by counting interval ticks.
  // Phones throttle or entirely freeze timers for backgrounded tabs and locked screens,
  // so a tick-counting clock would stall or drift by minutes over a 25-minute session.
  // The interval below only repaints; `endsAt` is the single source of truth.
  function syncRemaining() {
    if (!state.running || state.endsAt == null) return;
    state.remaining = Math.max(0, Math.round((state.endsAt - Date.now()) / 1000));
  }

  function tick() {
    syncRemaining();
    if (state.remaining <= 0) {
      completeSession();
      return;
    }
    renderTimer();
  }

  function startTicking() {
    clearInterval(timerId);
    timerId = setInterval(tick, 250);
  }

  function startPause() {
    if (state.running) {
      syncRemaining();
      state.running = false;
      state.endsAt = null;
      clearInterval(timerId);
      releaseWakeLock();
    } else {
      state.running = true;
      state.endsAt = Date.now() + state.remaining * 1000;
      startTicking();
      requestWakeLock();
      // First completion needs a user gesture to ask, so piggyback on this tap.
      requestNotificationPermission();
    }
    saveState();
    render();
  }

  els.startBtn.addEventListener('click', startPause);

  els.resetBtn.addEventListener('click', () => {
    state.running = false;
    state.endsAt = null;
    clearInterval(timerId);
    releaseWakeLock();
    state.remaining = DURATIONS[state.mode];
    saveState();
    renderInstant();
  });

  els.skipBtn.addEventListener('click', () => {
    state.running = false;
    state.endsAt = null;
    clearInterval(timerId);
    releaseWakeLock();
    advanceMode();
  });

  function completeSession() {
    state.running = false;
    state.endsAt = null;
    state.remaining = 0;
    clearInterval(timerId);
    releaseWakeLock();

    if (state.mode === 'work') {
      state.pomodorosInCycle = (state.pomodorosInCycle + 1) % CYCLE_LENGTH === 0
        ? 0 : state.pomodorosInCycle + 1;
      const justCompleted = state.pomodorosInCycle === 0 ? CYCLE_LENGTH : state.pomodorosInCycle;

      if (state.activeTaskId) {
        const task = state.tasks.find(t => t.id === state.activeTaskId);
        if (task) task.pomodoros = (task.pomodoros || 0) + 1;
      }

      bumpStreak();
      celebrate();
      const nextMode = justCompleted === CYCLE_LENGTH ? 'long' : 'short';
      alertUser('Focus session complete', `Time for a ${nextMode === 'long' ? 'long' : 'short'} break.`);
      advanceMode(nextMode);
    } else {
      alertUser('Break over', 'Back to it — starting a new focus session.');
      advanceMode('work');
    }
    saveState();
  }

  function advanceMode(forcedNext) {
    let next = forcedNext;
    if (!next) {
      next = state.mode === 'work' ? 'short' : 'work';
    }
    switchMode(next);
  }

  function bumpStreak() {
    const today = todayStr();
    if (state.streak.lastDate === today) return;
    const yesterday = todayStr(new Date(Date.now() - 86400000));
    if (state.streak.lastDate === yesterday) {
      state.streak.count += 1;
    } else {
      state.streak.count = 1;
    }
    state.streak.lastDate = today;
  }

  function celebrate() {
    const colors = ['#ff8a5c', '#6ee7b7', '#7dd3fc', '#fcd34d'];
    const count = 40;
    for (let i = 0; i < count; i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      const size = 6 + Math.random() * 6;
      piece.style.left = `${Math.random() * 100}vw`;
      piece.style.width = `${size}px`;
      piece.style.height = `${size * 0.4}px`;
      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
      piece.style.animationDuration = `${1.8 + Math.random() * 1.4}s`;
      piece.style.animationDelay = `${Math.random() * 0.3}s`;
      els.celebration.appendChild(piece);
      setTimeout(() => piece.remove(), 3600);
    }
    document.title = '🎉 Session complete! — Focus Flow';
    setTimeout(() => { document.title = 'Focus Flow'; }, 3000);
  }

  // --- Phone-facing behaviour -------------------------------------------------

  // On a phone the screen is usually off when a session ends, so buzz and post a
  // notification rather than relying on the confetti being seen. Both are optional
  // capabilities (iOS has no vibrate, notifications may be denied) — degrade silently.
  function alertUser(title, body) {
    try {
      // Browsers reject (and log) vibrate calls until the page has been tapped at least once.
      const tapped = navigator.userActivation ? navigator.userActivation.hasBeenActive : true;
      if (navigator.vibrate && tapped) navigator.vibrate([200, 100, 200]);
    } catch { /* unsupported */ }
    try {
      if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
        new Notification(title, { body, icon: 'icons/icon-192.png', tag: 'focus-flow' });
      }
    } catch { /* unsupported or blocked */ }
  }

  function requestNotificationPermission() {
    try {
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    } catch { /* unsupported */ }
  }

  // Keeps the screen on during a running session. Dropped automatically whenever the
  // page is hidden, so it must be re-acquired on return.
  let wakeLock = null;

  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator && !wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      }
    } catch { /* denied or unsupported */ }
  }

  function releaseWakeLock() {
    try {
      if (wakeLock) { wakeLock.release(); wakeLock = null; }
    } catch { /* already gone */ }
  }

  // Coming back from a locked screen or another app: the interval was frozen, so
  // recompute against the real clock and fire completion if it elapsed while away.
  function resync() {
    if (state.streak.lastDate && state.streak.lastDate !== todayStr()) {
      const yesterday = todayStr(new Date(Date.now() - 86400000));
      if (state.streak.lastDate !== yesterday) {
        state.streak.count = 0;
        saveState();
      }
    }
    if (state.running) {
      syncRemaining();
      if (state.remaining <= 0) { completeSession(); return; }
      startTicking();
      requestWakeLock();
    }
    render();
  }

  document.addEventListener('visibilitychange', () => { if (!document.hidden) resync(); });
  window.addEventListener('focus', resync);
  window.addEventListener('pageshow', resync);

  // --- Install prompt ---------------------------------------------------------

  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  let deferredPrompt = null;

  function showInstallHint(html, withButton) {
    if (localStorage.getItem('focus-flow-install-dismissed') === '1') return;
    document.getElementById('install-text').innerHTML = html;
    document.getElementById('install-btn').hidden = !withButton;
    document.getElementById('install-hint').hidden = false;
  }

  document.getElementById('install-dismiss').addEventListener('click', () => {
    document.getElementById('install-hint').hidden = true;
    localStorage.setItem('focus-flow-install-dismissed', '1');
  });

  // Android/Chrome fires this when the app qualifies for installation.
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    showInstallHint('Add <strong>Focus Flow</strong> to your home screen.', true);
  });

  document.getElementById('install-btn').addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    document.getElementById('install-hint').hidden = true;
  });

  window.addEventListener('appinstalled', () => {
    document.getElementById('install-hint').hidden = true;
  });

  // iOS never fires beforeinstallprompt, so spell out the manual gesture instead.
  if (isIOS && !isStandalone) {
    showInstallHint('Install: tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.', false);
  }

  // --- Service worker ---------------------------------------------------------

  // Relative path so this keeps working from a GitHub Pages subpath.
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* offline support unavailable */ });
    });
  }

  // A session may have been running when the app was last closed; pick it back up.
  if (state.running) {
    syncRemaining();
    if (state.remaining > 0) { startTicking(); } else { state.running = false; state.endsAt = null; }
  }

  render();
})();
