// ══════════════════════════════════════════════════════
// SUPABASE
// ══════════════════════════════════════════════════════
const SUPABASE_URL  = 'https://cvxchaphlknlmfpewuhv.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2eGNoYXBobGtubG1mcGV3dWh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNjA1MjAsImV4cCI6MjA4ODczNjUyMH0.JYISeCJFBzxwr6NofaNjApJlNsL8xOGAyuj3BB2GSDQ';
let db = null;
function getDB() {
  if (!db) {
    if (typeof window.supabase === 'undefined') throw new Error('Supabase failed to load.');
    db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
  }
  return db;
}

// ══════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════
const SUBJECTS  = ['Maths','SST','English','Science','IT','Hindi'];
const SUB_COLOR = {Maths:'#818CF8',SST:'#FBBF24',English:'#34D399',Science:'#60A5FA',IT:'#C084FC',Hindi:'#F87171'};
// Sub-parts for Science and SST (homework only)
const SUB_PARTS = {
  Science: ['Physics','Chemistry','Biology'],
  SST:     ['Economics','Civics','Geography','History'],
};
// Sub-part colors (lighter shades of parent)
const SUB_PART_COLOR = {
  'Physics':'#93C5FD','Chemistry':'#60A5FA','Biology':'#3B82F6',
  'Economics':'#FCD34D','Civics':'#FBBF24','Geography':'#F59E0B','History':'#D97706',
};
// Get all homework keys (subjects + sub-parts)
function allHWKeys() {
  const keys = [];
  SUBJECTS.forEach(s => {
    if (SUB_PARTS[s]) SUB_PARTS[s].forEach(p => keys.push(s+':'+p));
    else keys.push(s);
  });
  return keys;
}
// Display label for a hw key
function hwKeyLabel(key) {
  if (key.includes(':')) return key.split(':')[1];
  return key;
}
// Color for a hw key
function hwKeyColor(key) {
  if (key.includes(':')) {
    const part = key.split(':')[1];
    return SUB_PART_COLOR[part] || SUB_COLOR[key.split(':')[0]];
  }
  return SUB_COLOR[key] || 'var(--accent)';
}
const DAYS_TT   = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const PERIODS   = ['P1','P2','P3','P4','P5','P6','P7','P8'];
const MONTHS    = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function getToday() { return new Date().toISOString().split('T')[0]; }
const TODAY = getToday(); // keep for initial renders; use getToday() inside timers/saves
const SESSION_KEY = 'studydesk_session';

// ══════════════════════════════════════════════════════
// APP STATE
// ══════════════════════════════════════════════════════
let currentUser = null, currentDisplay = null, currentAvatar = null, currentBanner = null;
let exams = [], homework = {}, schoolDays = {}, timetable = {}, studySessions = [], syllabus = {};
let vacationRanges = [], earnedBadges = {}, weeklyReports = [], monthlyReports = [];
let dailyStudyGoalMins = 60;
let weeklyStudyGoalHrs = 10;  // Weekly target in hours
let studySchedules = [];      // [{id, examId, examName, examDate, createdAt, days:[{date,subject,chapters,durationMins}]}]
let friendsList    = [];      // [{username, display_name, avatar, banner}]
let friendRequests = [];      // [{id, requester, recipient, status}]
let calendarEvents = [];  // { id, title, date, subject, type, note }
let appDisabled = false;
let notifications = []; // [{id,type,title,body,date,read,data}]

// Calendar / nav state
let calYear = new Date().getFullYear(), calMonth = new Date().getMonth(), selDate = TODAY;
let hwDate = TODAY, hwTab = 'daily', editCell = null;
let hwHistoryYear = new Date().getFullYear(), hwHistoryMonth = new Date().getMonth(), hwHistorySel = TODAY;
let thYear = new Date().getFullYear(), thMonth = new Date().getMonth(), thSel = TODAY;
let timerHistTab = 'timer';
let evCalYear = new Date().getFullYear(), evCalMonth = new Date().getMonth();
let evCalSelDate = null, evFilterSubj = null;

// Charts
let chartAtt = null;
const markCharts = {}, analyticsCharts = {};
let saveTimer = null;

// ══════════════════════════════════════════════════════
// STUDY TIMER STATE
// ══════════════════════════════════════════════════════
let timerState    = 'idle';   // idle | studying | paused | break
let timerSecs     = 0;        // elapsed study seconds (display value, kept in sync)
let timerInterval = null;
let breakSecs     = 0;        // remaining break seconds (display value)
let breakTotal    = 0;        // total break seconds
let breakInterval = null;
let timerSubject  = SUBJECTS[0];
let sessionStart  = null;     // ISO string when current study session started

// Wall-clock anchors — used to compute true elapsed time regardless of tab visibility
let _studyWallStart  = null;  // Date.now() when studying interval last started
let _studyBaseSeconds = 0;    // seconds already accumulated before current interval
let _breakWallStart  = null;  // Date.now() when break interval last started
let _breakBaseSeconds = 0;    // break seconds already consumed before current interval

// ══════════════════════════════════════════════════════
// UTILS
// ══════════════════════════════════════════════════════
function el(id)           { return document.getElementById(id); }
function fmtDate(s)       { return new Date(s + 'T12:00:00').toDateString(); }
function toDateStr(y,m,d) { return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }
function openModal(id)    { el(id).classList.add('open'); }
function closeModal(id)   { el(id).classList.remove('open'); }
function handleOverlayClick(e,id){ if(e.target.id===id) closeModal(id); }
function showLoading(v)   { el('loading-overlay').style.display = v ? 'flex' : 'none'; }

function toast(msg, col) {
  const t = el('toast');
  t.textContent = msg;
  t.style.borderColor = col || 'var(--accent)';
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

function secToHMS(s) {
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), ss = s%60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
}

