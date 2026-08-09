// ---------- Utilities ----------
const $ = (sel) => document.querySelector(sel);

function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

// week starts Monday (local time)
function startOfWeekMonday(d = new Date()){
  const date = new Date(d);
  const day = date.getDay(); // 0=Sun ... 6=Sat
  const diff = (day === 0) ? -6 : (1 - day); // shift to Monday
  date.setDate(date.getDate() + diff);
  date.setHours(0,0,0,0);
  return date;
}

function addDays(date, days){
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toISODateLocal(date){
  const y = date.getFullYear();
  const m = String(date.getMonth()+1).padStart(2,'0');
  const da = String(date.getDate()).padStart(2,'0');
  return `${y}-${m}-${da}`;
}

function formatShortDate(date){
  return date.toLocaleDateString(undefined, { month:"short", day:"numeric" });
}

function safeURL(url){
  try{
    const u = new URL(url);
    return u.toString();
  }catch{
    return "";
  }
}

function escapeHTML(str){
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// ---------- App state & Storage ----------
const STORAGE_KEY = "weekly_todo_tasks_v1";

function saveTasks(){
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState.tasks));
  } catch(e) {
    console.error("Failed to save tasks to localStorage:", e);
  }
}

function loadTasks(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw){
      const parsed = JSON.parse(raw);
      if(Array.isArray(parsed)){
        appState.tasks = parsed;
      }
    }
  } catch(e) {
    console.error("Failed to load tasks from localStorage:", e);
  }
}

const appState = {
  weekStart: startOfWeekMonday(),
  tasks: [] // { id, title, dayIndex(0..6=Mon..Sun), dueDate, notes, link, attachments:[...] , done:boolean, createdAt }
};

const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

// ---------- Render week & form ----------
function init(){
  loadTasks();
  buildDaySelect();
  renderWeek();
  bindEvents();
  updateWeekStats();
  updateWeekProgress();
}

function buildDaySelect(){
  const sel = $("#taskDay");
  const mDay = $("#mDay");
  sel.innerHTML = "";
  mDay.innerHTML = "";

  DAYS.forEach((name, idx) => {
    const opt = document.createElement("option");
    opt.value = String(idx);
    opt.textContent = name;
    sel.appendChild(opt);

    const opt2 = document.createElement("option");
    opt2.value = String(idx);
    opt2.textContent = name;
    mDay.appendChild(opt2);
  });

  // default: today
  const today = new Date();
  const msDiff = today - appState.weekStart;
  const dayIdx = clamp(Math.floor(msDiff / (24*60*60*1000)), 0, 6);
  const computedIdx = (today.getDay() === 0) ? 6 : (today.getDay()-1); // Sun => 6
  $("#taskDay").value = String(computedIdx);
}

function renderWeek(){
  saveTasks();
  const grid = $("#daysGrid");
  grid.innerHTML = "";

  for(let dayIndex=0; dayIndex<7; dayIndex++){
    const dayDate = addDays(appState.weekStart, dayIndex);
    const listEl = document.createElement("div");
    listEl.className = "list";

    const tasksForDay = appState.tasks
      .filter(t => t.dayIndex === dayIndex)
      .sort((a,b) => b.createdAt - a.createdAt);

    for(const t of tasksForDay){
      listEl.appendChild(renderTaskCard(t));
    }

    const dayEl = document.createElement("div");
    dayEl.className = "day";
    dayEl.dataset.dayIndex = String(dayIndex);

    const name = DAYS[dayIndex];
    const badgeCount = tasksForDay.length;

    dayEl.innerHTML = `
      <div class="dayHd">
        <div class="name">
          <strong>${escapeHTML(name)}</strong>
          <span>${escapeHTML(formatShortDate(dayDate))}</span>
        </div>
        <div class="badge">${badgeCount} task${badgeCount===1?"":"s"}</div>
      </div>
    `;
    dayEl.appendChild(listEl);

    grid.appendChild(dayEl);
  }

  updateWeekStats();
  updateWeekProgress();
}

