console.log("lessons.js loaded");

const API = window.API_BASE || "http://localhost:5000";

const DAY_START_MIN = 9 * 60;
const DAY_END_MIN = 19 * 60;
const PX_PER_MIN = 1;

let currentWeekStart = startOfWeekMonday(new Date());
let selectedStudentId = null;
let selectedLessonId = null;
let isCreateMode = false;
let isBlockMode = false;

/* ---------------- HELPERS ---------------- */

function toMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function pad(n) { return String(n).padStart(2, "0"); }
function fmtDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function startOfWeekMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0,0,0,0);
  return d;
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
async function fetchJson(url) {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

// 🔹 Calculate price preview based on duration × hourly rate
function calculateLessonPrice(startTime, endTime, hourlyRate) {

  if (!startTime || !endTime || !hourlyRate) return 0;

  const start = toMinutes(startTime);
  const end = toMinutes(endTime);

  if (end <= start) return 0;

  const durationMinutes = end - start;
  const price = (durationMinutes / 60) * hourlyRate;

  return Math.round(price * 100) / 100;
}

/* ---------------- INIT ---------------- */

function initLessons(params = {}) {
  if (!document.getElementById("prev-week")) return;

  selectedStudentId = params.student_id || null;

  setupWeekNav();

  document.getElementById("addLessonBtn").addEventListener("click", openCreateLessonModal);
  document.getElementById("addBlockBtn").addEventListener("click", openBlockModal);
  document.getElementById("saveLessonBtn").addEventListener("click", saveLesson);
  document.getElementById("deleteLessonBtn").addEventListener("click", deleteLesson);
  document.getElementById("lessonModalClose").addEventListener("click", closeLessonModal);

  document.getElementById("lessonModalOverlay").addEventListener("click", (e) => {
    if (e.target.id === "lessonModalOverlay") closeLessonModal();
  });

  loadWeek(currentWeekStart);
}

window.initLessons = initLessons;

/* ---------------- WEEK NAV ---------------- */

function setupWeekNav() {
  document.getElementById("prev-week").addEventListener("click", () => {
    currentWeekStart = addDays(currentWeekStart, -7);
    loadWeek(currentWeekStart);
  });

  document.getElementById("next-week").addEventListener("click", () => {
    currentWeekStart = addDays(currentWeekStart, 7);
    loadWeek(currentWeekStart);
  });

  document.getElementById("today-week").addEventListener("click", () => {
    currentWeekStart = startOfWeekMonday(new Date());
    loadWeek(currentWeekStart);
  });
}

/* ---------------- LOAD WEEK ---------------- */

async function loadWeek(weekStart) {

  const calendar = document.querySelector(".weekly-calendar");

  // If calendar doesn't exist (e.g. student profile page), exit safely
  if (!calendar) return;


  calendar.classList.add("fade-out");

  const start = fmtDate(weekStart);
  const end = fmtDate(addDays(weekStart, 7));

  renderSkeleton(weekStart);

  const blocksUrl = `${API}/blocked_times?start=${start}&end=${end}`;
  const { res: bRes, data: bData } = await fetchJson(blocksUrl);
  if (bRes.ok) renderBlockedTimes(bData);

  let url = `${API}/lessons?start=${start}&end=${end}`;
  if (selectedStudentId) url += `&student_id=${selectedStudentId}`;

  const { res, data } = await fetchJson(url);
  if (res.ok) renderLessons(data);

  calendar.classList.remove("fade-out");
  calendar.classList.add("fade-in");

  setTimeout(() => {
    calendar.classList.remove("fade-in");
  }, 180);
}


/* ---------------- RENDER ---------------- */

function renderSkeleton(weekStart) {
  const header = document.getElementById("weekly-header");
  const timeCol = document.getElementById("time-col");
  const daysGrid = document.getElementById("days-grid");
  const title = document.getElementById("week-title");

  const weekEnd = addDays(weekStart, 6);
  title.textContent = `Weekly Diary (${weekStart.toDateString()} → ${weekEnd.toDateString()})`;

  header.innerHTML = `<div class="header-spacer"></div>`;
  const dayNames = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

  for (let i=0; i<7; i++) {
    const d = addDays(weekStart, i);
    const el = document.createElement("div");
    el.className = "day-head";
    el.textContent = `${dayNames[i]} ${d.getDate()}/${d.getMonth()+1}`;
    header.appendChild(el);
  }

  timeCol.innerHTML = "";
  for (let mins = DAY_START_MIN; mins <= DAY_END_MIN; mins += 60) {
    const row = document.createElement("div");
    row.className = "time-row";
    row.style.height = `${60}px`;
    row.textContent = `${pad(Math.floor(mins/60))}:00`;
    timeCol.appendChild(row);
  }

  daysGrid.innerHTML = "";

  const today = new Date().toISOString().split("T")[0];

  for (let i = 0; i < 7; i++) {

    const dateObj = addDays(weekStart, i);
    const dateStr = fmtDate(dateObj);

    const col = document.createElement("div");
    col.className = "day-col";
    col.dataset.date = dateStr;
    col.style.height = `${(DAY_END_MIN - DAY_START_MIN)}px`;

    // Highlight today
    if (dateStr === today) {
        col.classList.add("today-column");
    }

    col.addEventListener("click", (e) => {
        if (e.target.closest(".lesson-block")) return;
        openCreateFromClick(e, col.dataset.date);
    });

    daysGrid.appendChild(col);
  }


}

function renderLessons(lessons) {
  document.querySelectorAll(".lesson-block").forEach(el => el.remove());

  lessons.forEach(l => {
    const col = document.querySelector(`.day-col[data-date="${l.lesson_date}"]`);
    if (!col) return;

    const start = toMinutes(l.start_time.slice(0,5));
    const end = toMinutes(l.end_time.slice(0,5));

    const top = (start - DAY_START_MIN);
    const height = Math.max(20, (end - start));

    const block = document.createElement("div");
    block.className = "lesson-block";
    block.style.top = `${top}px`;
    block.style.height = `${height}px`;
    block.dataset.type = l.lesson_type;
    block.dataset.paid = l.paid;

    // ===== Lesson Block Content =====
    // Format price safely
    const priceText = l.price
      ? `£${Number(l.price).toFixed(2)}`
      : "";

    // Add paid indicator
    const paidBadge = l.paid
      ? `<div class="lb-paid">Paid</div>`
      : `<div class="lb-unpaid">Unpaid</div>`;

    // Show payment icon if lesson is unpaid
    const paidIcon = !l.paid
      ? `<div class="lb-mark-paid" title="Mark as paid">💷</div>`
      : "";

    block.innerHTML = `
      <div class="lb-time">
          ${l.start_time.slice(0,5)}–${l.end_time.slice(0,5)}
      </div>
      <div class="lb-student">
          ${l.student_name || ""}
      </div>
      <div class="lb-price">
          £${Number(l.price).toFixed(2)}
      </div>
      ${paidIcon}
    `;

    const payBtn = block.querySelector('.lb-mark-paid');

    if (payBtn) {
      payBtn.addEventListener('click', async (e) => {
        e.stopPropagation(); // Prevent opening lesson modal

        await fetch(`${API}/lessons/${l.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paid: true })
        });

        // Reload week to refresh UI + revenue
        loadWeek(currentWeekStart);
      });
    }

    block.addEventListener("click", () => openLessonModal(l));
    col.appendChild(block);
  });
}

function renderBlockedTimes(blocks) {
  document.querySelectorAll(".blocked-block").forEach(el => el.remove());

  blocks.forEach(b => {
    const col = document.querySelector(`.day-col[data-date="${b.block_date}"]`);
    if (!col) return;

    const start = toMinutes(b.start_time.slice(0,5));
    const end = toMinutes(b.end_time.slice(0,5));

    const block = document.createElement("div");
    block.className = "blocked-block";
    block.style.top = `${(start - DAY_START_MIN)}px`;
    block.style.height = `${(end - start)}px`;

    block.innerHTML = `<div>${b.start_time.slice(0,5)}–${b.end_time.slice(0,5)}</div>`;
    col.appendChild(block);
  });
}

/* ---------------- MODAL ---------------- */

function openLessonModal(l) {

  //debug line to be removed
  console.log("Paid from DB:", l.paid, typeof l.paid);

  // Store hourly rate on modal for live calculations
  window.currentHourlyRate = l.students?.hourly_rate || 0;
  
  // Set price field (default to 0 if null)
  // Populate price when editing existing lesson
  document.getElementById("editLessonPrice").textContent =
    `£${Number(l.price).toFixed(2)}`;

  document.getElementById("lessonFields").style.display = "block";
  document.getElementById("blockFields").style.display = "none";

  isCreateMode = false;
  isBlockMode = false;
  selectedLessonId = l.id;

  document.getElementById("lessonModalTitle").textContent = l.student_name || "Lesson";
  document.getElementById("editLessonDate").value = l.lesson_date;
  document.getElementById("editStartTime").value = l.start_time.slice(0,5);
  document.getElementById("editEndTime").value = l.end_time.slice(0,5);
  document.getElementById("editLessonType").value = l.lesson_type;
  const paidSelect = document.getElementById("editLessonPaid");

  if (paidSelect) {
    paidSelect.value = l.paid ? "Yes" : "No";
  }

  document.getElementById("lessonModalOverlay").classList.remove("hidden");

  // Ensure modal buttons work when opened outside weekly calendar
  const saveBtn = document.getElementById("saveLessonBtn");
  const deleteBtn = document.getElementById("deleteLessonBtn");
  const closeBtn = document.getElementById("lessonModalClose");

  if (saveBtn && !saveBtn.dataset.bound) {
    saveBtn.addEventListener("click", saveLesson);
    saveBtn.dataset.bound = "true";
  }

  if (deleteBtn && !deleteBtn.dataset.bound) {
    deleteBtn.addEventListener("click", deleteLesson);
    deleteBtn.dataset.bound = "true";
  }

  if (closeBtn && !closeBtn.dataset.bound) {
    closeBtn.addEventListener("click", closeLessonModal);
    closeBtn.dataset.bound = "true";
  }

  const startInput = document.getElementById("editStartTime");
  const endInput = document.getElementById("editEndTime");

  function updateLivePrice() {
    const price = calculateLessonPrice(
      startInput.value,
      endInput.value,
      window.currentHourlyRate
    );

    document.getElementById("editLessonPrice").textContent =
      `£${price.toFixed(2)}`;
  }

  // Run once immediately
  updateLivePrice();

  // Update whenever time changes
  startInput.addEventListener("input", updateLivePrice);
  endInput.addEventListener("input", updateLivePrice);

}

async function openCreateLessonModal() {

  // Fetch selected student's hourly rate for live price calculation
  if (selectedStudentId) {
    const { res, data } = await fetchJson(`${API}/students/${selectedStudentId}`);

    if (res.ok) {
      window.currentHourlyRate = data.hourly_rate || 0;
    } else {
      window.currentHourlyRate = 0;
    }
  } else {
    window.currentHourlyRate = 0;
  }

  // Show lesson fields
  document.getElementById("lessonFields").style.display = "block";
  document.getElementById("blockFields").style.display = "none";

  isCreateMode = true;
  isBlockMode = false;
  selectedLessonId = null;

  // Set modal defaults
  document.getElementById("lessonModalTitle").textContent = "Create Lesson";
  document.getElementById("editLessonType").value = "Lesson";
  document.getElementById("editLessonPaid").value = "No";

  document.getElementById("lessonModalOverlay").classList.remove("hidden");

  const startInput = document.getElementById("editStartTime");
  const endInput = document.getElementById("editEndTime");

  // Update price preview when times change
  function updateLivePrice() {
    const price = calculateLessonPrice(
      startInput.value,
      endInput.value,
      window.currentHourlyRate
    );

    document.getElementById("editLessonPrice").textContent =
      `£${price.toFixed(2)}`;
  }

  // Run once immediately
  updateLivePrice();

  // Update whenever times change
  startInput.addEventListener("input", updateLivePrice);
  endInput.addEventListener("input", updateLivePrice);
}

function openBlockModal() {
  document.getElementById("lessonFields").style.display = "none";
  const blockFields = document.getElementById("blockFields");
  blockFields.style.display = "block";

  isCreateMode = false;
  isBlockMode = true;
  selectedLessonId = null;

  document.getElementById("lessonModalTitle").textContent = "Create Blocked Time";

  blockFields.innerHTML = `
    <label>Date</label>
    <input id="blockDate" type="date" class="form-input"/>
    <label>Start</label>
    <input id="blockStart" type="time" class="form-input"/>
    <label>End</label>
    <input id="blockEnd" type="time" class="form-input"/>
    <label>Reason</label>
    <input id="blockReason" type="text" class="form-input"/>
  `;

  document.getElementById("blockDate").value = fmtDate(currentWeekStart);
  document.getElementById("blockStart").value = "12:00";
  document.getElementById("blockEnd").value = "13:00";

  document.getElementById("lessonModalOverlay").classList.remove("hidden");
}

function closeLessonModal() {
  document.getElementById("lessonModalOverlay").classList.add("hidden");
}

async function saveLesson() {

  if (isBlockMode) {
    const block_date = document.getElementById("blockDate").value;
    const start_time = document.getElementById("blockStart").value;
    const end_time = document.getElementById("blockEnd").value;
    const reason = document.getElementById("blockReason").value;

    const res = await fetch(`${API}/blocked_times`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ block_date, start_time, end_time, reason })
    });

    if (!res.ok) return alert("Failed to create blocked time");

  } else if (isCreateMode) {

    if (!selectedStudentId) return alert("Select a student first");

    const res = await fetch(`${API}/lessons`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student_id: selectedStudentId,
        lesson_date: document.getElementById("editLessonDate").value,
        start_time: document.getElementById("editStartTime").value,
        end_time: document.getElementById("editEndTime").value,
        lesson_type: document.getElementById("editLessonType").value,
        paid: document.getElementById("editLessonPaid").value === "Yes",
      })
    });

    if (!res.ok) {
      const err = await res.json();
      return alert(err.error || "Failed to create lesson");
    }

  } else {

    const res = await fetch(`${API}/lessons/${selectedLessonId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lesson_date: document.getElementById("editLessonDate").value,
        start_time: document.getElementById("editStartTime").value,
        end_time: document.getElementById("editEndTime").value,
        lesson_type: document.getElementById("editLessonType").value,
        paid: document.getElementById("editLessonPaid").value === "Yes",
      })
    });

    if (!res.ok) {
      const err = await res.json();
      return alert(err.error || "Failed to update lesson");
    }
  }

  closeLessonModal();
  // If calendar exists → refresh weekly view
  if (document.querySelector(".weekly-calendar")) {
    await loadWeek(currentWeekStart);
  }

  // If student profile exists → refresh student lessons
  if (window.loadStudentLessons && window.currentStudentId) {
    window.loadStudentLessons(window.currentStudentId);
  }
}

async function deleteLesson() {
  if (!selectedLessonId) return;

  await fetch(`${API}/lessons/${selectedLessonId}`, { method: "DELETE" });
  closeLessonModal();
  loadWeek(currentWeekStart);
}

function openCreateFromClick(e, date) {

  const rect = e.currentTarget.getBoundingClientRect();
  const clickY = e.clientY - rect.top;

  const minutesFromStart = Math.floor(clickY / PX_PER_MIN);
  const absoluteMinutes = DAY_START_MIN + minutesFromStart;

  let snapped = Math.floor(absoluteMinutes / 15) * 15;

  // Clamp to fit inside 09:00–19:00
  if (snapped + 60 > DAY_END_MIN) {
    snapped = DAY_END_MIN - 60;
  }

  const startHour = Math.floor(snapped / 60);
  const startMin = snapped % 60;

  const endMinutes = snapped + 60;
  const endHour = Math.floor(endMinutes / 60);
  const endMin = endMinutes % 60;

  openCreateLessonModal();

  document.getElementById('editLessonDate').value = date;
  document.getElementById('editStartTime').value =
    `${pad(startHour)}:${pad(startMin)}`;
  document.getElementById('editEndTime').value =
    `${pad(endHour)}:${pad(endMin)}`;
}
