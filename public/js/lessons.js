const API = window.API_BASE || "http://localhost:5000";

const DAY_START_MIN = 9 * 60;
const DAY_END_MIN = 19 * 60;
const PX_PER_MIN = 1;

let currentWeekStart = startOfWeekMonday(new Date());
let selectedStudentId = null;
let selectedLessonId = null;
let isCreateMode = false;
let isBlockMode = false;

// ================================
// GLOBAL LESSON CLICK HANDLERS
// ================================
document.addEventListener("click", (e) => {

  if (e.target.closest("#addLessonBtn")) window.openCreateLessonModal();
  if (e.target.closest("#addBlockBtn")) window.openBlockModal();
  if (e.target.closest("#saveLessonBtn")) window.saveLesson();
  if (e.target.closest("#deleteLessonBtn")) window.deleteLesson();
  if (e.target.closest("#lessonModalClose")) window.closeLessonModal();
  if (e.target.id === "lessonModalOverlay") window.closeLessonModal();
});

/* ---------------- HELPERS ---------------- */

// Convert +447XXXXXXXXX → 447XXXXXXXXX for WhatsApp
function phoneForWhatsApp(phone) {
  return phone.replace("+", "");
}

// Build WhatsApp lesson confirmation message
function buildWhatsAppMessage(studentName, lessonDate, startTime, endTime, price, lessonType) {

  const date = new Date(lessonDate).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long"
  });

  return `🚗 Ready Set Drive Lesson Confirmation

Hi ${studentName},

Your ${lessonType} has been booked.

📅 ${date}
⏰ ${startTime} – ${endTime}
💷 Price: £${price}

See you then!
Ready Set Drive`;
}


// Generate WhatsApp link
function buildWhatsAppLink(phone, message) {
  return `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;
}

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

async function initLessons(params = {}) {
  if (!document.getElementById("prev-week")) return;

  selectedStudentId = params.student_id || null;
  window.isStudentView = !!params.student_id;

  if (selectedStudentId) {

    const res = await fetch(`${API}/students/${selectedStudentId}`);
    const student = await res.json();

    window.selectedStudentPhone = student.phone;
    window.selectedStudentName = student.first_name;

    document.getElementById("lessonModalTitle").textContent =
      `Lesson – ${window.selectedStudentName}`;

  }

  setupWeekNav();
  loadWeek(currentWeekStart);
  setupStudentSearch();
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

        const { res } = await fetchJson(`${API_BASE}/lessons/${l.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paid: true })
        });

        if ( !res.ok ) {
          alert("Failed to update lesson");
          return;
        }

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

  if (l.student_id) {
    if (typeof toggleStudentSelect === "function") {
      toggleStudentSelect(false); // editing existing lesson
    }
  } else {
    if (typeof toggleStudentSelect === "function") {
      toggleStudentSelect(true);
    }
  }

  document.getElementById("lessonModalTitle").textContent = l.student_name || "Lesson";
  const studentSearch = document.getElementById("lessonStudentSearch");
  const studentResults = document.getElementById("lessonStudentResults");

  if (studentSearch && studentResults) {
    if (l.student_id) {
      studentSearch.value = l.student_name || "";
      studentSearch.style.display = "none";
      studentResults.style.display = "none";
    } else {
      studentSearch.value = "";
      studentSearch.style.display = "block";
      studentResults.style.display = "block";
    }
  }

  document.getElementById("editLessonDate").value = l.lesson_date;
  document.getElementById("editStartTime").value = l.start_time.slice(0,5);
  document.getElementById("editEndTime").value = l.end_time.slice(0,5);
  document.getElementById("editLessonType").value = l.lesson_type;
  const paidSelect = document.getElementById("editLessonPaid");

  if (paidSelect) {
    paidSelect.value = l.paid ? "Yes" : "No";
  }

  const modal = document.getElementById("lessonModalOverlay");
  if (!modal) return;
  modal.classList.remove("hidden");
  // Search student
  setupStudentSearch();

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