function renderTaskCard(task){
  const el = document.createElement("div");
  el.className = "item";
  el.dataset.id = task.id;

  const done = !!task.done;

  const linkHTML = task.link ? `
    <div class="chip" title="Task link">
      <span>🔗</span>
      <a href="${escapeHTML(task.link)}" target="_blank" rel="noopener noreferrer">${escapeHTML(task.link)}</a>
    </div>
  ` : "";

  const filesHTML = (task.attachments?.length)
    ? `<div class="files" title="Attached files (session)">
        ${task.attachments.map(a => `
          <div class="fileTag">
            <span>📎</span>
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:160px;display:inline-block;">${escapeHTML(a.name)}</span>
          </div>
        `).join("")}
       </div>`
    : "";

  el.innerHTML = `
    <div class="itemTop">
      <div class="itemTitle">
        <div class="check" role="checkbox" aria-checked="${done}" data-checked="${done}">
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M16.7 5.8L8.3 14.2L3.3 9.2" stroke="rgba(255,255,255,.95)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="txt">
          <div class="t">${escapeHTML(task.title)}</div>
          ${task.notes ? `<div class="d">${escapeHTML(task.notes)}</div>` : `<div class="d">No notes</div>`}
        </div>
      </div>
    </div>

    <div class="itemMeta">
      ${task.dueDate ? `<div class="chip" title="Due date"><span>📅</span><span>${escapeHTML(task.dueDate)}</span></div>` : ""}
      ${linkHTML}
    </div>

    ${filesHTML}

    <div class="itemActions">
      <div class="miniBtns">
        <div class="mini" data-action="edit" role="button">Edit</div>
        <div class="mini danger" data-action="delete" role="button">Delete</div>
      </div>
      <div style="color:var(--muted);font-size:12px;">
        Status: <strong style="color:${done?'var(--accent2)':'var(--muted)'}">${done?'Done':'Open'}</strong>
      </div>
    </div>
  `;

  // click handlers
  el.querySelector(".check").addEventListener("click", () => {
    task.done = !task.done;
    renderWeek();
  });

  el.querySelector('[data-action="edit"]').addEventListener("click", () => openModal(task.id));
  el.querySelector('[data-action="delete"]').addEventListener("click", () => deleteTask(task.id, true));

  // style for done
  if(done){
    el.style.opacity = ".92";
    el.querySelector(".t").style.textDecoration = "line-through";
    el.querySelector(".t").style.textDecorationThickness = "2px";
  }

  return el;
}

function updateWeekStats(){
  $("#taskCount").textContent = String(appState.tasks.length);
  // Update badges by re-rendering week (already does) -> no extra needed
}

function updateWeekProgress(){
  const total = appState.tasks.length;
  const done = appState.tasks.filter(t => t.done).length;
  const pct = total ? Math.round((done/total)*100) : 0;
  $("#weekProgress").textContent = pct + "%";
}

// ---------- Modal ----------
let modalTaskId = null;

function openModal(taskId){
  modalTaskId = taskId;
  const task = appState.tasks.find(t => t.id === taskId);
  if(!task) return;

  $("#modalTitle").textContent = "Task details";
  $("#modalSubtitle").textContent = "Update title, day, due date, notes, link, and attachments.";

  $("#mTitle").value = task.title ?? "";
  $("#mDay").value = String(task.dayIndex ?? 0);
  $("#mDue").value = task.dueDate ?? "";
  $("#mNotes").value = task.notes ?? "";
  $("#mLink").value = task.link ?? "";

  // files list
  const filesWrap = $("#mFiles");
  filesWrap.innerHTML = "";
  (task.attachments || []).forEach(a => {
    const tag = document.createElement("div");
    tag.className = "fileTag";
    tag.title = `${a.type || "file"} • ${a.size ? (a.size + " bytes") : ""}`;
    tag.innerHTML = `<span>📎</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:220px;display:inline-block;">${escapeHTML(a.name)}</span>`;
    filesWrap.appendChild(tag);
  });

  $("#mNewFiles").value = "";
  $("#modalBackdrop").dataset.open = "true";
}

function closeModal(){
  modalTaskId = null;
  $("#modalBackdrop").dataset.open = "false";
}

function deleteTask(taskId, fromUser){
  const task = appState.tasks.find(t => t.id === taskId);
  if(!task) return;

  // Clean up Object URLs to avoid memory leaks
  (task.attachments || []).forEach(a => {
    try { URL.revokeObjectURL(a.url); } catch {}
  });

  appState.tasks = appState.tasks.filter(t => t.id !== taskId);
  renderWeek();
  if(fromUser) closeModal();
}