function secToLabel(s) {
  if (!s || s <= 0) return '—';
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s%60}s`;
  return `${s}s`;
}

async function hashPassword(p) {
  const data = new TextEncoder().encode(p);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

function _studyElapsed() {
  if (_studyWallStart === null) return _studyBaseSeconds;
  return _studyBaseSeconds + Math.floor((Date.now() - _studyWallStart) / 1000);
}
function _breakRemaining() {
  if (_breakWallStart === null) return _breakBaseSeconds;
  return _breakBaseSeconds - Math.floor((Date.now() - _breakWallStart) / 1000);
}

function compressImage(file, maxW, maxH, quality=0.82) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.width, h = img.height;
      if (w > maxW) { h = Math.round(h*maxW/w); w = maxW; }
      if (h > maxH) { w = Math.round(w*maxH/h); h = maxH; }
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      res(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = rej; img.src = url;
  });
}

// ══════════════════════════════════════════════════════
// SESSION PERSISTENCE
// ══════════════════════════════════════════════════════
function saveSession() {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify({ username:currentUser, display:currentDisplay, avatar:currentAvatar, banner:currentBanner })); } catch(e){}
}
function loadSession() {
  try { const s=localStorage.getItem(SESSION_KEY); return s?JSON.parse(s):null; } catch(e){ return null; }
}
function clearSession() { try { localStorage.removeItem(SESSION_KEY); } catch(e){} }

// ══════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════
async function doLogin() {
  const username = el('login-username').value.trim().toLowerCase();
  const password = el('login-password').value;
  const errEl = el('login-error'), btn = el('login-btn');
  errEl.textContent = '';
  if (!username || !password) { errEl.textContent = 'Please fill in both fields.'; return; }
  btn.disabled = true; btn.textContent = 'Signing in...';
  try {
    const client = getDB();
    const { data: profile, error } = await client.from('profiles').select('*').eq('username', username).single();
    if (error || !profile) { errEl.textContent = 'Username not found.'; btn.disabled=false; btn.textContent='Sign In'; return; }
    const hashed = await hashPassword(password);
    const display = profile.display_name || username;
    if (profile.password_hash === hashed) {
      await onLoginSuccess(username, display, profile.avatar||null, profile.banner||null);
    } else if (profile.password_hash === password) {
      await client.from('profiles').update({ password_hash: hashed }).eq('username', username);
      await onLoginSuccess(username, display, profile.avatar||null, profile.banner||null);
    } else {
      errEl.textContent = 'Incorrect password.'; btn.disabled=false; btn.textContent='Sign In';
    }
  } catch(e) { errEl.textContent = e.message||'Connection error.'; btn.disabled=false; btn.textContent='Sign In'; }
}

async function onLoginSuccess(username, display, avatar, banner) {
  currentUser=username; currentDisplay=display; currentAvatar=avatar; currentBanner=banner;
  saveSession(); showLoading(true);
  el('login-page').style.display = 'none';
  updateSidebarUI();
  await loadUserData();
  showLoading(false);
  el('app').style.display = 'flex';
  checkAutoReports();
  checkAndAwardBadges();
  applyDisabledMode();
  loadFriends(); // load friends in background
  if (appDisabled) showPage('profile');
  else renderDashboard();
}

function doLogout() {
  if (!confirm('Sign out?')) return;
  // Stop timer and clear active session from DB
  timerClearAll();
  timerState='idle'; timerSecs=0; breakSecs=0; breakTotal=0;
  _studyBaseSeconds=0; _studyWallStart=null; _breakBaseSeconds=0; _breakWallStart=null;
  sessionStart=null;
  // Close any open friend profile modal + realtime channel
  if (typeof _friendProfileChannel !== 'undefined' && _friendProfileChannel) {
    try { getDB().removeChannel(_friendProfileChannel); } catch(e) {}
    _friendProfileChannel = null;
  }
  closeFriendProfile();
  // Destroy all chart instances to free memory and prevent stale refs on re-login
  if (chartAtt) { chartAtt.destroy(); chartAtt = null; }
  Object.keys(markCharts).forEach(k=>{ if(markCharts[k]){markCharts[k].destroy(); delete markCharts[k];} });
  Object.keys(analyticsCharts).forEach(k=>{ if(analyticsCharts[k]){analyticsCharts[k].destroy(); delete analyticsCharts[k];} });
  // Reset all state
  currentUser=currentDisplay=currentAvatar=currentBanner=null;
  exams=[]; homework={}; schoolDays={}; timetable={}; studySessions=[]; syllabus={};
  _setActiveSession(null); // clear studying status for friends
  friendsList=[]; friendRequests=[];
  calendarEvents=[]; appDisabled=false; notifications=[]; vacationRanges=[]; earnedBadges={};
  weeklyReports=[]; monthlyReports=[]; dailyStudyGoalMins=60; weeklyStudyGoalHrs=10; studySchedules=[];
  clearSession();
  // Reset UI
  document.querySelectorAll('.modal-overlay.open').forEach(m=>m.classList.remove('open'));
  el('app').style.display='none'; el('login-page').style.display='flex';
  el('login-username').value=''; el('login-password').value='';
  el('login-error').textContent=''; el('login-btn').disabled=false; el('login-btn').textContent='Sign In \u2192';
}

function updateSidebarUI() {
  el('sidebar-uname').textContent       = currentDisplay || currentUser || '—';
  el('sidebar-username-sub').textContent = '@'+(currentUser||'—');
  if (currentAvatar) {
    el('sidebar-avatar-img').src=''; el('sidebar-avatar-img').src=currentAvatar;
    el('sidebar-avatar-img').style.display='block'; el('sidebar-avatar').style.display='none';
  } else {
    el('sidebar-avatar-img').style.display='none'; el('sidebar-avatar').style.display='flex';
    el('sidebar-avatar').textContent=(currentDisplay||currentUser||'?')[0].toUpperCase();
  }
  el('dash-uname').textContent = currentDisplay||currentUser||'—';
}

// ══════════════════════════════════════════════════════
// AUTO LOGIN
// ══════════════════════════════════════════════════════
window.addEventListener('load', async () => {
  loadTheme();
  const session = loadSession();
  if (!session?.username) return;
  showLoading(true); el('login-page').style.display='none';
  try {
    const client = getDB();
    const { data: profile, error } = await client.from('profiles').select('*').eq('username', session.username).single();
    if (error || !profile) throw new Error('Session invalid');
    currentUser    = session.username;
    currentDisplay = profile.display_name || session.username;
    // Prefer Supabase values; fall back to localStorage cache if columns not yet added
    currentAvatar  = profile.avatar  || session.avatar  || null;
    currentBanner  = profile.banner  || session.banner  || null;
    saveSession(); updateSidebarUI();
    await loadUserData();
    showLoading(false); el('app').style.display='flex';
    checkAutoReports();
    checkAndAwardBadges();
    applyDisabledMode();
    loadFriends();
    if (appDisabled) showPage('profile');
    else renderDashboard();
  } catch(e) {
    showLoading(false);
    // Only clear session (force re-login) if the user genuinely doesn't exist.
    // For network errors, keep session so next reload retries.
    const msg = (e.message||'').toLowerCase();
    if (msg.includes('invalid') || msg.includes('not found') || msg.includes('406')) {
      clearSession();
    }
    el('login-page').style.display='flex';
  }
});

// ══════════════════════════════════════════════════════
// CLOUD DATA
// ══════════════════════════════════════════════════════
async function loadUserData() {
  const client = getDB();
  const { data, error } = await client.from('user_data').select('*').eq('username', currentUser).single();
  if (data && !error) {
    // Successfully loaded — restore everything
    exams         = data.exams          || [];
    homework      = data.homework       || {};
    schoolDays    = data.school_days    || {};
    timetable     = data.timetable      || {};
    studySessions = data.study_sessions || [];
    syllabus     = data.syllabus         || {};
    const ext = data.extras || {};
    calendarEvents     = ext.calendar_events  || [];
    appDisabled        = ext.app_disabled      || false;
    notifications      = ext.notifications     || [];
    vacationRanges     = ext.vacation_ranges  || [];
    earnedBadges       = ext.earned_badges    || {};
    weeklyReports      = ext.weekly_reports   || [];
    monthlyReports     = ext.monthly_reports  || [];
    dailyStudyGoalMins  = ext.daily_goal_mins   || 60;
    weeklyStudyGoalHrs  = ext.weekly_goal_hrs   || 10;
    studySchedules      = ext.study_schedules   || [];
  } else if (error && error.code === 'PGRST116') {
    // Row genuinely doesn't exist yet — create it for the first time
    exams=[]; homework={}; schoolDays={}; timetable={}; studySessions=[];
    // Try insert with study_sessions; fall back without it if column missing
    try {
      await client.from('user_data').insert({
        username:currentUser, exams:[], homework:{}, school_days:{},
        timetable:{}, study_sessions:[], syllabus:{}
      });
    } catch(_) {
      await client.from('user_data').insert({
        username:currentUser, exams:[], homework:{}, school_days:{}, timetable:{}, syllabus:{}
      });
    }
  }
  // Any other error (network, missing column, etc.) — do NOT reset data.
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveToCloud, 900);
}

async function saveToCloud() {
  if (!currentUser) return;
  const extras = {
    calendar_events: calendarEvents,
    app_disabled:     appDisabled,
    notifications:    notifications,
    vacation_ranges: vacationRanges,
    earned_badges:   earnedBadges,
    weekly_reports:  weeklyReports,
    monthly_reports: monthlyReports,
    daily_goal_mins:  dailyStudyGoalMins,
    weekly_goal_hrs:  weeklyStudyGoalHrs,
    study_schedules:  studySchedules,
  };
  const base = {
    username: currentUser,
    exams, homework,
    school_days: schoolDays,
    timetable, syllabus, extras,
    updated_at: new Date().toISOString()
  };
  try {
    // Try saving everything including study_sessions
    await getDB().from('user_data').upsert(
      { ...base, study_sessions: studySessions },
      { onConflict: 'username' }
    );
    toast('Saved ✓');
  } catch(e) {
    // study_sessions column might not exist yet — save everything else
    try {
      await getDB().from('user_data').upsert(base, { onConflict: 'username' });
      toast('Saved ✓');
    } catch(e2) {
      toast('⚠ Save failed — check connection', 'var(--red)');
      console.error('saveToCloud error:', e2);
    }
  }
}

// ══════════════════════════════════════════════════════
// NAV
// ══════════════════════════════════════════════════════
function showPage(id) {
  // When app is locked, silently force profile — no popup, no message
  if (appDisabled && id !== 'profile') id = 'profile';
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  el('page-'+id).classList.add('active');
  if (el('nav-'+id)) el('nav-'+id).classList.add('active');
  if(id==='dashboard')  renderDashboard();
  if(id==='exams')      renderExams();
  if(id==='attendance') renderAttendance();
  if(id==='homework')   renderHomework();
  if(id==='timetable')  renderTimetable();
  if(id==='timer')      renderTimerPage();
  if(id==='analytics')  renderAnalytics();
  if(id==='syllabus')   renderSyllabus();
  if(id==='profile')    renderProfile();
  if(id==='calendar')   renderCalendarPage();
  if(id==='planner')    renderPlanner();
  if(id==='friends')    loadFriends().then(renderFriends);
}

// ══════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════
function renderDashboard() {
  // ── Streak + Badges row ──
  const _streak = calculateStreak();
  const _longest = getLongestStreak();
  const _earnedList = typeof BADGES !== 'undefined' ? BADGES.filter(b => earnedBadges[b.id]) : [];
  const _streakEl = el('dash-streak-row');
  if (_streakEl) {
    _streakEl.innerHTML = `<div class="streak-banner">
      <div class="streak-flame-wrap">
        <span class="streak-flame">${_streak > 0 ? '🔥' : '💤'}</span>
        <div>
          <div class="streak-num">${_streak}<span class="streak-unit"> day streak</span></div>
          <div class="streak-sub">Longest: ${_longest} days</div>
        </div>
      </div>
      <div class="streak-badges-preview">
        ${_earnedList.length
          ? _earnedList.slice(0,7).map(b=>`<div class="streak-badge-chip" title="${b.name}: ${b.desc}">${b.icon}</div>`).join('')
            + (_earnedList.length>7?`<div class="streak-badge-chip muted">+${_earnedList.length-7}</div>`:'')
          : '<span style="color:var(--muted);font-size:12px">No badges yet — keep studying!</span>'
        }
      </div>
      <button class="btn btn-ghost" style="font-size:12px;padding:6px 14px;white-space:nowrap" onclick="showPage('planner')">🗓 Planner</button>
    </div>`;
  }
  const sdVals=Object.values(schoolDays);
  const present=sdVals.filter(v=>v==='present').length, total=sdVals.filter(v=>v!=='holiday').length;
  const attPct=total>0?Math.round(present/total*100):null;
  let allScores=[];
  exams.forEach(ex=>{SUBJECTS.forEach(s=>{if(ex.marks[s]&&ex.marks[s].score!==''&&ex.marks[s].max>0)allScores.push(ex.marks[s].score/ex.marks[s].max*100);});});
  const avgPct=allScores.length?(allScores.reduce((a,v)=>a+v,0)/allScores.length).toFixed(1):null;
  const todayHW=homework[getToday()]||{};
  const todayFilled=allHWKeys().filter(k=>todayHW[k]&&(todayHW[k].text||todayHW[k].notGiven)).length;
  const totalStudySecs=studySessions.reduce((a,s)=>a+s.durationSecs,0);
  const stats=[
    {label:'Avg Score',val:avgPct?avgPct+'%':'—',sub:`across ${exams.length} exams`,color:'#818CF8'},
    {label:'Attendance',val:attPct!==null?attPct+'%':'—',sub:`${present}/${total} days`,color:'#34D399'},
    {label:'Study Time',val:totalStudySecs?secToLabel(totalStudySecs):'—',sub:`${studySessions.length} sessions`,color:'#00D4FF'},
    {label:"Today's HW",val:`${todayFilled}/${allHWKeys().length}`,sub:'Subjects filled today',color:'#FBBF24'},
  ];
  el('dash-stats').innerHTML=stats.map(s=>`<div class="stat-card"><div class="stat-bg" style="color:${s.color}">◈</div><div class="stat-val" style="color:${s.color}">${s.val}</div><div class="stat-label">${s.label}</div><div class="stat-sub">${s.sub}</div></div>`).join('');
  el('dash-subj-bars').innerHTML=SUBJECTS.map(subj=>{const scores=exams.map(ex=>ex.marks[subj]).filter(m=>m&&m.score!==''&&m.max>0).map(m=>m.score/m.max*100);const avg=scores.length?scores.reduce((a,v)=>a+v,0)/scores.length:0;return `<div class="subj-bar-wrap"><div class="subj-bar-row"><span style="color:${SUB_COLOR[subj]};font-weight:600;font-size:12px">${subj}</span><span style="color:var(--muted);font-size:11px;font-family:var(--mono)">${scores.length?avg.toFixed(0)+'%':'—'}</span></div><div class="subj-bar-track"><div class="subj-bar-fill" style="width:${avg}%;background:${SUB_COLOR[subj]}"></div></div></div>`;}).join('');
  // ── Upcoming events widget ──
  const _evEl = el('dash-upcoming-events');
  if (_evEl) {
    const today = getToday();
    const soon = calendarEvents
      .filter(e => e.date >= today)
      .sort((a,b) => a.date.localeCompare(b.date))
      .slice(0, 5);
    if (soon.length) {
      _evEl.innerHTML = `<div class="card" style="padding:16px 20px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <div class="sec-label" style="margin:0">UPCOMING EVENTS</div>
          <button class="btn btn-ghost" style="font-size:11px;padding:4px 10px" onclick="showPage('calendar')">View All →</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${soon.map(e => {
            const daysLeft = Math.max(0,Math.ceil((new Date(e.date+'T12:00:00')-new Date(today+'T12:00:00'))/86400000));
            const col = e.subject ? (SUB_COLOR[e.subject]||'var(--accent)') : 'var(--accent)';
            const urgCol = daysLeft===0?'var(--red)':daysLeft<=3?'var(--yellow)':'var(--muted)';
            const icon = {submission:'📤',project:'🗂',test:'📝',exam:'🎓',holiday:'🎉',reminder:'⏰',other:'📌'}[e.type]||'📌';
            return `<div class="ev-dash-row">
              <div class="ev-dash-dot" style="background:${col}"></div>
              <div class="ev-dash-info">
                <span class="ev-dash-title">${icon} ${e.title}</span>
                ${e.subject?`<span class="ev-dash-subj" style="color:${col}">${e.subject}</span>`:''}
              </div>
              <div class="ev-dash-days" style="color:${urgCol}">${daysLeft===0?'Today':daysLeft+'d'}</div>
            </div>`;
          }).join('')}
        </div>
      </div>`;
    } else {
      _evEl.innerHTML = '';
    }
  }

  // ── Vacation row on dashboard ──
  const _vacEl = el('dash-vacation-row');
  if (_vacEl) {
    const _tv = getToday();
    const _av = vacationRanges.find(v => _tv >= v.start && _tv <= v.end);
    const _uv = vacationRanges.filter(v => v.start > _tv).sort((a,b)=>a.start.localeCompare(b.start))[0];
    if (_av || _uv) {
      const _v = _av||_uv, _isA = !!_av;
      const _dl = _isA
        ? Math.ceil((new Date(_v.end+'T12:00:00')-new Date(_tv+'T12:00:00'))/86400000)
        : Math.ceil((new Date(_v.start+'T12:00:00')-new Date(_tv+'T12:00:00'))/86400000);
      _vacEl.innerHTML = `<div class="dash-vac-card">
        <span style="font-size:24px">🏖️</span>
        <div style="flex:1">
          <div style="font-weight:800;font-size:14px;color:var(--text)">${_v.label}</div>
          <div style="font-size:12px;color:var(--muted);margin-top:2px">${fmtDate(_v.start)} — ${fmtDate(_v.end)}</div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-family:var(--mono);font-weight:900;font-size:20px;color:${_isA?'var(--accent)':'var(--yellow)'}">${_dl}d</div>
          <div style="font-size:10px;color:var(--muted)">${_isA?'left':'until'}</div>
        </div>
        <button class="btn btn-ghost" style="font-size:11px;padding:4px 10px;flex-shrink:0" onclick="showPage('profile')">Manage</button>
      </div>`;
    } else { _vacEl.innerHTML = ''; }
  }
  // ── Notification bell dot ──
  updateNotifBell();

  el('dash-hw-list').innerHTML=allHWKeys().map(key=>{
    const col=hwKeyColor(key), label=hwKeyLabel(key), d=todayHW[key];
    if(!d) return `<div class="hw-mini"><div class="hw-dot" style="background:${col}"></div><div><span style="color:${col};font-weight:700;font-size:12px">${label}</span><div style="color:var(--muted);font-size:11px;margin-top:2px">Not filled yet</div></div></div>`;
    if(d.notGiven) return `<div class="hw-mini"><div class="hw-dot" style="background:var(--yellow)"></div><div><span style="color:${col};font-weight:700;font-size:12px">${label}</span><div style="color:var(--yellow);font-size:11px;margin-top:2px">Not given</div></div></div>`;
    return `<div class="hw-mini"><div class="hw-dot" style="background:${col}"></div><div><span style="color:${col};font-weight:700;font-size:12px">${label}</span><div style="color:var(--muted-light);font-size:11px;margin-top:2px">${d.text||'—'}</div></div></div>`;
  }).join('');
}

// ══════════════════════════════════════════════════════
// STUDY TIMER
// ══════════════════════════════════════════════════════
function renderTimerPage() {
  // Subject pills
  el('timer-subject-pills').innerHTML = SUBJECTS.map(s =>
    `<div class="timer-subj-pill ${s===timerSubject?'active':''}" style="${s===timerSubject?`background:${SUB_COLOR[s]};border-color:${SUB_COLOR[s]}`:''};" onclick="selectTimerSubject('${s}')">${s}</div>`
  ).join('');
  renderTimerDisplay();
  renderTodaySessions();
  if (timerHistTab === 'history') renderTimerHistory();
}

function selectTimerSubject(s) {
  if (timerState === 'studying' || timerState === 'break') return; // can't change while running
  timerSubject = s;
  renderTimerPage();
}

function switchTimerTab(tab) {
  timerHistTab = tab;
  el('timer-tab-timer').classList.toggle('active', tab==='timer');
  el('timer-tab-history').classList.toggle('active', tab==='history');
  el('timer-view').style.display        = tab==='timer'   ? 'block' : 'none';
  el('timer-history-view').style.display = tab==='history' ? 'block' : 'none';
  if (tab==='history') renderTimerHistory();
}

function renderTimerDisplay() {
  const clock     = el('timer-clock');
  const pill      = el('timer-status-pill');
  const label     = el('timer-clock-label');
  const card      = el('timer-main-card');
  const startBtn  = el('timer-start-btn');
  const pauseBtn  = el('timer-pause-btn');
  const stopBtn   = el('timer-stop-btn');
  const resetBtn  = el('timer-reset-btn');
  const subjRow   = el('timer-subject-row');

  // Remove all state classes
  clock.className = 'timer-clock';
  pill.className  = 'timer-status-pill';
  card.className  = 'timer-main-card';

  if (timerState === 'idle') {
    clock.textContent = '00:00:00'; label.textContent = 'Study Time';
    pill.textContent  = '● IDLE';
    startBtn.style.display='inline-block'; pauseBtn.style.display='none'; stopBtn.style.display='none'; resetBtn.style.display='none';
    subjRow.style.opacity='1'; subjRow.style.pointerEvents='all';
    el('break-setup').style.display='block'; el('break-active').style.display='none';
  } else if (timerState === 'studying') {
    clock.textContent=secToHMS(timerSecs); clock.classList.add('studying');
    label.textContent='Study Time'; pill.textContent='● STUDYING'; pill.classList.add('studying'); card.classList.add('studying');
    startBtn.style.display='none'; pauseBtn.style.display='inline-block'; stopBtn.style.display='inline-block'; resetBtn.style.display='none';
    subjRow.style.opacity='.5'; subjRow.style.pointerEvents='none';
    el('break-setup').style.display='block'; el('break-active').style.display='none';
  } else if (timerState === 'paused') {
    clock.textContent=secToHMS(timerSecs); clock.classList.add('paused');
    label.textContent='Paused'; pill.textContent='⏸ PAUSED'; pill.classList.add('paused'); card.classList.add('paused');
    startBtn.style.display='inline-block'; startBtn.textContent='▶ Resume';
    pauseBtn.style.display='none'; stopBtn.style.display='inline-block'; resetBtn.style.display='inline-block';
    subjRow.style.opacity='.5'; subjRow.style.pointerEvents='none';
    el('break-setup').style.display='block'; el('break-active').style.display='none';
  } else if (timerState === 'break') {
    clock.textContent=secToHMS(timerSecs); clock.classList.add('on-break');
    label.textContent='Study Time (paused)'; pill.textContent='☕ ON BREAK'; pill.classList.add('on-break'); card.classList.add('on-break');
    startBtn.style.display='none'; pauseBtn.style.display='none'; stopBtn.style.display='inline-block'; resetBtn.style.display='none';
    subjRow.style.opacity='.5'; subjRow.style.pointerEvents='none';
    el('break-setup').style.display='none'; el('break-active').style.display='block';
    el('break-countdown').textContent=secToHMS(breakSecs).slice(3); // MM:SS
    const pct = breakTotal>0 ? (breakSecs/breakTotal*100) : 0;
    el('break-progress-fill').style.width = pct+'%';
  }
}

// Write or clear the active_session field in profiles — friends see this in real-time
async function _setActiveSession(data) {
  if (!currentUser) return;
  try {
    await getDB().from('profiles').update({ active_session: data }).eq('username', currentUser);
  } catch(e) { /* silently ignore — not critical */ }
}

function timerStart() {
  if (timerState === 'idle' || timerState === 'paused') {
    if (timerState === 'idle') {
      timerSecs=0; _studyBaseSeconds=0;
      sessionStart=new Date().toISOString();
    }
    _studyWallStart = Date.now();
    timerState = 'studying';
    el('timer-start-btn').textContent = '▶ Start';
    timerInterval = setInterval(() => {
      timerSecs = _studyElapsed();
      renderTimerDisplay();
    }, 500);
    renderTimerDisplay();
    // ── Write active_session to Supabase so friends see live status ──
    _setActiveSession({ subject: timerSubject, startTime: sessionStart });
  }
}

function timerPause() {
  if (timerState === 'studying') {
    clearInterval(timerInterval); timerInterval=null;
    // Snapshot true elapsed so resume picks up from the right place
    _studyBaseSeconds = _studyElapsed();
    timerSecs = _studyBaseSeconds;
    _studyWallStart = null;
    timerState = 'paused';
    renderTimerDisplay();
  }
}

function timerStop() {
  // Always use wall-clock elapsed for accuracy
  const trueSecs = (timerState === 'studying') ? _studyElapsed() : _studyBaseSeconds;
  timerSecs = trueSecs;
  if (timerSecs < 10) { toast('Session too short — keep going!', 'var(--yellow)'); return; }
  clearInterval(timerInterval); timerInterval=null;
  clearInterval(breakInterval); breakInterval=null;

  // Save session
  const session = {
    id: Date.now(),
    date: getToday(),
    subject: timerSubject,
    durationSecs: timerSecs,
    startTime: sessionStart,
    endTime: new Date().toISOString()
  };
  studySessions.push(session);
  scheduleSave();

  timerState='idle'; timerSecs=0; breakSecs=0; breakTotal=0; sessionStart=null;
  _studyBaseSeconds=0; _studyWallStart=null; _breakBaseSeconds=0; _breakWallStart=null;
  el('timer-start-btn').textContent='▶ Start';
  el('break-setup').style.display='block'; el('break-active').style.display='none';
  renderTimerDisplay();
  renderTodaySessions();
  toast(`Session saved! ${secToLabel(session.durationSecs)} of ${session.subject} ✓`);
  checkAndAwardBadges();
  // ── Clear active_session so friends see you stopped ──
  _setActiveSession(null);
}

function timerReset() {
  if (!confirm('Discard current session?')) return;
  timerClearAll();
  timerState='idle'; timerSecs=0;
  _studyBaseSeconds=0; _studyWallStart=null; _breakBaseSeconds=0; _breakWallStart=null;
  el('timer-start-btn').textContent='▶ Start';
  renderTimerDisplay();
  // Clear active_session on discard too
  _setActiveSession(null);
}

function timerClearAll() {
  clearInterval(timerInterval); timerInterval=null;
  clearInterval(breakInterval); breakInterval=null;
}

function setBreakMins(m) {
  el('break-mins-inp').value = m;
}

function startBreak() {
  if (timerState !== 'studying' && timerState !== 'paused') {
    toast('Start the study timer first!', 'var(--yellow)'); return;
  }
  const mins = parseFloat(el('break-mins-inp').value);
  if (!mins || mins < 1) { toast('Enter a valid break duration', 'var(--yellow)'); return; }

  // Pause study timer if running
  clearInterval(timerInterval); timerInterval=null;
  breakTotal = Math.round(mins * 60);
  breakSecs  = breakTotal;
  timerState = 'break';
  // Snapshot study elapsed so it's accurate after break ends
  _studyBaseSeconds = _studyElapsed();
  _studyWallStart = null;

  _breakWallStart = Date.now();
  _breakBaseSeconds = breakTotal;
  breakInterval = setInterval(() => {
    breakSecs = Math.max(0, _breakRemaining());
    if (breakSecs <= 0) {
      clearInterval(breakInterval); breakInterval=null;
      _breakWallStart=null; _breakBaseSeconds=0;
      toast('Break over! Study timer resumed ▶', 'var(--green)');
      timerState = 'studying';
      _studyWallStart = Date.now();
      timerInterval = setInterval(() => { timerSecs = _studyElapsed(); renderTimerDisplay(); }, 500);
    }
    renderTimerDisplay();
  }, 500);

  renderTimerDisplay();
}

function endBreakEarly() {
  clearInterval(breakInterval); breakInterval=null;
  _breakWallStart=null; _breakBaseSeconds=0;
  toast('Break ended early — study timer resumed ▶', 'var(--accent)');
  timerState = 'studying';
  _studyWallStart = Date.now();
  timerInterval = setInterval(() => { timerSecs = _studyElapsed(); renderTimerDisplay(); }, 500);
  renderTimerDisplay();
}

function deleteSession(id) {
  studySessions = studySessions.filter(s=>s.id!==id);
  scheduleSave(); renderTodaySessions();
  if (timerHistTab==='history') renderTimerHistory();
}

function renderTodaySessions() {
  const todaySess = studySessions.filter(s=>s.date===getToday()).sort((a,b)=>b.id-a.id);
  const container = el('timer-today-sessions');
  if (!todaySess.length) {
    container.innerHTML='<div class="empty-state" style="padding:32px">No sessions recorded today. Start the timer to begin tracking!</div>'; return;
  }
  const totalSecs = todaySess.reduce((a,s)=>a+s.durationSecs,0);
  container.innerHTML=`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <span style="color:var(--muted);font-size:12px">${todaySess.length} session${todaySess.length!==1?'s':''} today</span>
      <span style="font-family:var(--mono);font-weight:900;color:var(--accent);font-size:14px">Total: ${secToLabel(totalSecs)}</span>
    </div>
    ${todaySess.map(s=>`
      <div class="session-item">
        <div class="session-subj-dot" style="background:${SUB_COLOR[s.subject]||'var(--accent)'}"></div>
        <div class="session-info">
          <div class="session-subj" style="color:${SUB_COLOR[s.subject]||'var(--text)'}">${s.subject}</div>
          <div class="session-time">${new Date(s.startTime).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})} → ${new Date(s.endTime).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</div>
        </div>
        <div class="session-dur">${secToLabel(s.durationSecs)}</div>
        <button class="session-delete" onclick="deleteSession(${s.id})" title="Delete session">✕</button>
      </div>`).join('')}`;
}

function renderTimerHistory() {
  const dim=new Date(thYear,thMonth+1,0).getDate(), fd=new Date(thYear,thMonth,1).getDay();
  let cal=`<div class="hwh-cal-wrap card mb24">
    <div class="hwh-cal-nav">
      <button class="cal-nav-btn" onclick="thCalPrev()">&#8249;</button>
      <div style="text-align:center"><div style="font-size:18px;font-weight:800">${MONTHS[thMonth]}</div><div style="font-size:11px;color:var(--muted);font-family:var(--mono)">${thYear}</div></div>
      <button class="cal-nav-btn" onclick="thCalNext()">&#8250;</button>
    </div>
    <div class="cal-day-labels"><div class="cal-day-label">Su</div><div class="cal-day-label">Mo</div><div class="cal-day-label">Tu</div><div class="cal-day-label">We</div><div class="cal-day-label">Th</div><div class="cal-day-label">Fr</div><div class="cal-day-label">Sa</div></div>
    <div class="hwh-cal-grid">`;
  for(let i=0;i<fd;i++) cal+='<div class="hwh-cal-cell empty"></div>';
  for(let d=1;d<=dim;d++){
    const ds=toDateStr(thYear,thMonth,d);
    const daySess=studySessions.filter(s=>s.date===ds);
    const totalSecs=daySess.reduce((a,s)=>a+s.durationSecs,0);
    const hasData=daySess.length>0;
    const cls=['hwh-cal-cell',hasData?'has-data':'',ds===getToday()?'today':'',ds===thSel?'selected':''].filter(Boolean).join(' ');
    cal+=`<div class="${cls}" onclick="thSelectDay('${ds}')">
      <span class="hwh-cell-num">${d}</span>
      ${hasData?`<span class="th-cal-cell-time">${secToLabel(totalSecs)}</span>`:''}
    </div>`;
  }
  cal+=`</div></div>`;

  const selSess = studySessions.filter(s=>s.date===thSel).sort((a,b)=>a.id-b.id);
  const selTotal = selSess.reduce((a,s)=>a+s.durationSecs,0);
  let detail=`<div class="hwh-detail-header">
    <div style="font-size:10px;font-family:var(--mono);color:var(--accent);letter-spacing:3px;margin-bottom:6px">SELECTED DAY</div>
    <div style="font-size:20px;font-weight:900">${thSel===getToday()?'Today':fmtDate(thSel)}</div>
    ${selTotal?`<div style="font-family:var(--mono);color:var(--accent);font-size:13px;margin-top:6px">Total: ${secToLabel(selTotal)}</div>`:''}
  </div>`;
  if(!selSess.length){detail+=`<div class="empty-state" style="padding:30px">No sessions on this day.</div>`;}
  else{detail+=selSess.map(s=>`
    <div class="session-item" style="background:var(--surface)">
      <div class="session-subj-dot" style="background:${SUB_COLOR[s.subject]||'var(--accent)'}"></div>
      <div class="session-info">
        <div class="session-subj" style="color:${SUB_COLOR[s.subject]||'var(--text)'}">${s.subject}</div>
        <div class="session-time">${new Date(s.startTime).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})} → ${new Date(s.endTime).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</div>
      </div>
      <div class="session-dur">${secToLabel(s.durationSecs)}</div>
      <button class="session-delete" onclick="deleteSession(${s.id});renderTimerHistory()" title="Delete">✕</button>
    </div>`).join('');}

  el('timer-history-content').innerHTML=`<div class="th-layout"><div>${cal}</div><div class="card hwh-detail">${detail}</div></div>`;
}

function thSelectDay(ds){ thSel=ds; renderTimerHistory(); }
function thCalPrev(){ thMonth===0?(thYear--,thMonth=11):thMonth--; renderTimerHistory(); }
function thCalNext(){ thMonth===11?(thYear++,thMonth=0):thMonth++; renderTimerHistory(); }

// ══════════════════════════════════════════════════════
// ANALYTICS
// ══════════════════════════════════════════════════════
function renderAnalytics() {
  // ─── Stats row ───
  const sdVals=Object.values(schoolDays);
  const present=sdVals.filter(v=>v==='present').length, total=sdVals.filter(v=>v!=='holiday').length;
  const attPct=total>0?Math.round(present/total*100):null;
  let allScores=[];
  SUBJECTS.forEach(s=>exams.forEach(ex=>{if(ex.marks[s]&&ex.marks[s].score!==''&&ex.marks[s].max>0)allScores.push(ex.marks[s].score/ex.marks[s].max*100);}));
  const avgPct=allScores.length?(allScores.reduce((a,v)=>a+v,0)/allScores.length).toFixed(1):null;
  const totalStudySecs=studySessions.reduce((a,s)=>a+s.durationSecs,0);
  const hwDays=Object.keys(homework).filter(d=>allHWKeys().some(k=>homework[d][k]));
  const hwDone=hwDays.reduce((a,d)=>a+allHWKeys().filter(k=>homework[d][k]&&homework[d][k].done).length,0);
  const hwTotal=hwDays.reduce((a,d)=>a+allHWKeys().filter(k=>homework[d][k]&&!homework[d][k].notGiven).length,0);
  const hwPct=hwTotal>0?Math.round(hwDone/hwTotal*100):null;

  // Best & weakest subject
  const subjAvgs=SUBJECTS.map(s=>{const sc=exams.map(ex=>ex.marks[s]).filter(m=>m&&m.score!==''&&m.max>0).map(m=>m.score/m.max*100);return{s,avg:sc.length?sc.reduce((a,v)=>a+v,0)/sc.length:null};});
  const ranked=subjAvgs.filter(x=>x.avg!==null).sort((a,b)=>b.avg-a.avg);
  const best=ranked[0], worst=ranked[ranked.length-1];

  // Most studied subject
  const studyBySubj={};SUBJECTS.forEach(s=>studyBySubj[s]=0);
  studySessions.forEach(s=>{if(studyBySubj[s.subject]!==undefined)studyBySubj[s.subject]+=s.durationSecs;});
  const mostStudied=Object.entries(studyBySubj).sort((a,b)=>b[1]-a[1])[0];

  const insights=[];
  if(best) insights.push({icon:'🏆',bg:'rgba(129,140,248,.15)',text:`Best subject: ${best.s}`,sub:`Average ${best.avg.toFixed(1)}%`});
  if(worst&&worst.s!==best?.s) insights.push({icon:'📌',bg:'rgba(248,113,113,.15)',text:`Needs work: ${worst.s}`,sub:`Average ${worst.avg.toFixed(1)}% — focus here`});
  if(mostStudied&&mostStudied[1]>0) insights.push({icon:'⏱',bg:'rgba(0,212,255,.1)',text:`Most studied: ${mostStudied[0]}`,sub:secToLabel(mostStudied[1])+' total'});
  if(hwPct!==null) insights.push({icon:'📚',bg:'rgba(52,211,153,.1)',text:`Homework done rate`,sub:`${hwPct}% of assigned homework completed`});

  let html=`
    <div class="analytics-stat-row">
      ${[
        {label:'Avg Score',val:avgPct?avgPct+'%':'—',color:'#818CF8'},
        {label:'Attendance',val:attPct!==null?attPct+'%':'—',color:'#34D399'},
        {label:'Total Study',val:totalStudySecs?secToLabel(totalStudySecs):'—',color:'#00D4FF'},
        {label:'HW Done Rate',val:hwPct!==null?hwPct+'%':'—',color:'#FBBF24'},
        {label:'Exams Taken',val:exams.length,color:'#C084FC'},
        {label:'Study Sessions',val:studySessions.length,color:'#F87171'},
      ].map(s=>`<div class="stat-card"><div class="stat-val" style="color:${s.color}">${s.val}</div><div class="stat-label">${s.label}</div></div>`).join('')}
    </div>`;

  if(insights.length){html+=`<div class="analytics-section"><div class="analytics-section-title">KEY INSIGHTS</div><div style="display:flex;flex-direction:column;gap:10px">${insights.map(i=>`<div class="insight-card"><div class="insight-icon" style="background:${i.bg}">${i.icon}</div><div><div class="insight-text">${i.text}</div><div class="insight-sub">${i.sub}</div></div></div>`).join('')}</div></div>`;}

  // Charts
  html+=`<div class="analytics-section"><div class="analytics-section-title">EXAM PERFORMANCE BY SUBJECT</div><div class="charts-grid" id="an-exam-charts"></div></div>`;
  html+=`<div class="analytics-section"><div class="grid-2"><div class="chart-card"><div class="chart-title">STUDY TIME</div><div class="chart-subtitle">By Subject</div><div class="chart-wrap-md"><canvas id="an-study-chart"></canvas></div></div><div class="chart-card"><div class="chart-title">ATTENDANCE</div><div class="chart-subtitle">Monthly Breakdown</div><div class="chart-wrap-md"><canvas id="an-att-chart"></canvas></div></div></div></div>`;
  html+=`<div class="analytics-section"><div class="chart-card"><div class="chart-title">EXAM TREND</div><div class="chart-subtitle">Overall % across all exams</div><div class="chart-wrap-md"><canvas id="an-trend-chart"></canvas></div></div></div>`;

  el('analytics-content').innerHTML=html;

  // Stale render guard: if renderAnalytics is called again while RAF is pending, skip old callbacks
  const analyticsGeneration = (renderAnalytics._gen = (renderAnalytics._gen||0) + 1);
  requestAnimationFrame(()=>{
    if (renderAnalytics._gen !== analyticsGeneration) return; // stale — a newer render is pending
    // Destroy old charts
    Object.keys(analyticsCharts).forEach(k=>{if(analyticsCharts[k]){analyticsCharts[k].destroy();delete analyticsCharts[k];}});

    // Per-subject exam performance radar/bar
    const examGrid=el('an-exam-charts');
    if(examGrid){
      SUBJECTS.forEach(subj=>{
        const pts=exams.map(ex=>({name:ex.name,pct:ex.marks[subj]&&ex.marks[subj].score!==''&&ex.marks[subj].max>0?(ex.marks[subj].score/ex.marks[subj].max*100).toFixed(1):null})).filter(p=>p.pct!==null);
        if(!pts.length)return;
        const div=document.createElement('div');div.className='chart-card';
        div.innerHTML=`<div class="chart-title">EXAM PERFORMANCE</div><div class="chart-subtitle" style="color:${SUB_COLOR[subj]}">${subj}</div><div class="chart-wrap"><canvas id="an-subj-${subj}"></canvas></div>`;
        examGrid.appendChild(div);
        requestAnimationFrame(()=>{const ctx=el('an-subj-'+subj);if(!ctx)return;analyticsCharts['subj_'+subj]=new Chart(ctx,{type:'line',data:{labels:pts.map(p=>p.name),datasets:[{label:'%',data:pts.map(p=>parseFloat(p.pct)),borderColor:SUB_COLOR[subj],backgroundColor:SUB_COLOR[subj]+'22',borderWidth:2.5,pointBackgroundColor:SUB_COLOR[subj],pointRadius:5,fill:true,tension:0.35}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{backgroundColor:'#0C1018',borderColor:SUB_COLOR[subj],borderWidth:1,titleColor:SUB_COLOR[subj],bodyColor:'#E2E8F0',callbacks:{label:c=>` ${c.parsed.y}%`}}},scales:{y:{min:0,max:100,grid:{color:'#1C243844'},ticks:{color:'#4B5E7A',callback:v=>v+'%'}},x:{grid:{color:'#1C243822'},ticks:{color:'#4B5E7A'}}}}});});
      });
    }

    // Study time by subject (doughnut)
    const studyCtx=el('an-study-chart');
    if(studyCtx){
      const studyData=SUBJECTS.map(s=>studySessions.filter(ss=>ss.subject===s).reduce((a,ss)=>a+ss.durationSecs,0));
      if(studyData.some(v=>v>0)){
        analyticsCharts['study']=new Chart(studyCtx,{type:'doughnut',data:{labels:SUBJECTS,datasets:[{data:studyData,backgroundColor:SUBJECTS.map(s=>SUB_COLOR[s]+'CC'),borderColor:SUBJECTS.map(s=>SUB_COLOR[s]),borderWidth:2}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{color:'#7A90AC',font:{family:'Outfit'},boxWidth:12,padding:12}},tooltip:{backgroundColor:'#0C1018',borderColor:'#1C2438',borderWidth:1,titleColor:'#E2E8F0',bodyColor:'#7A90AC',callbacks:{label:c=>`${c.label}: ${secToLabel(c.raw)}` }}}}});
      } else { studyCtx.parentElement.innerHTML+='<div style="text-align:center;color:var(--muted);font-size:13px;padding:20px">No study sessions yet</div>'; }
    }

    // Attendance chart
    const attCtx=el('an-att-chart');
    if(attCtx){
      const monthly={};Object.entries(schoolDays).forEach(([ds,st])=>{const[y,m]=ds.split('-'),k=`${y}-${m}`;if(!monthly[k])monthly[k]={present:0,absent:0};if(st==='present')monthly[k].present++;else if(st==='absent')monthly[k].absent++;});
      const keys=Object.keys(monthly).sort();
      if(keys.length){analyticsCharts['att']=new Chart(attCtx,{type:'bar',data:{labels:keys.map(k=>{const[y,m]=k.split('-');return MONTHS[parseInt(m)-1].slice(0,3)+' '+y.slice(2);}),datasets:[{label:'Present',data:keys.map(k=>monthly[k].present),backgroundColor:'rgba(52,211,153,0.8)',borderRadius:5},{label:'Absent',data:keys.map(k=>monthly[k].absent),backgroundColor:'rgba(248,113,113,0.8)',borderRadius:5}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#7A90AC',font:{family:'Outfit'},boxWidth:10}},tooltip:{backgroundColor:'#0C1018'}},scales:{x:{grid:{color:'#1C243822'},ticks:{color:'#4B5E7A'}},y:{grid:{color:'#1C243844'},ticks:{color:'#4B5E7A',stepSize:1},beginAtZero:true}}}});}
      else { attCtx.parentElement.innerHTML+='<div style="text-align:center;color:var(--muted);font-size:13px;padding:20px">No attendance data yet</div>'; }
    }

    // Overall exam trend
    const trendCtx=el('an-trend-chart');
    if(trendCtx&&exams.length){
      const trendData=exams.map(ex=>{const valid=SUBJECTS.map(s=>ex.marks[s]).filter(m=>m&&m.score!==''&&m.max>0);if(!valid.length)return null;const tot=valid.reduce((a,m)=>a+parseFloat(m.score),0),totMax=valid.reduce((a,m)=>a+parseFloat(m.max),0);return{name:ex.name,pct:parseFloat((tot/totMax*100).toFixed(1))};}).filter(Boolean);
      if(trendData.length){analyticsCharts['trend']=new Chart(trendCtx,{type:'line',data:{labels:trendData.map(p=>p.name),datasets:[{label:'Overall %',data:trendData.map(p=>p.pct),borderColor:'#818CF8',backgroundColor:'rgba(129,140,248,.15)',borderWidth:3,pointBackgroundColor:'#818CF8',pointRadius:6,pointHoverRadius:8,fill:true,tension:0.3}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{backgroundColor:'#0C1018',borderColor:'#818CF8',borderWidth:1,callbacks:{label:c=>` ${c.parsed.y}%`}}},scales:{y:{min:0,max:100,grid:{color:'#1C243844'},ticks:{color:'#4B5E7A',callback:v=>v+'%'}},x:{grid:{color:'#1C243822'},ticks:{color:'#4B5E7A'}}}}});}
    } else if(trendCtx){ trendCtx.parentElement.innerHTML+='<div style="text-align:center;color:var(--muted);font-size:13px;padding:20px">No exam data yet</div>'; }
  });
}

// ══════════════════════════════════════════════════════
// EXAMS
// ══════════════════════════════════════════════════════
function createExam(){const name=el('new-exam-name').value.trim();if(!name){toast('Please enter an exam name','var(--red)');return;}const marks={};SUBJECTS.forEach(s=>{marks[s]={score:'',max:''};});exams.push({id:Date.now(),name,date:el('new-exam-date').value,marks});el('new-exam-name').value='';el('new-exam-date').value='';closeModal('exam-modal');scheduleSave();renderExams();syncExamEvents();toast(`Exam "${name}" created ✓`);checkAndAwardBadges();setTimeout(()=>toggleExam(exams[exams.length-1].id),100);}
function deleteExam(id){if(!confirm('Delete this exam?'))return;exams=exams.filter(e=>e.id!==id);syncExamEvents();scheduleSave();renderExams();toast('Exam deleted');}
function toggleExam(id){const c=el('exam-card-'+id);if(c)c.classList.toggle('open');}
function updateMark(examId,subj,field,val){const ex=exams.find(e=>e.id===examId);if(!ex)return;if (val === '') {
    ex.marks[subj][field] = '';
  } else {
    const n = parseFloat(val);
    // Only store if it's a real number — ignore partial inputs like '-' or '.'
    if (!isNaN(n)) ex.marks[subj][field] = n;
  }scheduleSave();const pctEl=el(`pct-${examId}-${subj}`),barEl=el(`bar-${examId}-${subj}`);const s=ex.marks[subj].score,m=ex.marks[subj].max;if(s!==''&&m!==''&&m>0){const pct=(s/m*100).toFixed(1);const col=pct>=75?'var(--green)':pct>=60?'var(--yellow)':'var(--red)';if(pctEl){pctEl.textContent=pct+'%';pctEl.style.color=col;}if(barEl){barEl.style.width=pct+'%';barEl.style.background=SUB_COLOR[subj];}}else{if(pctEl)pctEl.textContent='';if(barEl)barEl.style.width='0%';}updateExamOverall(examId);}
function updateExamOverall(examId){const ex=exams.find(e=>e.id===examId);const oEl=el('exam-overall-'+examId);if(!oEl||!ex)return;const valid=SUBJECTS.map(s=>ex.marks[s]).filter(m=>m.score!==''&&m.max!==''&&parseFloat(m.max)>0);if(!valid.length){oEl.innerHTML='<span style="color:var(--muted);font-size:13px">Enter marks to see total</span>';return;}const tot=valid.reduce((a,m)=>a+parseFloat(m.score),0),totMax=valid.reduce((a,m)=>a+parseFloat(m.max),0);const pct=(tot/totMax*100).toFixed(1);const col=pct>=75?'var(--green)':pct>=60?'var(--yellow)':'var(--red)';oEl.innerHTML=`<span style="color:var(--muted);font-size:13px">Total: <b style="color:var(--text)">${tot}/${totMax}</b></span><span class="exam-overall-val" style="color:${col}">${pct}%</span>`;}
function renderExams(){syncExamEvents();el('exam-subj-cards').innerHTML=SUBJECTS.map(subj=>{const scores=exams.map(ex=>ex.marks[subj]).filter(m=>m&&m.score!==''&&m.max>0).map(m=>m.score/m.max*100);const avg=scores.length?(scores.reduce((a,v)=>a+v,0)/scores.length).toFixed(1):null;const best=scores.length?Math.max(...scores).toFixed(0):null;const col=avg>=75?SUB_COLOR[subj]:avg?'#EF4444':'var(--muted)';return `<div class="subj-summary-card" style="border-color:${avg>=75?SUB_COLOR[subj]+'44':'var(--border)'}"><div class="subj-name-label" style="color:${SUB_COLOR[subj]}">${subj}</div><div class="subj-avg" style="color:${col}">${avg?avg+'%':'—'}</div><div class="subj-card-sub">${scores.length} result${scores.length!==1?'s':''}${best?' · best '+best+'%':''}</div></div>`;}).join('');if(!exams.length){el('exam-list').innerHTML='<div class="card empty-state">No exams yet — click "+ New Exam" to get started!</div>';}else{el('exam-list').innerHTML=exams.map(ex=>{const valid=SUBJECTS.map(s=>ex.marks[s]).filter(m=>m.score!==''&&m.max!==''&&parseFloat(m.max)>0);const tot=valid.reduce((a,m)=>a+parseFloat(m.score),0),totMax=valid.reduce((a,m)=>a+parseFloat(m.max),0);const pct=valid.length?(tot/totMax*100).toFixed(1):null;const col=pct>=75?'var(--green)':pct>=60?'var(--yellow)':pct?'var(--red)':'var(--muted)';return `<div class="exam-card" id="exam-card-${ex.id}"><div class="exam-header" onclick="toggleExam(${ex.id})"><div class="exam-header-left"><div class="exam-name">${ex.name}</div><div class="exam-meta">${ex.date?fmtDate(ex.date)+' · ':''}${valid.length}/${SUBJECTS.length} subjects${pct?' · '+pct+'%':''}</div></div>${pct?`<span style="font-family:var(--mono);font-weight:900;font-size:20px;color:${col}">${pct}%</span>`:''}<button class="btn-danger" onclick="event.stopPropagation();deleteExam(${ex.id})" style="margin-right:8px">Delete</button><span class="exam-chevron">›</span></div><div class="exam-body"><div class="exam-subjects-grid">${SUBJECTS.map(s=>{const m=ex.marks[s]||{score:'',max:''};const has=m.score!==''&&m.max!==''&&parseFloat(m.max)>0;const p=has?(parseFloat(m.score)/parseFloat(m.max)*100).toFixed(1):null;const pc=p>=75?'var(--green)':p>=60?'var(--yellow)':'var(--red)';return `<div class="exam-subj-cell"><div class="exam-subj-name" style="color:${SUB_COLOR[s]}">${s}</div><div class="exam-subj-inputs"><input class="exam-score-inp" type="number" placeholder="Score" value="${m.score!==''?m.score:''}" oninput="updateMark(${ex.id},'${s}','score',this.value)" style="border-color:${has?SUB_COLOR[s]+'44':'var(--border)'}"/><span class="exam-score-sep">/</span><input class="exam-score-inp" type="number" placeholder="Max" value="${m.max!==''?m.max:''}" oninput="updateMark(${ex.id},'${s}','max',this.value)"/></div><div id="pct-${ex.id}-${s}" class="exam-score-pct" style="color:${pc}">${p?p+'%':''}</div><div class="exam-subj-result"><div class="exam-subj-result-fill" id="bar-${ex.id}-${s}" style="width:${p||0}%;background:${SUB_COLOR[s]}"></div></div></div>`;}).join('')}</div><div class="exam-overall" id="exam-overall-${ex.id}">${pct?`<span style="color:var(--muted);font-size:13px">Total: <b style="color:var(--text)">${tot}/${totMax}</b></span><span class="exam-overall-val" style="color:${col}">${pct}%</span>`:'<span style="color:var(--muted);font-size:13px">Enter marks to see total</span>'}</div></div></div>`;}).join('');}renderExamCharts();}
function renderExamCharts(){const grid=el('exam-charts-grid');grid.innerHTML='';const chartGen=(renderExamCharts._gen=(renderExamCharts._gen||0)+1);const has=exams.some(ex=>SUBJECTS.some(s=>ex.marks[s]&&ex.marks[s].score!==''&&ex.marks[s].max>0));el('exam-charts-section').style.display=has?'':'none';if(!has)return;SUBJECTS.forEach(subj=>{const pts=exams.map(ex=>({name:ex.name,pct:ex.marks[subj]&&ex.marks[subj].score!==''&&ex.marks[subj].max>0?(ex.marks[subj].score/ex.marks[subj].max*100).toFixed(1):null})).filter(p=>p.pct!==null);if(!pts.length)return;const div=document.createElement('div');div.className='chart-card';div.innerHTML=`<div class="chart-title">EXAM PERFORMANCE</div><div class="chart-subtitle" style="color:${SUB_COLOR[subj]}">${subj}</div><div class="chart-wrap"><canvas id="chart-${subj}"></canvas></div>`;grid.appendChild(div);requestAnimationFrame(()=>{if(renderExamCharts._gen!==chartGen)return;const ctx=el('chart-'+subj);if(!ctx)return;if(markCharts[subj])markCharts[subj].destroy();markCharts[subj]=new Chart(ctx,{type:'line',data:{labels:pts.map(p=>p.name),datasets:[{label:'% Score',data:pts.map(p=>parseFloat(p.pct)),borderColor:SUB_COLOR[subj],backgroundColor:SUB_COLOR[subj]+'22',borderWidth:2.5,pointBackgroundColor:SUB_COLOR[subj],pointRadius:5,pointHoverRadius:7,fill:true,tension:0.35}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{backgroundColor:'#0C1018',borderColor:SUB_COLOR[subj],borderWidth:1,titleColor:SUB_COLOR[subj],bodyColor:'#E2E8F0',callbacks:{label:c=>` ${c.parsed.y}%`}}},scales:{y:{min:0,max:100,grid:{color:'#1C243844'},ticks:{color:'#4B5E7A',callback:v=>v+'%'}},x:{grid:{color:'#1C243822'},ticks:{color:'#4B5E7A'}}}}});});});}

// ══════════════════════════════════════════════════════
// ATTENDANCE
// ══════════════════════════════════════════════════════
function renderAttendance(){renderCalendar();renderAttPanel();renderAttChart();}
function renderCalendar(){el('cal-month-name').textContent=MONTHS[calMonth];el('cal-year-label').textContent=calYear;const mk=`${calYear}-${String(calMonth+1).padStart(2,'0')}`;const mp=Object.entries(schoolDays).filter(([k,v])=>k.startsWith(mk)&&v==='present').length;const ma=Object.entries(schoolDays).filter(([k,v])=>k.startsWith(mk)&&v==='absent').length;const mh=Object.entries(schoolDays).filter(([k,v])=>k.startsWith(mk)&&v==='holiday').length;const mt=mp+ma,mpct=mt>0?Math.round(mp/mt*100):null;el('cal-pills').innerHTML=`<span class="pill pill-green" style="font-size:10px;padding:4px 10px">✓ ${mp} Present</span><span class="pill pill-red" style="font-size:10px;padding:4px 10px">✕ ${ma} Absent</span><span class="pill pill-yellow" style="font-size:10px;padding:4px 10px">☀ ${mh} Holiday</span>${mpct!==null?`<span class="pill pill-accent" style="font-size:10px;padding:4px 10px">${mpct}% Rate</span>`:''}`;const dim=new Date(calYear,calMonth+1,0).getDate(),fd=new Date(calYear,calMonth,1).getDay();let h='';for(let i=0;i<fd;i++)h+='<div class="cal-cell empty"></div>';for(let d=1;d<=dim;d++){const ds=toDateStr(calYear,calMonth,d);const st=schoolDays[ds]||'';const cls=['cal-cell',st,ds===selDate?'selected':'',ds===getToday()?'today':'',ds>getToday()?'future':''].filter(Boolean).join(' ');h+=`<div class="${cls}" onclick="selectCalDay('${ds}')">${d}</div>`;}el('cal-grid').innerHTML=h;}
function selectCalDay(ds){if(ds>getToday())return;selDate=ds;renderCalendar();renderAttPanel();}
function renderAttPanel(){el('att-selected-label').textContent=fmtDate(selDate);const st=schoolDays[selDate];el('att-btn-present').className='att-btn'+(st==='present'?' present-active':'');el('att-btn-absent').className='att-btn'+(st==='absent'?' absent-active':'');el('att-btn-holiday').className='att-btn'+(st==='holiday'?' holiday-active':'');el('att-clear-btn').style.display=st?'block':'none';const sv=Object.values(schoolDays),p=sv.filter(v=>v==='present').length,a=sv.filter(v=>v==='absent').length,h=sv.filter(v=>v==='holiday').length,tot=p+a;el('att-overall-stats').innerHTML=[['Days Present',p,'var(--green)'],['Days Absent',a,'var(--red)'],['Holidays',h,'var(--yellow)'],['Attendance %',tot>0?Math.round(p/tot*100)+'%':'—','var(--accent)']].map(([l,v,c])=>`<div class="stats-row"><span style="color:var(--muted);font-size:13px">${l}</span><span class="stats-row-val" style="color:${c}">${v}</span></div>`).join('');}
function markDay(st){schoolDays[selDate]===st?delete schoolDays[selDate]:(schoolDays[selDate]=st);scheduleSave();renderCalendar();renderAttPanel();renderAttChart();}
function clearDay(){delete schoolDays[selDate];scheduleSave();renderCalendar();renderAttPanel();renderAttChart();}
function calPrev(){calMonth===0?(calYear--,calMonth=11):calMonth--;renderCalendar();}
function calNext(){calMonth===11?(calYear++,calMonth=0):calMonth++;renderCalendar();}
function renderAttChart(){const monthly={};Object.entries(schoolDays).forEach(([ds,st])=>{const[y,m]=ds.split('-'),k=`${y}-${m}`;if(!monthly[k])monthly[k]={present:0,absent:0,holiday:0};monthly[k][st]++;});const keys=Object.keys(monthly).sort();if(!keys.length){el('att-chart-card').style.display='none';return;}el('att-chart-card').style.display='';if(chartAtt)chartAtt.destroy();chartAtt=new Chart(el('chart-attendance'),{type:'bar',data:{labels:keys.map(k=>{const[y,m]=k.split('-');return MONTHS[parseInt(m)-1].slice(0,3)+' '+y.slice(2);}),datasets:[{label:'Present',data:keys.map(k=>monthly[k].present),backgroundColor:'rgba(52,211,153,0.8)',borderRadius:5},{label:'Absent',data:keys.map(k=>monthly[k].absent),backgroundColor:'rgba(248,113,113,0.8)',borderRadius:5},{label:'Holiday',data:keys.map(k=>monthly[k].holiday),backgroundColor:'rgba(251,191,36,0.6)',borderRadius:5}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#7A90AC',font:{family:'Outfit'},boxWidth:12}},tooltip:{backgroundColor:'#0C1018',borderColor:'#1C2438',borderWidth:1,titleColor:'#E2E8F0',bodyColor:'#7A90AC'}},scales:{x:{grid:{color:'#1C243822'},ticks:{color:'#4B5E7A'}},y:{grid:{color:'#1C243844'},ticks:{color:'#4B5E7A',stepSize:1},beginAtZero:true}}}});}

// ══════════════════════════════════════════════════════
// HOMEWORK
// ══════════════════════════════════════════════════════
function renderHomework(){el('hw-date-display').textContent=hwDate===getToday()?'Today — '+fmtDate(hwDate):fmtDate(hwDate);el('hw-date-picker').value=hwDate;renderHWGrid();if(hwTab==='history')renderHWHistory();}
function renderHWGrid(){
  const day = homework[hwDate]||{};
  let html = '';
  SUBJECTS.forEach(s => {
    if (SUB_PARTS[s]) {
      // Show parent as a section header, then each sub-part as a box
      const partCount = SUB_PARTS[s].length;
      html += `<div class="hw-subject-group">
        <div class="hw-group-header" style="border-left:3px solid ${SUB_COLOR[s]}">
          <span style="color:${SUB_COLOR[s]};font-weight:900;font-size:13px">${s}</span>
          <span style="color:var(--muted);font-size:11px">${partCount} parts</span>
        </div>
        <div class="hw-group-parts" style="grid-template-columns:repeat(${partCount},1fr)">`;
      SUB_PARTS[s].forEach(part => {
        const key = s+':'+part;
        const d = day[key]||{text:'',notGiven:false,done:false};
        const ng=d.notGiven, done=d.done;
        let badge='';
        if(ng)    badge=`<span class="hw-subj-status-badge badge-yellow">Not Given</span>`;
        else if(done) badge=`<span class="hw-subj-status-badge badge-green">✓ Done</span>`;
        else if(d.text) badge=`<span class="hw-subj-status-badge badge-blue">Pending</span>`;
        const col = hwKeyColor(key);
        html += `<div class="hw-subj-box ${done?'hw-box-done':''}" id="hwbox-${key.replace(':','-')}">
          <div class="hw-subj-box-header">
            <div class="hw-subj-box-name" style="color:${col}">${part}</div>${badge}
          </div>
          <textarea class="hw-textarea" placeholder="Write ${part} homework..." ${ng?'disabled':''} oninput="saveHWText('${key}',this.value)">${d.text||''}</textarea>
          <div class="hw-box-actions">
            <button class="hw-not-given-btn ${ng?'active':''}" onclick="toggleHWNotGiven('${key}')">${ng?'✕ Remove "Not Given"':'☑ Not Given'}</button>
            <button class="hw-done-btn ${done?'active':''}" onclick="toggleHWDone('${key}')" ${ng||!d.text?'disabled':''}>${done?'↩ Undo Done':'✓ Mark Done'}</button>
          </div>
        </div>`;
      });
      html += `</div></div>`;
    } else {
      const d = day[s]||{text:'',notGiven:false,done:false};
      const ng=d.notGiven, done=d.done;
      let badge='';
      if(ng)    badge=`<span class="hw-subj-status-badge badge-yellow">Not Given</span>`;
      else if(done) badge=`<span class="hw-subj-status-badge badge-green">✓ Done</span>`;
      else if(d.text) badge=`<span class="hw-subj-status-badge badge-blue">Pending</span>`;
      html += `<div class="hw-subj-box ${done?'hw-box-done':''}" id="hwbox-${s}">
        <div class="hw-subj-box-header">
          <div class="hw-subj-box-name" style="color:${SUB_COLOR[s]}">${s}</div>${badge}
        </div>
        <textarea class="hw-textarea" placeholder="Write homework here..." ${ng?'disabled':''} oninput="saveHWText('${s}',this.value)">${d.text||''}</textarea>
        <div class="hw-box-actions">
          <button class="hw-not-given-btn ${ng?'active':''}" onclick="toggleHWNotGiven('${s}')">${ng?'✕ Remove "Not Given"':'☑ Not Given'}</button>
          <button class="hw-done-btn ${done?'active':''}" onclick="toggleHWDone('${s}')" ${ng||!d.text?'disabled':''}>${done?'↩ Undo Done':'✓ Mark Done'}</button>
        </div>
      </div>`;
    }
  });
  el('hw-subjects-grid').innerHTML = html;
}
function saveHWText(subj, text) {
  if (!homework[hwDate]) homework[hwDate] = {};
  if (!homework[hwDate][subj]) homework[hwDate][subj] = {text:'', notGiven:false, done:false};
  homework[hwDate][subj].text = text;
  if (!text && !homework[hwDate][subj].notGiven && !homework[hwDate][subj].done)
    delete homework[hwDate][subj];
  // Remove date key entirely if no subjects remain, to avoid bloating saved data
  if (homework[hwDate] && Object.keys(homework[hwDate]).length === 0)
    delete homework[hwDate];
  scheduleSave();
  // Update only the badge + done button in-place — never re-render the whole grid
  // (re-rendering would destroy the focused textarea and stop typing after 1 letter)
  updateHWBoxUI(subj);
}

function updateHWBoxUI(subj) {
  const boxId = 'hwbox-' + subj.replace(':','-');
  const box = el(boxId);
  if (!box) return;
  const d = (homework[hwDate] && homework[hwDate][subj]) || {text:'', notGiven:false, done:false};
  // Update badge
  const header = box.querySelector('.hw-subj-box-header');
  const existingBadge = header.querySelector('.hw-subj-status-badge');
  if (existingBadge) existingBadge.remove();
  let badgeHTML = '';
  if (d.notGiven)    badgeHTML = '<span class="hw-subj-status-badge badge-yellow">Not Given</span>';
  else if (d.done)   badgeHTML = '<span class="hw-subj-status-badge badge-green">✓ Done</span>';
  else if (d.text)   badgeHTML = '<span class="hw-subj-status-badge badge-blue">Pending</span>';
  if (badgeHTML) header.insertAdjacentHTML('beforeend', badgeHTML);
  // Update done button
  const doneBtn = box.querySelector('.hw-done-btn');
  if (doneBtn) {
    doneBtn.disabled = d.notGiven || !d.text;
    doneBtn.className = 'hw-done-btn' + (d.done ? ' active' : '');
    doneBtn.textContent = d.done ? '↩ Undo Done' : '✓ Mark Done';
  }
  // Update box styling
  box.classList.toggle('hw-box-done', !!d.done);
}
function toggleHWNotGiven(subj) {
  if (!homework[hwDate]) homework[hwDate] = {};
  if (!homework[hwDate][subj]) homework[hwDate][subj] = {text:'', notGiven:false, done:false};
  const cur = homework[hwDate][subj].notGiven;
  homework[hwDate][subj].notGiven = !cur;
  if (!cur) { homework[hwDate][subj].text = ''; homework[hwDate][subj].done = false; }
  if (!homework[hwDate][subj].text && !homework[hwDate][subj].notGiven) delete homework[hwDate][subj];
  // Clean up empty date entry to avoid bloating saved data
  if (homework[hwDate] && Object.keys(homework[hwDate]).length === 0) delete homework[hwDate];
  scheduleSave();
  // Update textarea disabled state and rest of UI in-place
  const box = el('hwbox-' + subj);
  if (box) {
    const ta = box.querySelector('.hw-textarea');
    const ng = !cur; // new notGiven state
    if (ta) { ta.disabled = ng; if (ng) ta.value = ''; }
    const ngBtn = box.querySelector('.hw-not-given-btn');
    if (ngBtn) { ngBtn.className = 'hw-not-given-btn' + (ng ? ' active' : ''); ngBtn.textContent = ng ? '✕ Remove "Not Given"' : '☑ Not Given'; }
  }
  updateHWBoxUI(subj);
}
function toggleHWDone(subj) {
  if (!homework[hwDate] || !homework[hwDate][subj]) return;
  homework[hwDate][subj].done = !homework[hwDate][subj].done;
  scheduleSave();
  updateHWBoxUI(subj);
}
function hwDateShift(dir){const d=new Date(hwDate+'T12:00:00');d.setDate(d.getDate()+dir);hwDate=d.toISOString().split('T')[0];renderHomework();}
function hwGoToday(){hwDate=getToday();renderHomework();}
function hwPickDate(v){if(v){hwDate=v;renderHomework();}}
function switchHWTab(tab){hwTab=tab;el('hw-tab-daily').classList.toggle('active',tab==='daily');el('hw-tab-history').classList.toggle('active',tab==='history');el('hw-daily-view').style.display=tab==='daily'?'block':'none';el('hw-history-view').style.display=tab==='history'?'block':'none';if(tab==='history')renderHWHistory();}
function renderHWHistory(){const dim=new Date(hwHistoryYear,hwHistoryMonth+1,0).getDate(),fd=new Date(hwHistoryYear,hwHistoryMonth,1).getDay();let cal=`<div class="hwh-cal-wrap card mb24"><div class="hwh-cal-nav"><button class="cal-nav-btn" onclick="hwhCalPrev()">&#8249;</button><div style="text-align:center"><div style="font-size:18px;font-weight:800">${MONTHS[hwHistoryMonth]}</div><div style="font-size:11px;color:var(--muted);font-family:var(--mono)">${hwHistoryYear}</div></div><button class="cal-nav-btn" onclick="hwhCalNext()">&#8250;</button></div><div class="cal-day-labels"><div class="cal-day-label">Su</div><div class="cal-day-label">Mo</div><div class="cal-day-label">Tu</div><div class="cal-day-label">We</div><div class="cal-day-label">Th</div><div class="cal-day-label">Fr</div><div class="cal-day-label">Sa</div></div><div class="hwh-cal-grid">`;for(let i=0;i<fd;i++)cal+='<div class="hwh-cal-cell empty"></div>';for(let d=1;d<=dim;d++){const ds=toDateStr(hwHistoryYear,hwHistoryMonth,d);const dd=homework[ds]||{};const ents=allHWKeys().filter(k=>dd[k]);let dots='';if(ents.some(k=>dd[k].done))dots+=`<span class="hwh-dot" style="background:var(--green)"></span>`;if(ents.some(k=>dd[k].text&&!dd[k].done&&!dd[k].notGiven))dots+=`<span class="hwh-dot" style="background:var(--accent)"></span>`;if(ents.some(k=>dd[k].notGiven))dots+=`<span class="hwh-dot" style="background:var(--yellow)"></span>`;const cls=['hwh-cal-cell',ents.length?'has-data':'',ds===getToday()?'today':'',ds===hwHistorySel?'selected':''].filter(Boolean).join(' ');cal+=`<div class="${cls}" onclick="selectHWHistoryDay('${ds}')"><span class="hwh-cell-num">${d}</span><div class="hwh-dots">${dots}</div></div>`;}cal+=`</div><div class="hwh-legend"><span class="hwh-legend-item"><span class="hwh-dot" style="background:var(--green)"></span>Done</span><span class="hwh-legend-item"><span class="hwh-dot" style="background:var(--accent)"></span>Pending</span><span class="hwh-legend-item"><span class="hwh-dot" style="background:var(--yellow)"></span>Not Given</span></div></div>`;const sd=homework[hwHistorySel]||{};const se=allHWKeys().filter(k=>sd[k]);let detail=`<div class="hwh-detail-header"><div style="font-size:10px;font-family:var(--mono);color:var(--accent);letter-spacing:3px;margin-bottom:6px">SELECTED DAY</div><div style="font-size:20px;font-weight:900">${hwHistorySel===getToday()?'Today':fmtDate(hwHistorySel)}</div></div>`;if(!se.length){detail+=`<div class="empty-state" style="padding:30px">No homework recorded for this day.</div>`;}else{detail+=`<div class="hwh-subj-list">`+allHWKeys().filter(k=>sd[k]).map(k=>{const d=sd[k];let badge,cls;if(d.notGiven){badge='Not Given';cls='badge-yellow';}else if(d.done){badge='✓ Done';cls='badge-green';}else{badge='Pending';cls='badge-blue';}const col=hwKeyColor(k);const lbl=hwKeyLabel(k);return `<div class="hwh-subj-row"><div class="hwh-subj-row-left"><div class="hwh-subj-dot" style="background:${col}"></div><div><div style="font-weight:800;font-size:13px;color:${col}">${lbl}</div>${d.notGiven?`<div style="color:var(--yellow);font-size:12px;font-style:italic;margin-top:3px">Homework not given</div>`:`<div style="color:var(--muted-light);font-size:13px;margin-top:3px;line-height:1.5">${d.text||'—'}</div>`}</div></div><span class="hw-subj-status-badge ${cls}">${badge}</span></div>`;}).join('')+`</div>`;}el('hw-history-content').innerHTML=`<div class="hwh-layout"><div>${cal}</div><div class="card hwh-detail">${detail}</div></div>`;}
function selectHWHistoryDay(ds){hwHistorySel=ds;renderHWHistory();}
function hwhCalPrev(){hwHistoryMonth===0?(hwHistoryYear--,hwHistoryMonth=11):hwHistoryMonth--;renderHWHistory();}
function hwhCalNext(){hwHistoryMonth===11?(hwHistoryYear++,hwHistoryMonth=0):hwHistoryMonth++;renderHWHistory();}

// ══════════════════════════════════════════════════════
// TIMETABLE
// ══════════════════════════════════════════════════════
const TT_EXTRAS=['Break','PT','Library','Assembly'];
function renderTimetable(){let h=`<thead><tr><th>PERIOD</th>${DAYS_TT.map(d=>`<th>${d.slice(0,3).toUpperCase()}</th>`).join('')}</tr></thead><tbody>`;PERIODS.forEach(p=>{h+=`<tr><td>${p}</td>`;DAYS_TT.forEach(day=>{const val=(timetable[day]||{})[p]||'';const col=SUBJECTS.includes(val)?SUB_COLOR[val]:val?'var(--accent)':'';const cid=`tt-${day}-${p}`;if(editCell===cid){h+=`<td><select class="tt-select" onchange="saveTTCell('${day}','${p}',this.value)" onblur="cancelTTEdit()" id="${cid}-sel"><option value="">— Empty —</option>${SUBJECTS.map(s=>`<option value="${s}" ${val===s?'selected':''}>${s}</option>`).join('')}${TT_EXTRAS.map(s=>`<option value="${s}" ${val===s?'selected':''}>${s}</option>`).join('')}</select></td>`;}else{h+=`<td><div class="tt-cell ${val?'filled':''}" id="${cid}" style="${val?`background:${col}15;border-color:${col}33;color:${col}`:''}" onclick="editTTCell('${day}','${p}')">${val||'+'}</div></td>`;}});h+='</tr>';});h+='</tbody>';el('tt-table').innerHTML=h;if(editCell){const s=el(editCell+'-sel');if(s)s.focus();}}
function editTTCell(day,period){editCell=`tt-${day}-${period}`;renderTimetable();}
function cancelTTEdit(){setTimeout(()=>{editCell=null;renderTimetable();},150);}
function saveTTCell(day,period,val){if(!timetable[day])timetable[day]={};if(val)timetable[day][period]=val;else delete timetable[day][period];scheduleSave();editCell=null;renderTimetable();}

// ══════════════════════════════════════════════════════
// PROFILE
// ══════════════════════════════════════════════════════
function renderProfile(){const bannerEl=el('profile-banner');let existingImg=bannerEl.querySelector('.profile-banner-bg');if(currentBanner){if(!existingImg){existingImg=document.createElement('img');existingImg.className='profile-banner-bg';bannerEl.insertBefore(existingImg,bannerEl.firstChild);}existingImg.src=currentBanner;el('remove-banner-btn')&&(el('remove-banner-btn').style.display='inline-flex');}else{if(existingImg)existingImg.remove();el('remove-banner-btn')&&(el('remove-banner-btn').style.display='none');}if(currentAvatar){el('profile-avatar-img').src=currentAvatar;el('profile-avatar-img').style.display='block';el('profile-avatar-display').style.display='none';}else{el('profile-avatar-img').style.display='none';el('profile-avatar-display').style.display='flex';el('profile-avatar-display').textContent=(currentDisplay||currentUser||'?')[0].toUpperCase();}el('profile-display-name-text').textContent=currentDisplay||currentUser||'—';el('profile-username-text').textContent='@'+(currentUser||'—');el('prof-display-inp').value=currentDisplay||'';el('prof-old-pass').value='';el('prof-new-pass').value='';el('prof-new-pass2').value='';el('prof-pass-error').textContent='';
  const tpEl=el('profile-theme-picker');
  if(tpEl) tpEl.innerHTML=renderThemePicker();
  const disEl=el('profile-disable-section');
  if(disEl) disEl.innerHTML=renderDisableSection();
  const vacEl=el('profile-vacation-section');
  if(vacEl) vacEl.innerHTML=renderVacationSection();
  const badgeEl=el('profile-badges-section');
  if(badgeEl) badgeEl.innerHTML=renderBadgesSection();
}
async function saveDisplayName() {
  const newName = el('prof-display-inp').value.trim();
  if (!newName) { toast('Display name cannot be empty', 'var(--red)'); return; }
  // Update local state immediately (consistent with avatar/banner pattern)
  currentDisplay = newName;
  saveSession(); updateSidebarUI(); renderProfile();
  try {
    await getDB().from('profiles').update({ display_name: newName }).eq('username', currentUser);
    toast('Display name updated ✓');
  } catch(e) { toast('Saved locally — cloud sync may retry later', 'var(--yellow)'); }
}
async function changePassword(){const oldPass=el('prof-old-pass').value,newPass=el('prof-new-pass').value,conf=el('prof-new-pass2').value,errEl=el('prof-pass-error');errEl.textContent='';if(!oldPass||!newPass||!conf){errEl.textContent='Fill in all fields.';return;}if(newPass!==conf){errEl.textContent='New passwords do not match.';return;}if(newPass.length<4){errEl.textContent='Password must be at least 4 characters.';return;}try{const client=getDB();const{data:profile}=await client.from('profiles').select('password_hash').eq('username',currentUser).single();const oldHashed=await hashPassword(oldPass);if(profile.password_hash!==oldPass&&profile.password_hash!==oldHashed){errEl.textContent='Current password is incorrect.';return;}const newHashed=await hashPassword(newPass);
    await client.from('profiles').update({password_hash:newHashed}).eq('username',currentUser);
    el('prof-old-pass').value='';el('prof-new-pass').value='';el('prof-new-pass2').value='';
    toast('Password changed ✓');
  }catch(e){errEl.textContent='Failed to update password. Try again.';}}
async function uploadAvatar(input) {
  const file = input.files[0]; if (!file) return;
  try {
    const base64 = await compressImage(file, 300, 300, 0.85);
    // Save to memory + localStorage immediately so it survives refresh
    currentAvatar = base64;
    saveSession();
    updateSidebarUI();
    renderProfile();
    // Then persist to Supabase
    const { error } = await getDB().from('profiles').update({ avatar: base64 }).eq('username', currentUser);
    if (error) throw error;
    toast('Profile picture updated ✓');
  } catch(e) {
    console.error('uploadAvatar error:', e);
    // Already saved to localStorage above, so it still works locally
    toast('Saved locally — run SQL to enable cloud sync for profile pictures', 'var(--yellow)');
  }
  input.value = '';
}
async function uploadBanner(input) {
  const file = input.files[0]; if (!file) return;
  try {
    const base64 = await compressImage(file, 1200, 300, 0.85);
    // Save to memory + localStorage immediately
    currentBanner = base64;
    saveSession();
    renderProfile();
    // Then persist to Supabase
    const { error } = await getDB().from('profiles').update({ banner: base64 }).eq('username', currentUser);
    if (error) throw error;
    toast('Banner updated ✓');
  } catch(e) {
    console.error('uploadBanner error:', e);
    toast('Saved locally — run SQL to enable cloud sync for banners', 'var(--yellow)');
  }
  input.value = '';
}
async function removeAvatar() {
  if (!confirm('Remove profile picture?')) return;
  // Update local state immediately
  currentAvatar = null;
  saveSession(); updateSidebarUI(); renderProfile();
  try {
    await getDB().from('profiles').update({ avatar: null }).eq('username', currentUser);
    toast('Profile picture removed');
  } catch(e) { toast('Removed locally — sync may retry later', 'var(--yellow)'); }
}
async function removeBanner() {
  if (!confirm('Remove banner?')) return;
  // Update local state immediately
  currentBanner = null;
  saveSession(); renderProfile();
  try {
    await getDB().from('profiles').update({ banner: null }).eq('username', currentUser);
    toast('Banner removed');
  } catch(e) { toast('Removed locally — sync may retry later', 'var(--yellow)'); }
}



// ══════════════════════════════════════════════════════
// THEMES
// ══════════════════════════════════════════════════════
const THEMES = [
  { id:'cyber',     name:'Cyber',     dark:true,  accent:'#00D4FF', bg:'#07090F', surface:'#0C1018' },
  { id:'crimson',   name:'Crimson',   dark:true,  accent:'#FF3860', bg:'#0D0507', surface:'#140A0D' },
  { id:'ember',     name:'Ember',     dark:true,  accent:'#FF6B2B', bg:'#0E0705', surface:'#180E09' },
  { id:'volcanic',  name:'Volcanic',  dark:true,  accent:'#FF4500', bg:'#0D0603', surface:'#160C07' },
  { id:'midnight',  name:'Midnight',  dark:true,  accent:'#7C5CFF', bg:'#060510', surface:'#0C0A1C' },
  { id:'matrix',    name:'Matrix',    dark:true,  accent:'#00FF6E', bg:'#030D05', surface:'#071408' },
  { id:'cotton',    name:'Cotton',    dark:false, accent:'#5B67F8', bg:'#F5F6FF', surface:'#FFFFFF' },
  { id:'blossom',   name:'Blossom',   dark:false, accent:'#F43F5E', bg:'#FFF2F6', surface:'#FFFFFF' },
  { id:'daybreak',  name:'Daybreak',  dark:false, accent:'#0284C7', bg:'#EFF8FF', surface:'#FFFFFF' },
  { id:'parchment', name:'Parchment', dark:false, accent:'#D97706', bg:'#FFFBF0', surface:'#FFFFFF' },
  { id:'garden',    name:'Garden',    dark:false, accent:'#059669', bg:'#F0FDF4', surface:'#FFFFFF' },
];

function applyTheme(id) {
  document.documentElement.setAttribute('data-theme', id);
  try { localStorage.setItem('studydesk_theme', id); } catch(e){}
  document.querySelectorAll('.theme-swatch').forEach(s => {
    const isA = s.dataset.themeId === id;
    s.classList.toggle('active', isA);
    const tick = s.querySelector('.ts-active-tick');
    if (tick) tick.style.display = isA ? 'flex' : 'none';
  });
}

function loadTheme() {
  let saved;
  try { saved = localStorage.getItem('studydesk_theme') || 'cyber'; } catch(e){ saved='cyber'; }
  document.documentElement.setAttribute('data-theme', saved);
}

loadTheme();

function renderThemePicker() {
  let saved;
  try { saved = localStorage.getItem('studydesk_theme') || 'cyber'; } catch(e){ saved='cyber'; }
  const darkThemes  = THEMES.filter(t =>  t.dark);
  const lightThemes = THEMES.filter(t => !t.dark);

  function swatch(t) {
    const isActive = t.id === saved;
    const textCol = t.dark ? 'rgba(255,255,255,.72)' : 'rgba(0,0,0,.62)';
    const barCol  = t.dark ? 'rgba(255,255,255,.18)' : 'rgba(0,0,0,.13)';
    return `<div class="theme-swatch${isActive?' active':''}" data-theme-id="${t.id}"
        onclick="applyTheme('${t.id}')" title="${t.name}">
      <div class="ts-preview" style="background:${t.bg}">
        <div class="ts-dots">
          <div class="ts-row"><div class="ts-circle" style="background:${t.accent}"></div><div class="ts-bar" style="background:${t.accent}"></div></div>
          <div class="ts-row"><div class="ts-bar" style="background:${barCol};flex:1"></div></div>
          <div class="ts-row"><div class="ts-bar-sm" style="background:${barCol}"></div></div>
        </div>
        ${isActive?`<div class="ts-active-tick" style="background:${t.accent}">✓</div>`:''}
      </div>
      <div class="ts-name" style="background:${t.surface};color:${textCol}">${t.name}</div>
    </div>`;
  }

  return `<div class="sec-label">THEME</div>
    <p style="color:var(--muted);font-size:12px;margin-bottom:14px">Pick a colour theme. Your choice is saved automatically.</p>
    <div class="theme-row-label">🌑 Dark Themes</div>
    <div class="theme-grid">${darkThemes.map(swatch).join('')}</div>
    <div class="theme-row-label">☀️ Light Themes</div>
    <div class="theme-grid">${lightThemes.map(swatch).join('')}</div>`;
}

// ══════════════════════════════════════════════════════
// SYLLABUS TRACKER
// ══════════════════════════════════════════════════════
const SYLLABUS_STATUSES = [
  { key:'not-started',  label:'Not Started', cls:'status-not-started' },
  { key:'in-progress',  label:'In Progress', cls:'status-in-progress' },
  { key:'done',         label:'Done',        cls:'status-done'        },
  { key:'revised',      label:'Revised',     cls:'status-revised'     },
];

function nextStatus(cur) {
  const idx = SYLLABUS_STATUSES.findIndex(s=>s.key===cur);
  return SYLLABUS_STATUSES[(idx+1) % SYLLABUS_STATUSES.length].key;
}

function syllabusGetSubj(subj) {
  if (!syllabus[subj]) syllabus[subj] = [];
  return syllabus[subj];
}

function syllabusAddChapter(subj) {
  const inp = el('syl-add-inp-' + subj);
  const name = inp.value.trim();
  if (!name) { inp.focus(); return; }
  syllabusGetSubj(subj).push({ id: Date.now(), name, status: 'not-started' });
  inp.value = '';
  scheduleSave();
  renderSyllabusCard(subj);
  renderSyllabusStats();
  inp.focus();
}

function syllabusRemoveChapter(subj, id) {
  syllabus[subj] = (syllabus[subj]||[]).filter(c=>c.id!==id);
  scheduleSave();
  renderSyllabusCard(subj);
  renderSyllabusStats();
}

function syllabusToggleStatus(subj, id) {
  const ch = (syllabus[subj]||[]).find(c=>c.id===id);
  if (!ch) return;
  ch.status = nextStatus(ch.status);
  scheduleSave();
  renderSyllabusCard(subj);
  renderSyllabusStats();
  checkAndAwardBadges();
}

function syllabusRenameChapter(subj, id, newName) {
  const ch = (syllabus[subj]||[]).find(c=>c.id===id);
  if (ch && newName.trim()) { ch.name = newName.trim(); scheduleSave(); }
}

function syllabusHandleKeydown(e, subj) {
  if (e.key === 'Enter') syllabusAddChapter(subj);
}

function renderSyllabusStats() {
  let totalChapters=0, totalDone=0, totalRevised=0, totalInProgress=0;
  SUBJECTS.forEach(s=>{
    const chs = syllabus[s]||[];
    totalChapters += chs.length;
    totalDone      += chs.filter(c=>c.status==='done').length;
    totalRevised   += chs.filter(c=>c.status==='revised').length;
    totalInProgress+= chs.filter(c=>c.status==='in-progress').length;
  });
  const pct = totalChapters>0?Math.round((totalDone+totalRevised)/totalChapters*100):0;
  el('syllabus-stats').innerHTML = [
    {icon:'📋',bg:'rgba(129,140,248,.15)',val:totalChapters,label:'Total Chapters'},
    {icon:'✅',bg:'rgba(52,211,153,.15)',val:totalDone,label:'Completed'},
    {icon:'🔄',bg:'rgba(0,212,255,.12)',val:totalRevised,label:'Revised'},
    {icon:'⏳',bg:'rgba(251,191,36,.12)',val:totalInProgress,label:'In Progress'},
    {icon:'🎯',bg:'rgba(192,132,252,.12)',val:pct+'%',label:'Overall Progress'},
  ].map(s=>`
    <div class="syllabus-stat-card">
      <div class="syllabus-stat-icon" style="background:${s.bg}">${s.icon}</div>
      <div>
        <div class="syllabus-stat-val">${s.val}</div>
        <div class="syllabus-stat-label">${s.label}</div>
      </div>
    </div>`).join('');
}

function renderSyllabusCard(subj) {
  const card = el('syl-card-' + subj);
  if (!card) return;
  const chs = syllabus[subj] || [];
  const done = chs.filter(c=>c.status==='done'||c.status==='revised').length;
  const pct  = chs.length ? Math.round(done/chs.length*100) : 0;
  const col  = SUB_COLOR[subj];
  
  card.querySelector('.syllabus-pct').textContent = pct+'%';
  card.querySelector('.syllabus-pct').style.color = pct===100?'var(--green)':col;
  card.querySelector('.syllabus-count').textContent = `${chs.length} chapter${chs.length!==1?'s':''}`;
  card.querySelector('.syllabus-progress-fill').style.width = pct+'%';
  
  const listEl = card.querySelector('.syllabus-chapter-list');
  if (!chs.length) {
    listEl.innerHTML = '<div style="color:var(--muted);font-size:12px;text-align:center;padding:16px 0">No chapters yet — add one below</div>';
    return;
  }
  listEl.innerHTML = chs.map((ch,i)=>{
    const st = SYLLABUS_STATUSES.find(s=>s.key===ch.status)||SYLLABUS_STATUSES[0];
    return `<div class="syllabus-chapter-row">
      <span class="syllabus-ch-num">${i+1}</span>
      <span class="syllabus-ch-name"
        contenteditable="true"
        onblur="syllabusRenameChapter('${subj}',${ch.id},this.textContent)"
        onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur()}"
        title="Click to rename">${ch.name.replace(/</g,'&lt;')}</span>
      <button class="syllabus-status-btn ${st.cls}" onclick="syllabusToggleStatus('${subj}',${ch.id})" title="Click to cycle status">${st.label}</button>
      <button class="syllabus-ch-delete" onclick="syllabusRemoveChapter('${subj}',${ch.id})" title="Remove chapter">✕</button>
    </div>`;
  }).join('');
}

function renderSyllabus() {
  renderSyllabusStats();
  const grid = el('syllabus-grid');
  grid.innerHTML = SUBJECTS.map(subj=>{
    const col = SUB_COLOR[subj];
    const chs = syllabus[subj]||[];
    const done = chs.filter(c=>c.status==='done'||c.status==='revised').length;
    const pct  = chs.length ? Math.round(done/chs.length*100) : 0;
    return `
      <div class="syllabus-card" id="syl-card-${subj}">
        <div class="syllabus-header">
          <div class="syllabus-header-bg" style="background:${col}"></div>
          <div class="syllabus-subject-name" style="color:${col}">${subj}</div>
          <div class="syllabus-header-right">
            <span class="syllabus-count" style="color:var(--muted)">${chs.length} chapter${chs.length!==1?'s':''}</span>
            <span class="syllabus-pct" style="color:${pct===100?'var(--green)':col}">${pct}%</span>
          </div>
        </div>
        <div class="syllabus-progress-bar">
          <div class="syllabus-progress-fill" style="width:${pct}%;background:${col}"></div>
        </div>
        <div class="syllabus-body">
          <div class="syllabus-chapter-list"></div>
          <div class="syllabus-add-row">
            <input
              class="syllabus-add-inp" id="syl-add-inp-${subj}"
              placeholder="Add a chapter…"
              onkeydown="syllabusHandleKeydown(event,'${subj}')"/>
            <button class="syllabus-add-btn" onclick="syllabusAddChapter('${subj}')">+ Add</button>
          </div>
        </div>
      </div>`;
  }).join('');
  // Render chapter lists after cards exist in DOM
  SUBJECTS.forEach(s => renderSyllabusCard(s));
}


// ══════════════════════════════════════════════════════
// VACATION MODE
// ══════════════════════════════════════════════════════
function isVacationDay(ds) {
  return vacationRanges.some(v => ds >= v.start && ds <= v.end);
}

function addVacation() {
  const label = el('vac-label-inp').value.trim();
  const start = el('vac-start-inp').value;
  const end   = el('vac-end-inp').value;
  if (!label || !start || !end) { toast('Fill in all fields', 'var(--yellow)'); return; }
  if (start > end) { toast('Start must be before end date', 'var(--red)'); return; }
  vacationRanges.push({ id: Date.now(), label, start, end });
  scheduleSave();
  renderVacationList();
  el('vac-label-inp').value=''; el('vac-start-inp').value=''; el('vac-end-inp').value='';
  toast(`Vacation "${label}" added ✓`);
}

function removeVacation(id) {
  vacationRanges = vacationRanges.filter(v => v.id !== id);
  scheduleSave();
  renderVacationList();
}

function renderVacationList() {
  const listEl = el('vacation-list');
  if (!listEl) return;
  const today = getToday();
  if (!vacationRanges.length) {
    listEl.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:8px 0">No vacations added yet.</div>';
    return;
  }
  listEl.innerHTML = vacationRanges.map(v => {
    const active   = today >= v.start && today <= v.end;
    const upcoming = today < v.start;
    const tag = active
      ? '<span class="pill pill-accent" style="font-size:10px;padding:3px 8px;margin-left:6px">🏖️ Active</span>'
      : upcoming ? '<span style="color:var(--muted);font-size:11px;margin-left:6px">Upcoming</span>'
                 : '<span style="color:var(--muted);font-size:11px;margin-left:6px">Past</span>';
    return `<div class="vacation-item">
      <div class="vacation-info">
        <div class="vacation-label">${v.label}${tag}</div>
        <div style="color:var(--muted);font-size:12px;margin-top:2px">${fmtDate(v.start)} — ${fmtDate(v.end)}</div>
      </div>
      <button class="session-delete" onclick="removeVacation(${v.id})" title="Remove">✕</button>
    </div>`;
  }).join('');
}

function renderVacationSection() {
  const today = getToday();
  const listHtml = !vacationRanges.length
    ? '<div style="color:var(--muted);font-size:13px;padding:8px 0">No vacations added yet.</div>'
    : vacationRanges.map(v => {
        const active   = today >= v.start && today <= v.end;
        const upcoming = today < v.start;
        const tag = active
          ? '<span class="pill pill-accent" style="font-size:10px;padding:3px 8px;margin-left:6px">🏖️ Active</span>'
          : upcoming ? '<span style="color:var(--muted);font-size:11px;margin-left:6px">Upcoming</span>'
                     : '<span style="color:var(--muted);font-size:11px;margin-left:6px">Past</span>';
        return `<div class="vacation-item">
          <div class="vacation-info">
            <div class="vacation-label">${v.label}${tag}</div>
            <div style="color:var(--muted);font-size:12px;margin-top:2px">${fmtDate(v.start)} — ${fmtDate(v.end)}</div>
          </div>
          <button class="session-delete" onclick="removeVacation(${v.id})" title="Remove">✕</button>
        </div>`;
      }).join('');

  return `<div class="sec-label">🏖️ VACATION MODE</div>
    <p style="color:var(--muted);font-size:13px;margin-bottom:16px">Streak won't break during vacations. Add date ranges for holidays or breaks.</p>
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px">
      <input class="inp" id="vac-label-inp" placeholder="Label (e.g. Diwali Holidays)" style="margin-bottom:0"/>
      <div style="display:flex;gap:8px">
        <div style="flex:1"><div class="inp-label" style="font-size:10px;margin-bottom:4px">FROM</div><input class="inp" id="vac-start-inp" type="date" style="margin-bottom:0"/></div>
        <div style="flex:1"><div class="inp-label" style="font-size:10px;margin-bottom:4px">TO</div><input class="inp" id="vac-end-inp" type="date" style="margin-bottom:0"/></div>
      </div>
      <button class="btn btn-primary" onclick="addVacation()">+ Add Vacation</button>
    </div>
    <div id="vacation-list">${listHtml}</div>`;
}

// ══════════════════════════════════════════════════════
// STUDY STREAK
// ══════════════════════════════════════════════════════
function calculateStreak() {
  const studyDates = new Set(studySessions.map(s => s.date));
  const today = getToday();
  let streak = 0;
  let d = new Date(today + 'T12:00:00');
  for (let i = 0; i < 400; i++) {
    const ds = d.toISOString().split('T')[0];
    if (studyDates.has(ds) || isVacationDay(ds)) { streak++; d.setDate(d.getDate()-1); }
    else break;
  }
  return streak;
}

function getLongestStreak() {
  const studyDates = new Set(studySessions.map(s => s.date));
  const allDates = new Set(studyDates);
  vacationRanges.forEach(v => {
    let d = new Date(v.start+'T12:00:00'), end = new Date(v.end+'T12:00:00');
    while (d <= end) { allDates.add(d.toISOString().split('T')[0]); d.setDate(d.getDate()+1); }
  });
  const sorted = [...allDates].sort();
  if (!sorted.length) return 0;
  let max = 1, cur = 1;
  for (let i = 1; i < sorted.length; i++) {
    const diff = (new Date(sorted[i]+'T12:00:00')-new Date(sorted[i-1]+'T12:00:00'))/86400000;
    diff === 1 ? (cur++, max = Math.max(max,cur)) : (cur=1);
  }
  return max;
}

function getHWStreak() {
  const today = getToday();
  let streak = 0;
  let d = new Date(today+'T12:00:00');
  for (let i = 0; i < 60; i++) {
    const ds = d.toISOString().split('T')[0];
    if (ds > today) { d.setDate(d.getDate()-1); continue; }
    const hw = homework[ds] || {};
    if (SUBJECTS.some(s => hw[s] && (hw[s].text || hw[s].notGiven))) { streak++; d.setDate(d.getDate()-1); }
    else break;
  }
  return streak;
}

// ══════════════════════════════════════════════════════
// BADGES
// ══════════════════════════════════════════════════════
const BADGES = [
  { id:'spark',    icon:'🔥', name:'Spark',           desc:'Complete your first study session',  check:d=>d.totalSessions>=1 },
  { id:'streak3',  icon:'📅', name:'Consistent',      desc:'Achieve a 3-day study streak',       check:d=>d.streak>=3 },
  { id:'streak7',  icon:'⚡', name:'Week Warrior',    desc:'Achieve a 7-day study streak',       check:d=>d.streak>=7 },
  { id:'streak30', icon:'💎', name:'Month Master',    desc:'Achieve a 30-day study streak',      check:d=>d.streak>=30 },
  { id:'sess10',   icon:'📚', name:'Scholar',         desc:'Log 10 study sessions',              check:d=>d.totalSessions>=10 },
  { id:'sess50',   icon:'🚀', name:'Grinder',         desc:'Log 50 study sessions',              check:d=>d.totalSessions>=50 },
  { id:'hrs10',    icon:'📖', name:'Bookworm',        desc:'10 hours of total study time',       check:d=>d.totalHours>=10 },
  { id:'hrs50',    icon:'💡', name:'Dedicated',       desc:'50 hours of total study time',       check:d=>d.totalHours>=50 },
  { id:'att90',    icon:'✅', name:'Attendance Star', desc:'Overall attendance above 90%',       check:d=>d.attPct>=90 },
  { id:'score90',  icon:'🏅', name:'Top Scorer',      desc:'Average exam score above 90%',       check:d=>d.avgScore>=90 },
  { id:'exam1',    icon:'🎓', name:'First Steps',     desc:'Log your first exam',                check:d=>d.totalExams>=1 },
  { id:'syllClear',icon:'🎯', name:'Subject Clear',   desc:'Complete all chapters in a subject', check:d=>d.subjectCleared },
  { id:'hwHero',   icon:'📝', name:'HW Hero',         desc:'Fill homework 7 days in a row',      check:d=>d.hwStreak>=7 },
  { id:'allSubj',  icon:'🌈', name:'All-Rounder',     desc:'Study all 6 subjects',               check:d=>d.studiedAllSubjects },
];

function getBadgeData() {
  const totalSecs = studySessions.reduce((a,s)=>a+s.durationSecs,0);
  const sdVals = Object.values(schoolDays);
  const present = sdVals.filter(v=>v==='present').length;
  const total   = sdVals.filter(v=>v!=='holiday').length;
  let allScores = [];
  exams.forEach(ex=>SUBJECTS.forEach(s=>{if(ex.marks[s]&&ex.marks[s].score!==''&&ex.marks[s].max>0)allScores.push(ex.marks[s].score/ex.marks[s].max*100);}));
  const subjectCleared = SUBJECTS.some(s=>{const chs=syllabus[s]||[];return chs.length>0&&chs.every(c=>c.status==='done'||c.status==='revised');});
  const studiedSubjects = new Set(studySessions.map(s=>s.subject));
  return {
    streak:             calculateStreak(),
    totalSessions:      studySessions.length,
    totalHours:         totalSecs/3600,
    attPct:             total>0?present/total*100:0,
    avgScore:           allScores.length?allScores.reduce((a,v)=>a+v,0)/allScores.length:0,
    totalExams:         exams.length,
    subjectCleared,
    hwStreak:           getHWStreak(),
    studiedAllSubjects: SUBJECTS.every(s=>studiedSubjects.has(s)),
  };
}

function checkAndAwardBadges() {
  const data = getBadgeData();
  let newBadges = [];
  BADGES.forEach(b => { if (!earnedBadges[b.id] && b.check(data)) { earnedBadges[b.id]=getToday(); newBadges.push(b); }});
  if (newBadges.length) {
    scheduleSave();
    newBadges.forEach((b,i)=>setTimeout(()=>toast(`🏅 Badge unlocked: ${b.icon} ${b.name}!`,'var(--accent)'),i*900));
  }
}

function renderBadgesSection() {
  const earned = BADGES.filter(b=>earnedBadges[b.id]);
  return `<div class="sec-label">🏅 BADGES</div>
    <div style="color:var(--muted);font-size:12px;margin-bottom:14px"><b style="color:var(--accent);font-family:var(--mono)">${earned.length}</b> / ${BADGES.length} earned</div>
    <div class="badges-grid">
      ${BADGES.map(b=>{
        const isEarned=!!earnedBadges[b.id];
        return `<div class="badge-card ${isEarned?'badge-earned':'badge-locked'}" title="${b.desc}">
          <div class="badge-icon">${b.icon}</div>
          <div class="badge-name">${b.name}</div>
          <div class="badge-desc">${b.desc}</div>
          <div class="badge-date">${isEarned?'Earned '+fmtDate(earnedBadges[b.id]):'🔒 Locked'}</div>
        </div>`;
      }).join('')}
    </div>`;
}

// ══════════════════════════════════════════════════════
// STUDY PLANNER
// ══════════════════════════════════════════════════════
function renderPlanner() {
  const today = getToday();
  const upcoming = exams.filter(ex=>ex.date&&ex.date>=today).sort((a,b)=>a.date.localeCompare(b.date));
  const todaySecs = studySessions.filter(s=>s.date===today).reduce((a,s)=>a+s.durationSecs,0);
  const goalSecs  = dailyStudyGoalMins*60;
  const donePct   = goalSecs>0?Math.min(100,Math.round(todaySecs/goalSecs*100)):0;
  const streak    = calculateStreak();
  const circ      = Math.round(donePct*3.14159);

  // ── Weekly target stats ──
  const {start:wkStart} = getWeekRange(today);
  const wkStartD = new Date(wkStart+'T12:00:00');
  let wkSecs = 0;
  const wkSubjSecs = {};
  SUBJECTS.forEach(s=>wkSubjSecs[s]=0);
  studySessions.forEach(ss=>{
    const d = new Date(ss.date+'T12:00:00');
    if(d>=wkStartD && ss.date<=today){
      wkSecs += ss.durationSecs;
      if(ss.subject) wkSubjSecs[ss.subject]=(wkSubjSecs[ss.subject]||0)+ss.durationSecs;
    }
  });
  const wkGoalSecs  = weeklyStudyGoalHrs*3600;
  const wkPct       = wkGoalSecs>0?Math.min(100,Math.round(wkSecs/wkGoalSecs*100)):0;
  const wkCirc      = Math.round(wkPct*3.14159);
  const wkHrsDone   = (wkSecs/3600).toFixed(1);
  const maxSubjSecs = Math.max(...Object.values(wkSubjSecs),1);

  const html=`
  <!-- ROW 1: daily goal + weekly target -->
  <div class="planner-layout">
    <!-- Daily goal ring -->
    <div class="card planner-goal-card">
      <div class="sec-label">TODAY'S PROGRESS</div>
      <div class="planner-ring-wrap">
        <svg class="planner-ring" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="50" fill="none" stroke="var(--border)" stroke-width="10"/>
          <circle cx="60" cy="60" r="50" fill="none" stroke="var(--accent)" stroke-width="10"
            stroke-dasharray="${circ},314" stroke-linecap="round" transform="rotate(-90 60 60)"/>
        </svg>
        <div class="planner-ring-text">
          <div class="planner-ring-pct">${donePct}%</div>
          <div style="font-size:10px;color:var(--muted)">of goal</div>
        </div>
      </div>
      <div style="text-align:center;margin-bottom:16px">
        <span style="font-family:var(--mono);color:var(--accent)">${secToLabel(todaySecs)||'0m'}</span>
        <span style="color:var(--muted);font-size:12px"> / ${dailyStudyGoalMins}m goal</span>
      </div>
      <div class="sec-label" style="margin-bottom:8px">SET DAILY GOAL</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
        ${[30,45,60,90,120].map(m=>`<button class="break-preset-btn${dailyStudyGoalMins===m?' active':''}" onclick="setDailyGoal(${m})">${m}m</button>`).join('')}
      </div>
      <div style="display:flex;gap:8px">
        <input class="inp" id="custom-goal-inp" type="number" min="15" max="600" placeholder="Custom (min)" style="margin-bottom:0;flex:1"/>
        <button class="btn btn-primary" onclick="setDailyGoalCustom()">Set</button>
      </div>
      ${streak>0?`<div class="planner-streak-badge">🔥 ${streak}-day streak!</div>`:''}
    </div>

    <!-- Weekly target + balance -->
    <div class="card planner-weekly-card">
      <div class="weekly-target-header">
        <div>
          <div class="sec-label" style="margin:0">WEEKLY TARGET</div>
          <div style="color:var(--muted);font-size:12px;margin-top:4px">Mon — Sun</div>
        </div>
        <div class="weekly-ring-wrap">
          <svg class="weekly-ring" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="32" fill="none" stroke="var(--border)" stroke-width="7"/>
            <circle cx="40" cy="40" r="32" fill="none" stroke="${wkPct>=100?'var(--green)':'var(--accent)'}" stroke-width="7"
              stroke-dasharray="${wkCirc},201" stroke-linecap="round" transform="rotate(-90 40 40)"/>
          </svg>
          <div class="weekly-ring-text">
            <div style="font-family:var(--mono);font-size:14px;font-weight:900;color:${wkPct>=100?'var(--green)':'var(--accent)'}">${wkPct}%</div>
          </div>
        </div>
      </div>
      <div class="weekly-target-stats">
        <div class="weekly-stat">
          <div class="weekly-stat-val" style="color:${wkPct>=100?'var(--green)':'var(--accent)'}">${wkHrsDone}h</div>
          <div class="weekly-stat-lbl">done</div>
        </div>
        <div class="weekly-stat-div"></div>
        <div class="weekly-stat">
          <div class="weekly-stat-val">${weeklyStudyGoalHrs}h</div>
          <div class="weekly-stat-lbl">goal</div>
        </div>
        <div class="weekly-stat-div"></div>
        <div class="weekly-stat">
          <div class="weekly-stat-val" style="color:${wkSecs>=wkGoalSecs?'var(--green)':'var(--yellow)'}">${wkGoalSecs>wkSecs?((wkGoalSecs-wkSecs)/3600).toFixed(1)+'h':'Done!'}</div>
          <div class="weekly-stat-lbl">${wkSecs<wkGoalSecs?'left':'🎉'}</div>
        </div>
      </div>
      <div class="sec-label" style="margin-bottom:8px">SET WEEKLY GOAL</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">
        ${[5,7,10,14,20].map(h=>`<button class="break-preset-btn${weeklyStudyGoalHrs===h?' active':''}" onclick="setWeeklyGoal(${h})">${h}h</button>`).join('')}
      </div>
      <!-- Subject balance bars -->
      <div class="sec-label" style="margin-bottom:8px">THIS WEEK'S BALANCE</div>
      ${SUBJECTS.map(s=>{
        const pct=Math.round((wkSubjSecs[s]||0)/maxSubjSecs*100);
        return `<div class="weekly-subj-row">
          <span class="weekly-subj-name" style="color:${SUB_COLOR[s]}">${s}</span>
          <div class="weekly-subj-track"><div class="weekly-subj-fill" style="width:${pct}%;background:${SUB_COLOR[s]}"></div></div>
          <span class="weekly-subj-time">${wkSubjSecs[s]?secToLabel(wkSubjSecs[s]):'—'}</span>
        </div>`;
      }).join('')}
    </div>
  </div>

  <!-- ROW 2: Upcoming exams + This week -->
  <div class="planner-layout" style="margin-top:20px">
    <div class="card">
      <div class="sec-label">UPCOMING EXAMS</div>
      ${!upcoming.length
        ? '<div class="empty-state" style="padding:20px">No upcoming exams with dates set.</div>'
        : upcoming.map(ex=>{
            const days=Math.max(0,Math.ceil((new Date(ex.date+'T12:00:00')-new Date(today+'T12:00:00'))/86400000));
            const col=days<=3?'var(--red)':days<=7?'var(--yellow)':'var(--green)';
            return `<div class="planner-exam-row">
              <div><div style="font-weight:700;font-size:15px">${ex.name}</div><div style="color:var(--muted);font-size:12px">${fmtDate(ex.date)}</div></div>
              <div class="planner-countdown" style="color:${col}"><div style="font-size:26px;font-weight:900;font-family:var(--mono);line-height:1">${days}</div><div style="font-size:10px">days left</div></div>
            </div>`;
          }).join('')
      }
    </div>
    <div class="card">
      <div class="sec-label">THIS WEEK</div>
      <div class="planner-week-grid">${buildWeekGrid()}</div>
    </div>
  </div>

  <!-- ROW 3: Study Schedule Builder -->
  <div class="card" style="margin-top:20px" id="planner-schedule-section">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <div>
        <div class="sec-label" style="margin:0">📅 STUDY SCHEDULE BUILDER</div>
        <div style="color:var(--muted);font-size:12px;margin-top:4px">Pick an exam — get a day-by-day study plan based on your syllabus</div>
      </div>
    </div>
    ${renderScheduleBuilder()}
  </div>

  <!-- ROW 4: Saved Schedules -->
  ${studySchedules.length ? `<div class="card" style="margin-top:20px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <div class="sec-label" style="margin:0">MY SCHEDULES</div>
      <button class="btn btn-ghost" style="font-size:12px" onclick="clearAllSchedules()">Clear All</button>
    </div>
    <div id="saved-schedules-list">${renderSavedSchedules()}</div>
  </div>` : ''}
  `;

  el('planner-content').innerHTML=html;
}

function buildWeekGrid() {
  const today=new Date(getToday()+'T12:00:00');
  const dow=today.getDay();
  const monday=new Date(today);monday.setDate(today.getDate()-(dow===0?6:dow-1));
  const dayNames=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  return Array.from({length:7},(_,i)=>{
    const d=new Date(monday);d.setDate(monday.getDate()+i);
    const ds=d.toISOString().split('T')[0];
    const todayStr=getToday();
    const secs=studySessions.filter(s=>s.date===ds).reduce((a,s)=>a+s.durationSecs,0);
    const isToday=ds===todayStr,isFuture=ds>todayStr,isVac=isVacationDay(ds);
    const gSecs=dailyStudyGoalMins*60;
    const pct=secs>0&&gSecs>0?Math.min(100,Math.round(secs/gSecs*100)):0;
    let status,statusCol;
    if(isVac){status='🏖️ Vacation';statusCol='var(--yellow)';}
    else if(isFuture){status=`${dailyStudyGoalMins}m goal`;statusCol='var(--muted)';}
    else if(secs>0){status=secToLabel(secs);statusCol=pct>=100?'var(--green)':'var(--accent)';}
    else{status='Rest day';statusCol='var(--muted)';}
    return `<div class="planner-day-card${isToday?' today':''}${isVac?' vacation':''}">
      <div class="planner-day-name">${dayNames[i]}</div>
      <div class="planner-day-date">${d.getDate()}</div>
      <div class="planner-bar-track">${!isFuture&&!isVac&&secs>0?`<div class="planner-bar-fill" style="height:${pct}%;background:${pct>=100?'var(--green)':'var(--accent)'}"></div>`:''}</div>
      <div class="planner-day-status" style="color:${statusCol}">${status}</div>
    </div>`;
  }).join('');
}

function setDailyGoal(mins){dailyStudyGoalMins=mins;scheduleSave();renderPlanner();}
function setDailyGoalCustom(){const v=parseInt(el('custom-goal-inp').value);if(!v||v<15){toast('Enter at least 15 minutes','var(--yellow)');return;}setDailyGoal(v);}
function setWeeklyGoal(hrs){weeklyStudyGoalHrs=hrs;scheduleSave();renderPlanner();}


// ══════════════════════════════════════════════════════
// STUDY SCHEDULE BUILDER
// ══════════════════════════════════════════════════════
function renderScheduleBuilder() {
  const today = getToday();
  const upcoming = exams.filter(ex=>ex.date&&ex.date>today).sort((a,b)=>a.date.localeCompare(b.date));

  if (!upcoming.length) {
    return `<div class="empty-state" style="padding:20px">
      No upcoming exams with dates set. Add a date to an exam first, then come back here!
    </div>`;
  }

  return `<div class="schedule-builder">
    <div class="schedule-builder-form">
      <div style="flex:1">
        <label class="inp-label">PICK AN EXAM</label>
        <select class="inp" id="sched-exam-sel" style="cursor:pointer" onchange="previewSchedule()">
          <option value="">— Select exam —</option>
          ${upcoming.map(ex=>{
            const days=Math.ceil((new Date(ex.date+'T12:00:00')-new Date(today+'T12:00:00'))/86400000);
            return `<option value="${ex.id}">${ex.name} — ${days}d away (${fmtDate(ex.date)})</option>`;
          }).join('')}
        </select>
      </div>
      <div style="flex:1">
        <label class="inp-label">DAILY STUDY TIME FOR THIS EXAM</label>
        <select class="inp" id="sched-mins-sel" style="cursor:pointer" onchange="previewSchedule()">
          ${[30,45,60,90,120].map(m=>`<option value="${m}" ${m===60?'selected':''}>${m} min/day</option>`).join('')}
        </select>
      </div>
    </div>
    <div id="schedule-preview"></div>
  </div>`;
}

function previewSchedule() {
  const examId = parseInt(el('sched-exam-sel')?.value);
  const minsPerDay = parseInt(el('sched-mins-sel')?.value||60);
  const preview = el('schedule-preview');
  if (!preview) return;

  if (!examId) { preview.innerHTML=''; return; }

  const exam = exams.find(ex=>ex.id===examId);
  if (!exam || !exam.date) { preview.innerHTML=''; return; }

  const today = getToday();
  const examDate = new Date(exam.date+'T12:00:00');
  const todayDate = new Date(today+'T12:00:00');
  const totalDays = Math.max(1, Math.ceil((examDate-todayDate)/86400000));

  // Gather all chapters from all subjects for this exam
  const chaptersToStudy = [];
  SUBJECTS.forEach(s=>{
    const chs = (syllabus[s]||[]).filter(c=>c.status!=='done'&&c.status!=='revised');
    chs.forEach(c=>chaptersToStudy.push({subject:s,chapter:c.name,color:SUB_COLOR[s]}));
  });

  if (!chaptersToStudy.length) {
    // No pending chapters — just suggest revision
    chaptersToStudy.push(...SUBJECTS.map(s=>({subject:s,chapter:'Revision & Practice',color:SUB_COLOR[s],isRevision:true})));
  }

  // Distribute chapters across days
  const schedule = buildScheduleDays(today, exam.date, totalDays, chaptersToStudy, minsPerDay);

  preview.innerHTML = `
    <div class="sched-preview-header">
      <div>
        <div style="font-weight:800;font-size:16px;color:var(--text)">${exam.name}</div>
        <div style="color:var(--muted);font-size:12px;margin-top:3px">${totalDays} days · ${minsPerDay} min/day · ${schedule.length} day plan</div>
      </div>
      <button class="btn btn-primary" style="flex-shrink:0" onclick="saveSchedule(${examId})">💾 Save Schedule</button>
    </div>
    <div class="sched-days-grid">
      ${schedule.map((day,i)=>`
        <div class="sched-day-card ${day.date===today?'sched-today':''}">
          <div class="sched-day-top">
            <div class="sched-day-num">Day ${i+1}</div>
            <div class="sched-day-date">${fmtDate(day.date)}</div>
          </div>
          ${day.items.map(item=>`
            <div class="sched-item" style="border-left-color:${item.color}">
              <div style="color:${item.color};font-size:10px;font-weight:800">${item.subject}</div>
              <div style="font-size:12px;font-weight:600;color:var(--text)">${item.chapter}</div>
              <div style="font-size:10px;color:var(--muted)">~${item.mins} min</div>
            </div>`).join('')}
          <div class="sched-day-total">${minsPerDay} min total</div>
        </div>`).join('')}
    </div>`;
}

function buildScheduleDays(startDate, examDate, totalDays, chapters, minsPerDay) {
  // Skip exam day itself, plan from today to day before
  const planDays = Math.max(1, totalDays - 1);
  const days = [];
  const startD = new Date(startDate+'T12:00:00');

  // Mins per chapter: split minsPerDay evenly per day, cycle through chapters
  const minsPerChapter = Math.max(15, Math.round(minsPerDay / Math.ceil(chapters.length/planDays)));

  let chIdx = 0;
  for (let i = 0; i < Math.min(planDays, 14); i++) { // cap at 14 days shown
    const d = new Date(startD); d.setDate(startD.getDate()+i);
    const ds = d.toISOString().split('T')[0];
    if (ds >= examDate) break;
    if (isVacationDay(ds)) continue;

    // How many chapters fit today
    let minsLeft = minsPerDay;
    const items = [];
    while (minsLeft >= 15 && chIdx < chapters.length) {
      const ch = chapters[chIdx % chapters.length];
      const mins = Math.min(minsLeft, minsPerChapter);
      items.push({...ch, mins});
      minsLeft -= mins;
      chIdx++;
    }
    // If we ran out of chapters, loop back for revision
    if (!items.length) {
      const ch = chapters[i % chapters.length];
      items.push({...ch, chapter:'Revise: '+ch.chapter, mins:minsPerDay});
    }
    days.push({date:ds, items});
  }
  return days;
}

function saveSchedule(examId) {
  const exam = exams.find(ex=>ex.id===examId);
  if (!exam) return;
  const minsPerDay = parseInt(el('sched-mins-sel')?.value||60);
  const today = getToday();
  const examDate = new Date(exam.date+'T12:00:00');
  const totalDays = Math.max(1, Math.ceil((examDate-new Date(today+'T12:00:00'))/86400000));

  const chaptersToStudy = [];
  SUBJECTS.forEach(s=>{
    const chs = (syllabus[s]||[]).filter(c=>c.status!=='done'&&c.status!=='revised');
    chs.forEach(c=>chaptersToStudy.push({subject:s,chapter:c.name,color:SUB_COLOR[s]}));
  });
  if (!chaptersToStudy.length) {
    SUBJECTS.forEach(s=>chaptersToStudy.push({subject:s,chapter:'Revision & Practice',color:SUB_COLOR[s]}));
  }

  const days = buildScheduleDays(today, exam.date, totalDays, chaptersToStudy, minsPerDay);

  // Remove old schedule for same exam
  studySchedules = studySchedules.filter(s=>s.examId!==examId);
  studySchedules.unshift({
    id: Date.now(),
    examId,
    examName: exam.name,
    examDate: exam.date,
    createdAt: today,
    minsPerDay,
    days,
  });
  if (studySchedules.length > 10) studySchedules = studySchedules.slice(0,10);
  scheduleSave();
  renderPlanner();
  toast(`Schedule for "${exam.name}" saved ✓`, 'var(--green)');
}

function renderSavedSchedules() {
  const today = getToday();
  return studySchedules.map(sched=>{
    // Find today's day in this schedule
    const todayDay = sched.days.find(d=>d.date===today);
    const daysLeft = Math.max(0, Math.ceil((new Date(sched.examDate+'T12:00:00')-new Date(today+'T12:00:00'))/86400000));
    const isExpired = today > sched.examDate;
    return `<div class="saved-sched-card ${isExpired?'expired':''}">
      <div class="saved-sched-header">
        <div>
          <div style="font-weight:800;font-size:15px;color:var(--text)">${sched.examName}</div>
          <div style="font-size:12px;color:var(--muted);margin-top:2px">${isExpired?'Exam passed':''+daysLeft+' days left · '+fmtDate(sched.examDate)} · ${sched.minsPerDay}min/day</div>
        </div>
        <button class="session-delete" onclick="deleteSchedule(${sched.id})" title="Delete">✕</button>
      </div>
      ${!isExpired && todayDay ? `<div style="margin-top:10px">
        <div class="sec-label" style="font-size:10px;margin-bottom:8px">TODAY'S PLAN</div>
        ${todayDay.items.map(item=>`<div class="sched-item" style="border-left-color:${item.color};margin-bottom:6px">
          <div style="color:${item.color};font-size:10px;font-weight:800">${item.subject}</div>
          <div style="font-size:13px;font-weight:600;color:var(--text)">${item.chapter}</div>
          <div style="font-size:11px;color:var(--muted)">~${item.mins} min</div>
        </div>`).join('')}
      </div>` : ''}
      <button class="btn btn-ghost" style="width:100%;margin-top:12px;font-size:12px"
        onclick="toggleSchedExpand(${sched.id})">View Full Schedule ›</button>
      <div id="sched-full-${sched.id}" style="display:none;margin-top:12px">
        <div class="sched-days-grid">
          ${sched.days.map((day,i)=>`<div class="sched-day-card ${day.date===today?'sched-today':''} ${day.date<today?'sched-past':''}">
            <div class="sched-day-top">
              <div class="sched-day-num">Day ${i+1}</div>
              <div class="sched-day-date">${fmtDate(day.date)}</div>
            </div>
            ${day.items.map(item=>`<div class="sched-item" style="border-left-color:${item.color}">
              <div style="color:${item.color};font-size:10px;font-weight:800">${item.subject}</div>
              <div style="font-size:12px;font-weight:600;color:var(--text)">${item.chapter}</div>
              <div style="font-size:10px;color:var(--muted)">~${item.mins} min</div>
            </div>`).join('')}
          </div>`).join('')}
        </div>
      </div>
    </div>`;
  }).join('');
}

function toggleSchedExpand(id) {
  const el2 = el('sched-full-'+id);
  if (!el2) return;
  el2.style.display = el2.style.display==='none' ? 'block' : 'none';
}

function deleteSchedule(id) {
  studySchedules = studySchedules.filter(s=>s.id!==id);
  scheduleSave();
  renderPlanner();
  toast('Schedule deleted');
}

function clearAllSchedules() {
  if (!confirm('Delete all saved schedules?')) return;
  studySchedules = [];
  scheduleSave();
  renderPlanner();
}

// ══════════════════════════════════════════════════════
// REPORTS
// ══════════════════════════════════════════════════════
function getWeekRange(dateStr) {
  const d=new Date(dateStr+'T12:00:00'),dow=d.getDay();
  const mon=new Date(d);mon.setDate(d.getDate()-(dow===0?6:dow-1));
  const sun=new Date(mon);sun.setDate(mon.getDate()+6);
  return{start:mon.toISOString().split('T')[0],end:sun.toISOString().split('T')[0]};
}

function buildReportData(startDate,endDate) {
  const sess=studySessions.filter(s=>s.date>=startDate&&s.date<=endDate);
  const totalSecs=sess.reduce((a,s)=>a+s.durationSecs,0);
  const bySubj={};SUBJECTS.forEach(s=>bySubj[s]=sess.filter(ss=>ss.subject===s).reduce((a,ss)=>a+ss.durationSecs,0));
  const topEntry=Object.entries(bySubj).sort((a,b)=>b[1]-a[1])[0];
  const attEntries=Object.entries(schoolDays).filter(([ds])=>ds>=startDate&&ds<=endDate);
  const present=attEntries.filter(([,v])=>v==='present').length;
  const absent =attEntries.filter(([,v])=>v==='absent').length;
  const attTot=present+absent;
  const hwDays=Object.keys(homework).filter(d=>d>=startDate&&d<=endDate);
  const hwDone=hwDays.reduce((a,d)=>a+SUBJECTS.filter(s=>homework[d][s]&&homework[d][s].done).length,0);
  const hwTot =hwDays.reduce((a,d)=>a+SUBJECTS.filter(s=>homework[d][s]&&!homework[d][s].notGiven).length,0);
  let allScores=[];exams.forEach(ex=>SUBJECTS.forEach(s=>{if(ex.marks[s]&&ex.marks[s].score!==''&&ex.marks[s].max>0)allScores.push(ex.marks[s].score/ex.marks[s].max*100);}));
  return{
    startDate,endDate,
    studyTime:{totalSecs,bySubj,topSubj:topEntry?.[0]||null,topSecs:topEntry?.[1]||0},
    sessions:sess.length,
    attendance:{present,absent,pct:attTot>0?Math.round(present/attTot*100):null},
    homework:{done:hwDone,total:hwTot,pct:hwTot>0?Math.round(hwDone/hwTot*100):null},
    exams:exams.filter(ex=>ex.date&&ex.date>=startDate&&ex.date<=endDate).map(e=>e.name),
    streak:calculateStreak(),
    avgScore:allScores.length?Math.round(allScores.reduce((a,v)=>a+v,0)/allScores.length):null,
  };
}

function generateWeeklyReport(weekStart) {
  const{start,end}=getWeekRange(weekStart);
  if(weeklyReports.find(r=>r.weekStart===start))return null;
  const report={weekStart:start,weekEnd:end,generatedAt:new Date().toISOString(),data:buildReportData(start,end)};
  weeklyReports.unshift(report);
  if(weeklyReports.length>52)weeklyReports=weeklyReports.slice(0,52);
  return report;
}

function generateMonthlyReport(monthStr) {
  if(monthlyReports.find(r=>r.month===monthStr))return null;
  const[y,m]=monthStr.split('-').map(Number);
  const start=`${y}-${String(m).padStart(2,'0')}-01`;
  const end=new Date(y,m,0).toISOString().split('T')[0];
  const report={month:monthStr,generatedAt:new Date().toISOString(),data:buildReportData(start,end)};
  monthlyReports.unshift(report);
  if(monthlyReports.length>24)monthlyReports=monthlyReports.slice(0,24);
  return report;
}

function checkAutoReports() {
  const today=getToday();
  const[ty,tm]=today.split('-').map(Number);
  let n=0;
  // Previous week
  const lm=new Date(today+'T12:00:00'),dow=lm.getDay();
  lm.setDate(lm.getDate()-(dow===0?6:dow-1)-7);
  const prevWk=lm.toISOString().split('T')[0];
  if(!weeklyReports.find(r=>r.weekStart===prevWk)){const r=generateWeeklyReport(prevWk);if(r)n++;}
  // Previous month
  const lmd=new Date(ty,tm-2,1);
  const prevMo=`${lmd.getFullYear()}-${String(lmd.getMonth()+1).padStart(2,'0')}`;
  if(!monthlyReports.find(r=>r.month===prevMo)){const r=generateMonthlyReport(prevMo);if(r)n++;}
  if(n>0){
    notifications.unshift({
      id: Date.now(),
      type: 'weekly_report',
      title: `📋 ${n} new report${n>1?'s':''} ready`,
      body: `Generated on ${getToday()}`,
      date: getToday(),
      read: false,
      data: { weeklyReports: weeklyReports.slice(0,4), monthlyReports: monthlyReports.slice(0,2) }
    });
    if (notifications.length > 60) notifications = notifications.slice(0, 60);
    scheduleSave();
    setTimeout(() => { updateNotifBell(); toast('📋 Weekly report ready — check 🔔 on Dashboard','var(--accent)'); }, 2500);
  }
}

function renderReportCard(report,title,subtitle) {
  const d=report.data;
  const maxSecs=Math.max(...Object.values(d.studyTime.bySubj),1);
  return `<div class="report-card">
    <div class="report-card-header">
      <div><div class="report-title">${title}</div><div class="report-subtitle">${subtitle}</div></div>
      <div style="font-size:10px;color:var(--muted);font-family:var(--mono)">${new Date(report.generatedAt).toLocaleDateString()}</div>
    </div>
    <div class="report-stats-grid">
      <div class="report-stat"><div class="report-stat-icon">⏱</div><div class="report-stat-val">${secToLabel(d.studyTime.totalSecs)||'—'}</div><div class="report-stat-label">Study Time</div></div>
      <div class="report-stat"><div class="report-stat-icon">📅</div><div class="report-stat-val">${d.sessions}</div><div class="report-stat-label">Sessions</div></div>
      <div class="report-stat"><div class="report-stat-icon">✅</div><div class="report-stat-val">${d.attendance.pct!==null?d.attendance.pct+'%':'—'}</div><div class="report-stat-label">Attendance</div></div>
      <div class="report-stat"><div class="report-stat-icon">📝</div><div class="report-stat-val">${d.homework.pct!==null?d.homework.pct+'%':'—'}</div><div class="report-stat-label">HW Done</div></div>
      ${d.avgScore!==null?`<div class="report-stat"><div class="report-stat-icon">🏅</div><div class="report-stat-val">${d.avgScore}%</div><div class="report-stat-label">Avg Score</div></div>`:''}
      <div class="report-stat"><div class="report-stat-icon">🔥</div><div class="report-stat-val">${d.streak}</div><div class="report-stat-label">Streak</div></div>
    </div>
    ${d.studyTime.topSubj?`<div class="report-highlight">⭐ Most studied: <b style="color:${SUB_COLOR[d.studyTime.topSubj]}">${d.studyTime.topSubj}</b> — ${secToLabel(d.studyTime.topSecs)}</div>`:''}
    ${d.exams.length?`<div class="report-highlight">📋 Exams: ${d.exams.join(', ')}</div>`:''}
    <div class="report-subj-bars">
      ${SUBJECTS.map(s=>{const secs=d.studyTime.bySubj[s]||0;const pct=Math.round(secs/maxSecs*100);return secs>0?`<div class="report-subj-row"><span style="color:${SUB_COLOR[s]};font-size:12px;font-weight:700;min-width:64px">${s}</span><div class="report-bar-track"><div class="report-bar-fill" style="width:${pct}%;background:${SUB_COLOR[s]}"></div></div><span style="font-size:11px;color:var(--muted);font-family:var(--mono);min-width:44px;text-align:right">${secToLabel(secs)}</span></div>`:''}).join('')}
    </div>
  </div>`;
}

function renderReports() {
  const today=getToday();
  const[ty,tm]=today.split('-').map(Number);
  const{start:wS,end:wE}=getWeekRange(today);
  const mS=`${ty}-${String(tm).padStart(2,'0')}-01`;

  let html=`<div style="display:flex;justify-content:flex-end;margin-bottom:16px">
    <button class="btn btn-primary" onclick="manualGenerateReports()">⟳ Generate Now</button>
  </div>
  <div class="sec-label" style="margin-bottom:12px">THIS WEEK — LIVE</div>
  ${renderReportCard({data:buildReportData(wS,wE),generatedAt:new Date().toISOString()},`Week of ${fmtDate(wS)}`,`${fmtDate(wS)} — ${fmtDate(wE)}`)}
  <div class="sec-label" style="margin-top:24px;margin-bottom:12px">THIS MONTH — LIVE</div>
  ${renderReportCard({data:buildReportData(mS,today),generatedAt:new Date().toISOString()},MONTHS[tm-1]+' '+ty,`${fmtDate(mS)} — Today`)}`;

  if(weeklyReports.length){
    html+=`<div class="sec-label" style="margin-top:28px;margin-bottom:12px">PAST WEEKLY REPORTS</div>`;
    html+=weeklyReports.slice(0,8).map(r=>renderReportCard(r,`Week of ${fmtDate(r.weekStart)}`,`${fmtDate(r.weekStart)} — ${fmtDate(r.weekEnd)}`)).join('');
  }
  if(monthlyReports.length){
    html+=`<div class="sec-label" style="margin-top:28px;margin-bottom:12px">PAST MONTHLY REPORTS</div>`;
    html+=monthlyReports.slice(0,12).map(r=>{const[y,m]=r.month.split('-').map(Number);return renderReportCard(r,MONTHS[m-1]+' '+y,'Full month report');}).join('');
  }
  if(!weeklyReports.length&&!monthlyReports.length){
    html+=`<div class="empty-state" style="padding:32px;margin-top:20px">Past reports appear automatically. Come back after your first full week!</div>`;
  }
  el('reports-content').innerHTML=html;
}

function manualGenerateReports() {
  const today=getToday();
  const{start}=getWeekRange(today);
  let n=0;
  if(!weeklyReports.find(r=>r.weekStart===start)){const r=generateWeeklyReport(start);if(r)n++;}
  const[ty,tm]=today.split('-').map(Number);
  const lmd=new Date(ty,tm-2,1);
  const pm=`${lmd.getFullYear()}-${String(lmd.getMonth()+1).padStart(2,'0')}`;
  if(!monthlyReports.find(r=>r.month===pm)){const r=generateMonthlyReport(pm);if(r)n++;}
  if(n>0){scheduleSave();toast(`${n} report${n>1?'s':''} generated ✓`);}
  else toast('All reports are up to date ✓');
  renderReports();
}




// ══════════════════════════════════════════════════════
// DISABLE MODE
// ══════════════════════════════════════════════════════
function applyDisabledMode() {
  // Grey-out every nav tab except Profile — no overlay, no popup
  const lockedIds = ['dashboard','exams','attendance','homework','timetable','timer','analytics','syllabus','calendar','planner'];
  lockedIds.forEach(id => {
    const btn = el('nav-' + id);
    if (!btn) return;
    if (appDisabled) {
      btn.classList.add('nav-disabled');
      btn.setAttribute('tabindex', '-1');
    } else {
      btn.classList.remove('nav-disabled');
      btn.removeAttribute('tabindex');
    }
  });
}

function enableAppDisable() {
  appDisabled = true;
  scheduleSave();
  applyDisabledMode();
  showPage('profile');
  toast('App locked 🔐 Only Profile is accessible', 'var(--yellow)');
}

function disableAppDisable() {
  appDisabled = false;
  scheduleSave();
  applyDisabledMode();
  renderProfile();
  toast('App unlocked! Welcome back 🎉', 'var(--green)');
}

function renderDisableSection() {
  if (appDisabled) {
    return `<div class="disable-section-card locked">
      <div class="disable-status-badge">🔐 LOCKED</div>
      <div class="disable-section-title">App is locked</div>
      <div class="disable-section-desc">All tabs are hidden. Only this Profile page is accessible. Unlock whenever you're ready to resume studying.</div>
      <button class="btn btn-primary disable-toggle-btn" onclick="disableAppDisable()">🔓 Unlock App</button>
    </div>`;
  }
  return `<div class="disable-section-card">
    <div class="disable-status-badge unlocked">✓ UNLOCKED</div>
    <div class="disable-section-title">Lock App</div>
    <div class="disable-section-desc">Preparing for board exams? Lock everything so you're not distracted. Only Profile stays open — come back and unlock whenever you're done.</div>
    <button class="btn btn-danger disable-toggle-btn" onclick="enableAppDisable()">🔐 Lock App</button>
  </div>`;
}

// ══════════════════════════════════════════════════════
// EXAM → CALENDAR SYNC
// ══════════════════════════════════════════════════════
function syncExamEvents() {
  // Remove previously auto-synced exam events
  calendarEvents = calendarEvents.filter(e => e._source !== 'exam_sync');
  // Re-add one event per exam that has a date
  exams.forEach(ex => {
    if (!ex.date) return;
    calendarEvents.push({
      id:      -(ex.id),  // negative to distinguish from user events
      title:   ex.name,
      date:    ex.date,
      subject: '',
      type:    'exam',
      note:    'Auto-synced from Exams tab',
      _source: 'exam_sync',
      _examId: ex.id,
    });
  });
}

// ══════════════════════════════════════════════════════
// NOTIFICATIONS
// ══════════════════════════════════════════════════════
function updateNotifBell() {
  const badge = el('notif-bell-badge');
  if (!badge) return;
  const unread = notifications.filter(n => !n.read).length;
  if (unread > 0) {
    badge.textContent = unread > 9 ? '9+' : String(unread);
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

function openNotifPanel() {
  // Mark all as read
  notifications.forEach(n => n.read = true);
  scheduleSave();
  updateNotifBell();
  renderNotifPanel();
  el('notif-panel').classList.add('open');
  el('notif-backdrop').classList.add('open');
}

function closeNotifPanel() {
  el('notif-panel').classList.remove('open');
  el('notif-backdrop').classList.remove('open');
}

function renderNotifPanel() {
  const body = el('notif-panel-body');
  if (!body) return;

  if (!notifications.length) {
    body.innerHTML = `<div style="text-align:center;padding:48px 24px">
      <div style="font-size:48px;margin-bottom:16px">🔔</div>
      <div style="font-weight:700;font-size:16px;color:var(--text);margin-bottom:8px">All caught up!</div>
      <div style="color:var(--muted);font-size:13px;line-height:1.6">Weekly reports will appear here automatically every week. Keep studying!</div>
    </div>`;
    return;
  }

  body.innerHTML = notifications.map(n => {
    const isReport = n.type === 'weekly_report';
    return `<div class="notif-item" id="notif-item-${n.id}">
      <div class="notif-item-top" onclick="${isReport ? `toggleNotifExpand(${n.id})` : ''}">
        <div class="notif-item-icon">${isReport ? '📋' : '🔔'}</div>
        <div class="notif-item-info">
          <div class="notif-item-title">${n.title}</div>
          <div class="notif-item-body">${n.body || ''}</div>
          <div class="notif-item-date">${fmtDate(n.date)}</div>
        </div>
        ${isReport ? `<span class="notif-expand-icon" id="notif-arr-${n.id}">›</span>` : ''}
      </div>
      ${isReport ? `<div class="notif-report-body" id="notif-report-${n.id}" style="display:none">
        ${renderNotifReports(n.data)}
      </div>` : ''}
    </div>`;
  }).join('') +
  `<div style="padding:16px 20px;border-top:1px solid var(--border)">
    <button class="btn btn-ghost" style="width:100%;font-size:12px" onclick="clearNotifs()">Clear All Notifications</button>
  </div>`;
}

function toggleNotifExpand(id) {
  const body = el('notif-report-' + id);
  const arr  = el('notif-arr-' + id);
  if (!body) return;
  const open = body.style.display !== 'none';
  body.style.display = open ? 'none' : 'block';
  if (arr) arr.textContent = open ? '›' : '⌄';
}

function renderNotifReports(data) {
  if (!data) return '<div style="color:var(--muted);padding:12px">No report data.</div>';
  const reports = [...(data.weeklyReports||[]), ...(data.monthlyReports||[])];
  if (!reports.length) return '<div style="color:var(--muted);padding:12px">No reports yet.</div>';
  return reports.map(r => renderReportCard(r,
    r.weekStart ? `Week of ${fmtDate(r.weekStart)}` : (()=>{const[y,m]=(r.month||'').split('-').map(Number);return MONTHS[m-1]+' '+y;})(),
    r.weekStart ? `${fmtDate(r.weekStart)} — ${fmtDate(r.weekEnd)}` : 'Full month report'
  )).join('');
}

function clearNotifs() {
  notifications = [];
  scheduleSave();
  updateNotifBell();
  renderNotifPanel();
}

// Dashboard vacation card style helper
function dashVacCard() {}

// ══════════════════════════════════════════════════════
// CALENDAR — EVENT TYPES & HELPERS
// ══════════════════════════════════════════════════════
const EV_TYPES = {
  submission: { label: 'Submission', icon: '📤', color: '#60A5FA' },
  project:    { label: 'Project',    icon: '🗂',  color: '#C084FC' },
  test:       { label: 'Test/Quiz',  icon: '📝',  color: '#F87171' },
  exam:       { label: 'Exam',       icon: '🎓',  color: '#818CF8' },
  holiday:    { label: 'Holiday',    icon: '🎉',  color: '#34D399' },
  reminder:   { label: 'Reminder',   icon: '⏰',  color: '#FBBF24' },
  other:      { label: 'Other',      icon: '📌',  color: '#94A3B8' },
};

function evColor(ev) {
  if (ev.subject && SUB_COLOR[ev.subject]) return SUB_COLOR[ev.subject];
  return (EV_TYPES[ev.type]||EV_TYPES.other).color;
}

function openEventModal(id) {
  el('event-edit-id').value = id || '';
  if (id) {
    const ev = calendarEvents.find(e => e.id === id);
    if (!ev) return;
    el('event-modal-title').textContent = 'Edit Event';
    el('ev-title-inp').value   = ev.title;
    el('ev-date-inp').value    = ev.date;
    el('ev-subject-inp').value = ev.subject || '';
    el('ev-type-inp').value    = ev.type || 'other';
    el('ev-note-inp').value    = ev.note || '';
  } else {
    el('event-modal-title').textContent = 'Add Event';
    el('ev-title-inp').value   = '';
    el('ev-date-inp').value    = evCalSelDate || getToday();
    el('ev-subject-inp').value = '';
    el('ev-type-inp').value    = 'submission';
    el('ev-note-inp').value    = '';
  }
  openModal('event-modal');
  setTimeout(() => el('ev-title-inp').focus(), 60);
}

function saveEvent() {
  const title = el('ev-title-inp').value.trim();
  const date  = el('ev-date-inp').value;
  if (!title) { toast('Enter a title', 'var(--yellow)'); return; }
  if (!date)  { toast('Pick a date',  'var(--yellow)'); return; }
  const id    = el('event-edit-id').value;
  const ev = {
    id:      id ? parseInt(id) : Date.now(),
    title,
    date,
    subject: el('ev-subject-inp').value,
    type:    el('ev-type-inp').value || 'other',
    note:    el('ev-note-inp').value.trim(),
  };
  if (id) {
    const idx = calendarEvents.findIndex(e => e.id === parseInt(id));
    if (idx !== -1) calendarEvents[idx] = ev; else calendarEvents.push(ev);
  } else {
    calendarEvents.push(ev);
  }
  scheduleSave();
  closeModal('event-modal');
  renderCalendarPage();
  renderDashboard();
  toast(id ? 'Event updated ✓' : `Event "${title}" added ✓`);
}

function deleteEvent(id) {
  calendarEvents = calendarEvents.filter(e => e.id !== id);
  scheduleSave();
  renderCalendarPage();
  renderDashboard();
  toast('Event removed');
}

// ══════════════════════════════════════════════════════
// CALENDAR PAGE RENDERER
// ══════════════════════════════════════════════════════
function renderCalendarPage() {
  renderEvCalGrid();
  renderEvFilterPills();
  renderEvDayPanel();
  renderEvUpcomingList();
}

function evCalPrev() {
  evCalMonth === 0 ? (evCalYear--, evCalMonth = 11) : evCalMonth--;
  renderEvCalGrid();
}
function evCalNext() {
  evCalMonth === 11 ? (evCalYear++, evCalMonth = 0) : evCalMonth++;
  renderEvCalGrid();
}

function renderEvCalGrid() {
  const mnEl = el('ev-cal-month-name');
  const yrEl = el('ev-cal-year-label');
  if (!mnEl) return;
  mnEl.textContent = MONTHS[evCalMonth];
  yrEl.textContent = evCalYear;

  const dim = new Date(evCalYear, evCalMonth + 1, 0).getDate();
  const fd  = new Date(evCalYear, evCalMonth, 1).getDay();
  const today = getToday();

  let h = '';
  for (let i = 0; i < fd; i++) h += '<div class="cal-cell empty"></div>';
  for (let d = 1; d <= dim; d++) {
    const ds = toDateStr(evCalYear, evCalMonth, d);
    const dayEvs = calendarEvents.filter(e => e.date === ds && (
      !evFilterSubj ||
      (evFilterSubj === '__exam' ? e._source === 'exam_sync' : e.subject === evFilterSubj)
    ));
    const isToday    = ds === today;
    const isSel      = ds === evCalSelDate;
    const isVac      = isVacationDay(ds);
    const hasSch     = schoolDays[ds];

    let dotHtml = '';
    if (dayEvs.length) {
      const shown = dayEvs.slice(0, 3);
      dotHtml = `<div class="ev-cal-dots">${shown.map(e =>
        `<span class="ev-cal-dot" style="background:${evColor(e)}" title="${e.title}"></span>`
      ).join('')}${dayEvs.length>3?`<span class="ev-cal-dot-more">+${dayEvs.length-3}</span>`:''}</div>`;
    }

    const att = hasSch ? ` ev-att-${schoolDays[ds]}` : '';
    const cls = ['cal-cell', 'ev-cal-cell',
      dayEvs.length ? 'has-events' : '',
      isToday  ? 'today'    : '',
      isSel    ? 'selected' : '',
      isVac    ? 'vacation' : '',
      att,
    ].filter(Boolean).join(' ');

    h += `<div class="${cls}" onclick="evSelectDay('${ds}')">
      <span class="cal-day-num">${d}</span>
      ${dotHtml}
    </div>`;
  }
  el('ev-cal-grid').innerHTML = h;
}

function evSelectDay(ds) {
  evCalSelDate = evCalSelDate === ds ? null : ds;
  renderEvCalGrid();
  renderEvDayPanel();
}

function renderEvFilterPills() {
  const pillsEl = el('ev-filter-pills');
  if (!pillsEl) return;
  const allActive = !evFilterSubj;
  // Only show "All" + subjects that actually have events
  const subjsWithEvents = SUBJECTS.filter(s => calendarEvents.some(e => e.subject === s));
  // Always show exams filter
  const hasExams = calendarEvents.some(e => e._source === 'exam_sync');
  pillsEl.innerHTML =
    `<button class="evcal-pill ${allActive?'evcal-pill-active':''}" onclick="setEvFilter(null)">All</button>` +
    (hasExams ? `<button class="evcal-pill ${evFilterSubj==='__exam'?'evcal-pill-active':''}" onclick="setEvFilterExam()" style="border-color:#818CF860;color:#818CF8">🎓 Exams</button>` : '') +
    subjsWithEvents.map(s => {
      const active = evFilterSubj === s;
      return `<button class="evcal-pill ${active?'evcal-pill-active':''}" style="${active?'':'border-color:'+SUB_COLOR[s]+'60;color:'+SUB_COLOR[s]}" onclick="setEvFilter('${s}')">${s}</button>`;
    }).join('');
}

function setEvFilter(subj)     { evFilterSubj = subj; renderEvCalGrid(); renderEvFilterPills(); renderEvUpcomingList(); }
function setEvFilterExam()     { evFilterSubj = '__exam'; renderEvCalGrid(); renderEvFilterPills(); renderEvUpcomingList(); }
function setEvFilterType(type) { evFilterSubj = null; renderEvCalGrid(); renderEvFilterPills(); renderEvUpcomingList(); }

function renderEvDayPanel() {
  const labelEl = el('ev-day-label');
  const listEl  = el('ev-day-list');
  if (!labelEl || !listEl) return;

  if (!evCalSelDate) {
    labelEl.textContent = 'SELECT A DAY';
    listEl.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:16px 0">Click a day on the calendar to see its events.</div>';
    return;
  }

  labelEl.textContent = evCalSelDate === getToday() ? 'TODAY' : fmtDate(evCalSelDate).toUpperCase();

  const dayEvs = calendarEvents.filter(e => e.date === evCalSelDate);
  if (!dayEvs.length) {
    listEl.innerHTML = `<div style="color:var(--muted);font-size:13px;padding:12px 0">No events on this day.</div>
      <button class="btn btn-primary" style="width:100%;margin-top:8px" onclick="openEventModal()">+ Add Event Here</button>`;
    return;
  }

  listEl.innerHTML = dayEvs.map(e => {
    const col  = evColor(e);
    const info = EV_TYPES[e.type] || EV_TYPES.other;
    return `<div class="ev-item" style="border-left-color:${col}">
      <div class="ev-item-top">
        <div>
          <div class="ev-item-title">${info.icon} ${e.title}</div>
          <div class="ev-item-meta">
            ${e.subject ? `<span style="color:${col};font-weight:700;font-size:11px">${e.subject}</span> · ` : ''}
            <span style="color:var(--muted);font-size:11px">${info.label}</span>
          </div>
          ${e.note ? `<div class="ev-item-note">${e.note}</div>` : ''}
        </div>
        <div class="ev-item-actions">
          ${!e._source ? `<button class="ev-edit-btn" onclick="openEventModal(${e.id})" title="Edit">✎</button><button class="session-delete" onclick="deleteEvent(${e.id})" title="Delete">✕</button>` : `<span style="font-size:10px;color:var(--muted)">Auto</span>`}
        </div>
      </div>
    </div>`;
  }).join('') +
  `<button class="btn btn-ghost" style="width:100%;margin-top:10px;font-size:13px" onclick="openEventModal()">+ Add Another</button>`;
}

function renderEvUpcomingList() {
  const el2 = el('ev-upcoming-list');
  if (!el2) return;
  const today = getToday();
  let evs = calendarEvents
    .filter(e => e.date >= today && (!evFilterSubj || (evFilterSubj==='__exam' ? e._source==='exam_sync' : e.subject===evFilterSubj)))
    .sort((a,b) => a.date.localeCompare(b.date));

  if (!evs.length) {
    el2.innerHTML = '<div class="empty-state" style="padding:20px">No upcoming events. Add one with the button above!</div>';
    return;
  }

  // Group by date
  const byDate = {};
  evs.forEach(e => { if (!byDate[e.date]) byDate[e.date] = []; byDate[e.date].push(e); });

  el2.innerHTML = Object.entries(byDate).slice(0, 20).map(([ds, evList]) => {
    const daysLeft = Math.max(0, Math.ceil((new Date(ds+'T12:00:00') - new Date(today+'T12:00:00')) / 86400000));
    const urgCol   = daysLeft === 0 ? 'var(--red)' : daysLeft <= 3 ? 'var(--yellow)' : 'var(--muted)';
    return `<div class="ev-upcoming-group">
      <div class="ev-upcoming-date-row">
        <span class="ev-upcoming-date">${ds === today ? 'Today' : fmtDate(ds)}</span>
        <span class="ev-days-badge" style="color:${urgCol}">${daysLeft === 0 ? 'TODAY' : `${daysLeft}d`}</span>
      </div>
      ${evList.map(e => {
        const col  = evColor(e);
        const info = EV_TYPES[e.type] || EV_TYPES.other;
        return `<div class="ev-item" style="border-left-color:${col}">
          <div class="ev-item-top">
            <div>
              <div class="ev-item-title">${info.icon} ${e.title}</div>
              <div class="ev-item-meta">
                ${e.subject?`<span style="color:${col};font-weight:700;font-size:11px">${e.subject}</span> · `:''}
                <span style="color:var(--muted);font-size:11px">${info.label}</span>
                ${e.note?` · <span style="color:var(--muted);font-size:11px;font-style:italic">${e.note}</span>`:''}
              </div>
            </div>
            <div class="ev-item-actions">
              ${!e._source ? `<button class="ev-edit-btn" onclick="openEventModal(${e.id})" title="Edit">✎</button><button class="session-delete" onclick="deleteEvent(${e.id})" title="Delete">✕</button>` : `<span style="font-size:10px;color:var(--muted)">Exam</span>`}
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>`;
  }).join('');
}


// ══════════════════════════════════════════════════════
// FRIENDS
// ══════════════════════════════════════════════════════

async function loadFriends() {
  if (!currentUser) return;
  try {
    const client = getDB();
    // Get all friendships involving current user
    const { data: rows } = await client
      .from('friendships')
      .select('*')
      .or(`requester.eq.${currentUser},recipient.eq.${currentUser}`);
    if (!rows) return;
    friendsList    = rows.filter(r => r.status === 'accepted');
    friendRequests = rows.filter(r => r.status === 'pending');
  } catch(e) { console.error('loadFriends:', e); }
}

async function sendFriendRequest() {
  const inp = el('friend-search-inp');
  if (!inp) return;
  const target = inp.value.trim().toLowerCase();
  if (!target) { toast('Enter a username', 'var(--yellow)'); return; }
  if (target === currentUser) { toast("You can't add yourself!", 'var(--yellow)'); return; }

  try {
    const client = getDB();
    // Check user exists
    const { data: profile } = await client.from('profiles').select('username').eq('username', target).single();
    if (!profile) { toast('User not found', 'var(--red)'); return; }

    // Check if friendship already exists
    const { data: existing } = await client.from('friendships').select('*')
      .or(`and(requester.eq.${currentUser},recipient.eq.${target}),and(requester.eq.${target},recipient.eq.${currentUser})`);
    if (existing && existing.length > 0) {
      const st = existing[0].status;
      if (st === 'accepted') { toast('Already friends!', 'var(--green)'); loadFriends().then(renderFriends); return; }
      if (st === 'pending')  { toast('Request already sent or pending', 'var(--yellow)'); return; }
    }

    await client.from('friendships').insert({ requester: currentUser, recipient: target, status: 'pending' });
    inp.value = '';
    toast(`Friend request sent to ${target} ✓`, 'var(--green)');
    await loadFriends();
    renderFriends();
  } catch(e) { toast('Error sending request', 'var(--red)'); }
}

async function acceptFriendRequest(id) {
  try {
    await getDB().from('friendships').update({ status: 'accepted' }).eq('id', id);
    toast('Friend added! 🎉', 'var(--green)');
    await loadFriends();
    renderFriends();
  } catch(e) { toast('Error', 'var(--red)'); }
}

async function rejectFriendRequest(id) {
  try {
    await getDB().from('friendships').delete().eq('id', id);
    toast('Request declined');
    await loadFriends();
    renderFriends();
  } catch(e) { toast('Error', 'var(--red)'); }
}

async function removeFriend(username) {
  if (!confirm(`Remove ${username} from friends?`)) return;
  try {
    const client = getDB();
    await client.from('friendships').delete()
      .or(`and(requester.eq.${currentUser},recipient.eq.${username}),and(requester.eq.${username},recipient.eq.${currentUser})`);
    toast('Friend removed');
    await loadFriends();
    renderFriends();
  } catch(e) { toast('Error', 'var(--red)'); }
}

let _friendProfileChannel = null;

async function openFriendProfile(username) {
  try {
    const client = getDB();

    // Fetch profile — gracefully handle missing columns (active_session, role may not exist yet)
    let profile = null;
    try {
      const res = await client
        .from('profiles')
        .select('username,display_name,avatar,banner,active_session,role')
        .eq('username', username)
        .single();
      profile = res.data;
    } catch(_) {}
    // Fallback: select only guaranteed columns
    if (!profile) {
      const res2 = await client
        .from('profiles')
        .select('username,display_name,avatar,banner')
        .eq('username', username)
        .single();
      profile = res2.data;
    }
    if (!profile) { toast('Could not load profile', 'var(--red)'); return; }

    // Fetch user data — ok if missing
    let udata = null;
    try {
      const dr = await client.from('user_data').select('*').eq('username', username).single();
      udata = dr.data || null;
    } catch(_) {}

    _renderFriendProfileContent(profile, udata);

    // Tear down any previous realtime subscription
    if (_friendProfileChannel) {
      try { client.removeChannel(_friendProfileChannel); } catch(e) {}
      _friendProfileChannel = null;
    }

    // Subscribe live to profiles row — catches active_session changes (Start/Stop timer)
    _friendProfileChannel = client
      .channel('fp-' + username)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'profiles',
        filter: `username=eq.${username}`
      }, payload => {
        _renderFriendProfileContent({ ...profile, ...payload.new }, udata);
      })
      .subscribe();

    el('friend-profile-modal').classList.add('open');
  } catch(e) {
    console.error('openFriendProfile:', e);
    toast('Could not load profile', 'var(--red)');
  }
}

function _renderFriendProfileContent(profile, udata) {
  const ext         = (udata && udata.extras) ? udata.extras : {};
  const sessions    = (udata && Array.isArray(udata.study_sessions)) ? udata.study_sessions : [];
  const schoolDaysF = (udata && udata.school_days) ? udata.school_days : {};

  const vacRanges   = ext.vacation_ranges || [];
  const today       = getToday();
  const onVacation  = vacRanges.some(v => v.start && v.end && today >= v.start && today <= v.end);

  // Live status — ONLY use active_session (set when timer starts, cleared when stopped)
  // Never fall back to completed sessions — that caused the "stuck studying" bug
  const activeSession   = profile.active_session || null;
  const isStudying      = !onVacation && !!activeSession;
  const studyingSubject = activeSession ? (activeSession.subject || '') : '';

  // Attendance
  const sdVals  = Object.values(schoolDaysF);
  const present = sdVals.filter(v => v === 'present').length;
  const total   = sdVals.filter(v => v !== 'holiday').length;
  const attPct  = total > 0 ? Math.round(present / total * 100) : null;

  // Subject breakdown
  const subjectSecs = {};
  SUBJECTS.forEach(s => subjectSecs[s] = 0);
  sessions.forEach(s => { if (subjectSecs[s.subject] !== undefined) subjectSecs[s.subject] += s.durationSecs; });
  const mostStudied     = SUBJECTS.reduce((a, b) => subjectSecs[a] >= subjectSecs[b] ? a : b, SUBJECTS[0]);
  const mostStudiedSecs = subjectSecs[mostStudied];
  const totalSecs       = sessions.reduce((a, s) => a + s.durationSecs, 0);

  const displayName = profile.display_name || profile.username;
  const role        = profile.role || 'user';
  const roleBadge   = role === 'admin'
    ? '<span style="display:inline-flex;align-items:center;gap:3px;background:rgba(var(--accent-rgb),.15);color:var(--accent);border:1px solid rgba(var(--accent-rgb),.3);border-radius:20px;font-size:10px;font-weight:800;padding:2px 8px;margin-left:6px;vertical-align:middle">🛡 ADMIN</span>'
    : role === 'verified'
    ? '<span title="Verified" style="color:#3B9EFF;font-size:18px;margin-left:4px;vertical-align:middle">✓</span>'
    : '';

  const avatarHTML = profile.avatar
    ? `<img src="${profile.avatar}" style="width:100px;height:100px;border-radius:20px;object-fit:cover;border:3px solid rgba(var(--accent-rgb),.35)"/>`
    : `<div style="width:100px;height:100px;border-radius:20px;background:var(--accent-dim);border:3px solid rgba(var(--accent-rgb),.35);display:flex;align-items:center;justify-content:center;font-size:40px;font-weight:900;color:var(--accent)">${displayName[0].toUpperCase()}</div>`;

  let statusHTML = '';
  if (onVacation) {
    statusHTML = `<div class="friend-status vacation">🏖 On Vacation</div>`;
  } else if (isStudying) {
    statusHTML = `<div class="friend-status studying">📖 Studying ${studyingSubject}</div>`;
  }
  // No badge for "not studying" — cleaner UI

  el('friend-profile-body').innerHTML = `
    <div class="friend-profile-layout">
      <!-- LEFT: banner + avatar -->
      <div class="friend-profile-left">
        <div class="friend-profile-banner" style="${profile.banner ? `background-image:url('${profile.banner}');background-size:cover;background-position:center` : ''}"></div>
        <div class="friend-profile-avatar-wrap">
          <div class="friend-profile-avatar">${avatarHTML}</div>
          <div style="text-align:center">
            <div style="font-size:13px;font-weight:800;color:var(--text)">${displayName}</div>
            <div style="font-size:10px;color:var(--muted);font-family:var(--mono)">@${profile.username}</div>
          </div>
          ${statusHTML}
        </div>
      </div>
      <!-- RIGHT: info + stats + breakdown -->
      <div class="friend-profile-right">
        <div class="friend-profile-name-row">
          <div style="font-size:22px;font-weight:900;color:var(--text);letter-spacing:-.5px;line-height:1.1">${displayName}${roleBadge}</div>
          <div style="font-size:12px;color:var(--muted);font-family:var(--mono);margin-top:4px">@${profile.username}</div>
          ${statusHTML}
        </div>
        <div class="friend-profile-stats">
          <div class="friend-stat-card">
            <div class="friend-stat-val" style="color:var(--accent)">${totalSecs ? secToLabel(totalSecs) : '—'}</div>
            <div class="friend-stat-lbl">Total Study</div>
          </div>
          <div class="friend-stat-card">
            <div class="friend-stat-val" style="color:var(--green)">${attPct !== null ? attPct + '%' : '—'}</div>
            <div class="friend-stat-lbl">Attendance</div>
          </div>
          <div class="friend-stat-card">
            <div class="friend-stat-val" style="color:${SUB_COLOR[mostStudied] || 'var(--accent)'};font-size:${mostStudiedSecs > 0 ? '15' : '20'}px">${mostStudiedSecs > 0 ? mostStudied : '—'}</div>
            <div class="friend-stat-lbl">Top Subject</div>
          </div>
          <div class="friend-stat-card">
            <div class="friend-stat-val" style="color:var(--yellow)">${sessions.length}</div>
            <div class="friend-stat-lbl">Sessions</div>
          </div>
        </div>
        ${mostStudiedSecs > 0 ? `<div class="friend-profile-breakdown">
          <div class="sec-label" style="font-size:9px;letter-spacing:2px">SUBJECT BREAKDOWN</div>
          ${SUBJECTS.map(s => {
            const secs = subjectSecs[s];
            const pct  = Math.round(secs / Math.max(totalSecs, 1) * 100);
            return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
              <span style="color:${SUB_COLOR[s]};font-size:11px;font-weight:800;min-width:60px">${s}</span>
              <div style="flex:1;height:6px;background:var(--border);border-radius:3px;overflow:hidden">
                <div style="width:${pct}%;height:100%;background:${SUB_COLOR[s]};border-radius:3px;transition:width .5s"></div>
              </div>
              <span style="font-size:11px;color:var(--muted);font-family:var(--mono);min-width:36px;text-align:right">${secs ? secToLabel(secs) : '—'}</span>
            </div>`;
          }).join('')}
        </div>` : '<div style="padding:20px;color:var(--muted);font-size:13px;text-align:center">No study sessions yet</div>'}
      </div>
    </div>
  `;
}

function closeFriendProfile() {
  const m = el('friend-profile-modal');
  if (m) m.classList.remove('open');
  if (typeof _friendProfileChannel !== 'undefined' && _friendProfileChannel) {
    try { getDB().removeChannel(_friendProfileChannel); } catch(e) {}
    _friendProfileChannel = null;
  }
}

function renderFriends() {
  const content = el('friends-content');
  if (!content) return;

  // Incoming requests for me
  const incoming = friendRequests.filter(r => r.recipient === currentUser);
  // Outgoing requests I sent
  const outgoing = friendRequests.filter(r => r.requester === currentUser);
  // My accepted friends
  const myFriends = friendsList.map(r => r.requester === currentUser ? r.recipient : r.requester);

  content.innerHTML = `
    <!-- Search / Send Request -->
    <div class="card" style="margin-bottom:18px">
      <div class="sec-label">ADD FRIEND</div>
      <div style="display:flex;gap:10px">
        <input class="inp" id="friend-search-inp" placeholder="Enter their username" style="margin-bottom:0;flex:1"
          onkeydown="if(event.key==='Enter')sendFriendRequest()"/>
        <button class="btn btn-primary" onclick="sendFriendRequest()">Send Request</button>
      </div>
    </div>

    ${incoming.length ? `
    <!-- Incoming requests -->
    <div class="card" style="margin-bottom:18px">
      <div class="sec-label">FRIEND REQUESTS (${incoming.length})</div>
      ${incoming.map(r=>`
        <div class="friend-request-row">
          <div>
            <div style="font-weight:700;font-size:14px;color:var(--text)">@${r.requester}</div>
            <div style="font-size:11px;color:var(--muted)">wants to be your friend</div>
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-primary" style="padding:7px 16px;font-size:12px" onclick="acceptFriendRequest('${r.id}')">Accept</button>
            <button class="btn btn-ghost" style="padding:7px 12px;font-size:12px" onclick="rejectFriendRequest('${r.id}')">Decline</button>
          </div>
        </div>`).join('')}
    </div>` : ''}

    ${outgoing.length ? `
    <!-- Outgoing requests -->
    <div class="card" style="margin-bottom:18px">
      <div class="sec-label">PENDING REQUESTS</div>
      ${outgoing.map(r=>`
        <div class="friend-request-row">
          <div>
            <div style="font-weight:700;font-size:14px;color:var(--text)">@${r.recipient}</div>
            <div style="font-size:11px;color:var(--muted)">request pending…</div>
          </div>
          <button class="btn btn-ghost" style="padding:7px 12px;font-size:12px" onclick="rejectFriendRequest('${r.id}')">Cancel</button>
        </div>`).join('')}
    </div>` : ''}

    <!-- Friends list -->
    <div class="card">
      <div class="sec-label">MY FRIENDS (${myFriends.length})</div>
      ${!myFriends.length
        ? `<div class="empty-state" style="padding:32px">No friends yet — search for a username above to add someone!</div>`
        : `<div class="friends-grid">${myFriends.map(username=>`
          <div class="friend-card" onclick="openFriendProfile('${username}')">
            <div class="friend-card-avatar">${username[0].toUpperCase()}</div>
            <div class="friend-card-name">@${username}</div>
            <div class="friend-card-action">View Profile →</div>
            <button class="friend-remove-btn" onclick="event.stopPropagation();removeFriend('${username}')" title="Remove friend">✕</button>
          </div>`).join('')}
        </div>`}
    </div>
  `;
}

// ══════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════
document.addEventListener('keydown', e=>{
  if(e.key==='Escape') document.querySelectorAll('.modal-overlay.open').forEach(m=>m.classList.remove('open'));
});

// Re-sync timer display immediately when the user switches back to this tab
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (timerState === 'studying') {
      timerSecs = _studyElapsed();
      renderTimerDisplay();
    } else if (timerState === 'break') {
      breakSecs = Math.max(0, _breakRemaining());
      if (breakSecs <= 0) {
        // Break ended while tab was hidden — resume study immediately
        clearInterval(breakInterval); breakInterval=null;
        _breakWallStart=null; _breakBaseSeconds=0;
        toast('Break over! Study timer resumed ▶', 'var(--green)');
        timerState = 'studying';
        _studyWallStart = Date.now();
        timerInterval = setInterval(() => { timerSecs = _studyElapsed(); renderTimerDisplay(); }, 500);
      }
      renderTimerDisplay();
    }
  }
});