window.openCreateLessonModal = async function () {

  console.log("currentStudentId:", window.currentStudentId);

  const isStudentView = !!window.currentStudentId;

  // Fetch hourly rate if in student view
  if (window.currentStudentId) {
    const { res, data } = await fetchJson(`${API}/students/${window.currentStudentId}`);

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

  // Toggle student select
  if (typeof toggleStudentSelect === "function") {
    toggleStudentSelect(!isStudentView);
  }

  // Modal defaults
  if (isStudentView) {
    const student = window.allStudents.find(
      s => s.id === window.currentStudentId
    );

    document.getElementById("lessonModalTitle").textContent =
      student
        ? `Create Lesson – ${student.first_name} ${student.last_name}`
        : "Create Lesson";
  } else {
    document.getElementById("lessonModalTitle").textContent = "Create Lesson";
  }
  document.getElementById("editLessonType").value = "Lesson";
  document.getElementById("editLessonPaid").value = "No";

  const studentSearch = document.getElementById("lessonStudentSearch");
  const studentResults = document.getElementById("lessonStudentResults");

  if (studentSearch && studentResults) {

    if (isStudentView) {
      const student = window.allStudents.find(
        s => s.id === window.currentStudentId
      );

      studentSearch.value = student
        ? `${student.first_name} ${student.last_name}`
        : "";

      studentSearch.dataset.studentId = window.currentStudentId;

      studentSearch.style.display = "none";
      studentResults.style.display = "none";

    } else {
      studentSearch.value = "";
      studentSearch.dataset.studentId = "";
      studentSearch.style.display = "block";
      studentResults.style.display = "block";
    }
  }

  // Open modal
  const modal = document.getElementById("lessonModalOverlay");

  if (!modal) {
    console.error("❌ Modal not found");
    return;
  }

  modal.classList.remove("hidden");

  setupStudentSearch();

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

  updateLivePrice();

  startInput.addEventListener("input", updateLivePrice);
  endInput.addEventListener("input", updateLivePrice);
};

function openBlockModal() {

  const lessonFields = document.getElementById("lessonFields");
  lessonFields.style.display = "none";
    
  const blockFields = document.getElementById("blockFields");
  blockFields.style.display = "block";

  isCreateMode = false;
  isBlockMode = true;
  selectedLessonId = null;

  document.getElementById("lessonModalTitle").textContent = "Blocked Time";

  const studentSearch = document.getElementById("lessonStudentSearch");
  const studentResults = document.getElementById("lessonStudentResults");

  if (selectedStudentId) {
    // Opened from student profile
    studentSearch.value = window.selectedStudentName || "";
    studentSearch.style.display = "none";
    studentResults.style.display = "none";
  } else {
    // Opened from global calendar
    studentSearch.value = "";
    studentSearch.style.display = "block";
    studentResults.style.display = "block";
  }

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

  const modal = document.getElementById("lessonModalOverlay");
  if (!modal) return;
  setupStudentSearch();

  modal.classList.remove("hidden");

}

function closeLessonModal() {
  const modal = document.getElementById("lessonModalOverlay");
  if (!modal) return;
  modal.classList.add("hidden");
}

function setupStudentSearch(){

  const input = document.getElementById("lessonStudentSearch");
  const results = document.getElementById("lessonStudentResults");

  if(!input || !results) return;

  input.addEventListener("input", () => {

    const query = input.value.toLowerCase();

    results.innerHTML = "";

    if(!query) return;

    const matches = window.allStudents.filter(s =>
      `${s.first_name} ${s.last_name}`.toLowerCase().includes(query)
    );

    matches.slice(0,5).forEach(student => {

      const div = document.createElement("div");
      div.className = "student-search-item";
      div.textContent = `${student.first_name} ${student.last_name}`;

      div.addEventListener("click", () => {
        input.value = `${student.first_name} ${student.last_name}`;
        input.dataset.studentId = student.id;
        results.innerHTML = "";
      });

      results.appendChild(div);

    });

  });

}

async function saveLesson() {

  const student_id =
    window.currentStudentId ||
    document.getElementById("lessonStudentSearch")?.dataset.studentId;

  if (isBlockMode) {
    const block_date = document.getElementById("blockDate").value;
    const start_time = document.getElementById("blockStart").value;
    const end_time = document.getElementById("blockEnd").value;
    const reason = document.getElementById("blockReason").value;

    const {res, data} = await fetchJson(`${API_BASE}/blocked_times`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ block_date, start_time, end_time, reason })
    });

    if (!res.ok) return alert("Failed to create blocked time");

  } else if (isCreateMode) {

    if (!student_id) return alert("Select a student first");

    const { res, data } = await fetchJson(`${API_BASE}/lessons`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student_id: student_id,
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

    const { res } = await fetchJson(`${API_BASE}/lessons/${selectedLessonId}`, {
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

  // Optional WhatsApp confirmation
  const sendWhatsApp = document.getElementById("sendWhatsApp")?.checked;

  if (sendWhatsApp && window.selectedStudentPhone && window.selectedStudentName) {

    const phone = phoneForWhatsApp(window.selectedStudentPhone);

    const message = buildWhatsAppMessage(
      window.selectedStudentName,
      document.getElementById("editLessonDate").value,
      document.getElementById("editStartTime").value,
      document.getElementById("editEndTime").value,
      document.getElementById("editLessonPrice").textContent,
      document.getElementById("editLessonType").value
    );

    const link = buildWhatsAppLink(phone, message);

    window.open(link, "_blank", "noopener,noreferrer");
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

  const { res } = await fetchJson(`${API_BASE}/lessons/${selectedLessonId}`, {
    method: "DELETE" });

  if (!res.ok) {
    alert("Failed to delete lesson");
    return;
  }

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