// ---------- Events ----------
function bindEvents(){
  $("#taskForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const title = $("#taskTitle").value.trim();
    const dayIndex = Number($("#taskDay").value);
    const dueDate = $("#taskDue").value ? $("#taskDue").value : "";
    const notes = $("#taskNotes").value.trim();
    const link = $("#taskLink").value.trim();
    const linkOk = link ? safeURL(link) : "";

    const fileInput = $("#taskFiles");
    const files = Array.from(fileInput.files || []);

    const attachments = files.map(f => ({
      name: f.name,
      type: f.type || "",
      size: f.size || 0,
      url: URL.createObjectURL(f)
    }));

    const id = "t_" + Math.random().toString(16).slice(2) + "_" + Date.now();

    appState.tasks.push({
      id,
      title,
      dayIndex,
      dueDate,
      notes,
      link: linkOk || "",
      attachments,
      done: false,
      createdAt: Date.now()
    });

    // reset form
    $("#taskTitle").value = "";
    $("#taskNotes").value = "";
    $("#taskLink").value = "";
    $("#taskDue").value = "";
    $("#taskFiles").value = "";

    renderWeek();
  });

  $("#btnFillSample").addEventListener("click", () => {
    const today = new Date();
    const computedIdx = (today.getDay() === 0) ? 6 : (today.getDay()-1);

    const id = "t_" + Math.random().toString(16).slice(2) + "_" + Date.now();

    appState.tasks.push({
      id,
      title: "Sample: weekly practice target",
      dayIndex: computedIdx,
      dueDate: toISODateLocal(today),
      notes: "1) Review notes\n2) Do 20 minutes practice\n3) Summarize key takeaways",
      link: "https://example.com",
      attachments: [],
      done: false,
      createdAt: Date.now()
    });
    renderWeek();
  });

  $("#btnClearDone").addEventListener("click", () => {
    // remove completed tasks + revoke URLs
    const doneTasks = appState.tasks.filter(t => t.done);
    doneTasks.forEach(t => (t.attachments || []).forEach(a => { try{ URL.revokeObjectURL(a.url);}catch{}; }));
    appState.tasks = appState.tasks.filter(t => !t.done);
    renderWeek();
  });

  $("#btnResetWeek").addEventListener("click", () => {
    if(appState.tasks.length === 0) return;
    // revoke all
    appState.tasks.forEach(t => (t.attachments || []).forEach(a => { try{ URL.revokeObjectURL(a.url);}catch{}; }));
    appState.tasks = [];
    renderWeek();
  });

  $("#modalClose").addEventListener("click", closeModal);
  $("#modalBackdrop").addEventListener("click", (e) => {
    if(e.target === $("#modalBackdrop")) closeModal();
  });

  $("#modalSave").addEventListener("click", () => {
    if(!modalTaskId) return;
    const task = appState.tasks.find(t => t.id === modalTaskId);
    if(!task) return;

    task.title = $("#mTitle").value.trim() || "Untitled task";
    task.dayIndex = Number($("#mDay").value);
    task.dueDate = $("#mDue").value || "";
    task.notes = $("#mNotes").value.trim();
    const link = $("#mLink").value.trim();
    task.link = link ? safeURL(link) : "";

    // append new attachments
    const fileInput = $("#mNewFiles");
    const files = Array.from(fileInput.files || []);
    if(files.length){
      const newAttachments = files.map(f => ({
        name: f.name,
        type: f.type || "",
        size: f.size || 0,
        url: URL.createObjectURL(f)
      }));
      task.attachments = (task.attachments || []).concat(newAttachments);
    }

    closeModal();
    renderWeek();
  });

  $("#modalDelete").addEventListener("click", () => {
    if(!modalTaskId) return;
    deleteTask(modalTaskId, false);
    closeModal();
  });

  // optional: allow ESC to close modal
  document.addEventListener("keydown", (e) => {
    if(e.key === "Escape" && $("#modalBackdrop").dataset.open === "true"){
      closeModal();
    }
  });
}

init();


// Completed