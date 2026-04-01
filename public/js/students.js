const API_BASE = window.API_BASE;

// Global variable
window.currentStudentId = null;

// Store lessons so we can filter them without reloading from the server
let currentLessons = [];

// used for pagenation
let studentLimit = 20;

// Student dashboard filtering state
let studentFilter = "active";
let studentSearch = "";
let allStudents = [];
let studentPriorityFilter = "all";

/*async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  return { res, data };
}*/

function renderTestSummary(tests) {
  const summaryBox = document.getElementById("test-summary");

  if (!summaryBox) return;

  // Split tests
  const theoryTests = tests.filter(t => t.test_type === "theory");
  const practicalTests = tests.filter(t => t.test_type === "practical");

  // Counts
  const theoryAttempts = theoryTests.length;
  const practicalAttempts = practicalTests.length;

  // Find pass
  const theoryPass = theoryTests.find(t => t.result === "pass");
  const practicalPass = practicalTests.find(t => t.result === "pass");

  // ===== THEORY STATUS =====
  let theoryStatus = "Not taken";

  if (theoryAttempts > 0) {
    if (theoryPass) {
      theoryStatus = `Passed (${theoryAttempts} attempt${theoryAttempts > 1 ? "s" : ""})`;
    } else {
      theoryStatus = `Not passed (${theoryAttempts} attempt${theoryAttempts > 1 ? "s" : ""})`;
    }
  }

  // ===== PRACTICAL STATUS =====
  let practicalStatus = "Not taken";

  if (practicalAttempts > 0) {
    if (practicalPass) {
      practicalStatus = `Passed (${practicalAttempts} attempt${practicalAttempts > 1 ? "s" : ""})`;
    } else {
      practicalStatus = `Not passed (${practicalAttempts} attempt${practicalAttempts > 1 ? "s" : ""})`;
    }
  }

  // ===== OVERALL STATUS =====
  let overallStatus = "Not ready";

  if (theoryTests.length === 0) {
    overallStatus = "Not ready";
  } else if (!theoryPass) {
    overallStatus = "In progress";
  } else if (theoryPass && !practicalPass) {
    overallStatus = "Ready for practical";
  } else if (practicalPass) {
    overallStatus = "Completed";
  }

  const statusEl = document.getElementById("testStatus");

  if (statusEl) {
    statusEl.textContent = overallStatus;

    // Reset classes
    statusEl.className = "status-badge";

    // Apply correct colour
    if (overallStatus === "Not ready") {
      statusEl.classList.add("status-not-ready");
    }
    else if (overallStatus === "In progress") {
      statusEl.classList.add("status-in-progress");
    }
    else if (overallStatus === "Ready for practical") {
      statusEl.classList.add("status-ready");
    }
    else if (overallStatus === "Completed") {
      statusEl.classList.add("status-completed");
    }
  }

  // ===== RENDER =====
  summaryBox.innerHTML = `
    <div><strong>🧪 Theory:</strong> ${theoryStatus}</div>
    <div><strong>🚗 Practical:</strong> ${practicalStatus}</div>
    <div style="margin-top:8px;"><strong>Status:</strong> ${overallStatus}</div>
  `;
}

function getStudentPriorityType(tests = []) {

  const theoryTests = tests.filter(t => t.test_type === "theory");
  const practicalTests = tests.filter(t => t.test_type === "practical");

  const theoryAttempts = theoryTests.length;
  const practicalAttempts = practicalTests.length;

  const theoryPassed = theoryTests.some(t => t.result === "pass");
  const practicalPassed = practicalTests.some(t => t.result === "pass");

  if (practicalPassed) return "completed";

  if (theoryPassed) return "ready";

  if (theoryAttempts >= 3) return "struggling";

  return "needs-theory";
}

function showMessage(text, x = null, y = null) {
  const box = document.getElementById("app-message");
  if (!box) return;

  box.textContent = text;
  box.classList.remove("hidden");

  // If coordinates provided → position near click
  if (x !== null && y !== null) {
    box.style.position = "absolute";
    box.style.left = `${x + 10}px`;
    box.style.top = `${y + 10}px`;
  } else {
    // fallback (top right)
    box.style.position = "fixed";
    box.style.top = "20px";
    box.style.right = "20px";
  }

  setTimeout(() => {
    box.classList.add("hidden");
  }, 2500);
}

// =======================
// Get sort priority based on test status
function getTestStatusPriority(tests = []) {
  const theoryPassed = tests.some(
    t => t.test_type === "theory" && t.result === "pass"
  );

  const practicalPassed = tests.some(
    t => t.test_type === "practical" && t.result === "pass"
  );

  if (practicalPassed) return 3;
  if (theoryPassed) return 2;
  return 1;
}

// =======================
// Get test attempts summary
function getTestAttemptsSummary(tests = []) {

  const theoryAttempts = tests.filter(
    t => t.test_type === "theory"
  ).length;

  const practicalAttempts = tests.filter(
    t => t.test_type === "practical"
  ).length;

  return {
    theory: theoryAttempts,
    practical: practicalAttempts
  };
}

function setupTestToggle() {
  document.addEventListener("click", async (e) => {

    if (!e.target.classList.contains("test-toggle")) return;

    const btn = e.target;

    const testId = btn.dataset.id;
    const currentResult = btn.dataset.result;
    const testDate = btn.dataset.date;

    // ❌ Only allow pending
    if (currentResult !== "pending") {
      showMessage("This test has already been completed.", e.clientX, e.clientY);
      return;
    }

    // ❌ Check if date is in future
    const today = new Date();
    const testDay = new Date(testDate);

    // remove time part for accurate comparison
    today.setHours(0,0,0,0);
    testDay.setHours(0,0,0,0);

    if (testDay > today) {
      showMessage("This test has not taken place yet.", e.clientX, e.clientY);
      return;
    }

    // ✅ Ask user for result
    const isPass = confirm("Did the student PASS the test?\n\nOK = Pass\nCancel = Fail");

    const newResult = isPass ? "pass" : "fail";

    const { res } = await fetchJson(`${API_BASE}/tests/${testId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ result: newResult })
    });

    if (!res.ok) {
      showMessage("Failed to update test", e.clientX, e.clientY);
      return;
    }

    // reload table + summary
    loadStudentTests(window.currentStudentId);

  });
}

// =======================
// Get dashboard test status
function getStudentTestDashboardStatus(tests = []) {

  const theoryPassed = tests.some(
    t => t.test_type === "theory" && t.result === "pass"
  );

  const practicalPassed = tests.some(
    t => t.test_type === "practical" && t.result === "pass"
  );

  const theoryAttempts = tests.filter(t => t.test_type === "theory").length;

  if (practicalPassed) {
    return {
      label: "🏁 Completed",
      className: "test-status-complete"
    };
  }

  if (theoryPassed) {
    return {
      label: "🟢 Ready for practical",
      className: "test-status-ready"
    };
  }

  if (theoryAttempts >= 3) {
    return {
      label: "🚨 Struggling with theory",
      className: "test-status-struggling"
    };
  }

  return {
    label: "⚠️ Needs theory",
    className: "test-status-theory"
  };
}

function setupDeleteTest() {
  document.addEventListener("click", async (e) => {

    if (!e.target.classList.contains("delete-test")) return;

    const testId = e.target.dataset.id;

    const confirmDelete = confirm("Delete this test?");
    if (!confirmDelete) return;

    const { res } = await fetchJson(`${API_BASE}/tests/${testId}`, {
      method: "DELETE"
    });

    if (!res.ok) {
      showMessage("Failed to delete test", e.clientX, e.clientY);
      return;
    }

    // reload tests
    loadStudentTests(window.currentStudentId);

  });
}

function setupTestHistoryToggle() {
  const toggleBtn = document.getElementById("toggle-test-history");
  const historyWrap = document.getElementById("test-history-wrap");

  // Safety check (prevents errors if not on this page)
  if (!toggleBtn || !historyWrap) return;

  toggleBtn.addEventListener("click", () => {
    const isHidden = historyWrap.style.display === "none";

    if (isHidden) {
      historyWrap.style.display = "block";
      toggleBtn.textContent = "Hide History";
    } else {
      historyWrap.style.display = "none";
      toggleBtn.textContent = "Show History";
    }
  });
}

async function loadStudentTests(studentId) {

  const tbody = document.getElementById("student-tests");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="5">Loading...</td></tr>`;

  const { res, data } = await fetchJson(`${API_BASE}/tests/student/${studentId}`);

  if (!res.ok) {
    tbody.innerHTML = `<tr><td colspan="5">Failed to load tests</td></tr>`;
    return;
  }

  renderTestSummary(data);

  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="5">No tests recorded</td></tr>`;
    return;
  }

  tbody.innerHTML = "";

  data.forEach(t => {

    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${t.test_type}</td>
      <td>${t.test_date}</td>
      <td>${t.attempt_number || ""}</td>
      <td>
        <button 
          class="test-toggle ${t.result}" 
          data-id="${t.id}" 
          data-result="${t.result}"
          data-date="${t.test_date}">
          ${t.result}
        </button>
      </td>
      <td>
        <button class="delete-test" data-id="${t.id}">Delete</button>
      </td>
    `;

    tbody.appendChild(row);

  });

}

function setupTestModal(){

  document.addEventListener("click", (e) => {

    if(e.target.id === "add-test-btn"){

      const overlay = document.getElementById("testModalOverlay");
      if(!overlay) return;

      overlay.classList.remove("hidden");
    }

    if(e.target.id === "testModalClose"){

      const overlay = document.getElementById("testModalOverlay");
      if(!overlay) return;

      overlay.classList.add("hidden");
    }

  });

}

function setupSaveTest(){

  const saveBtn = document.getElementById("saveTestBtn");

  if (!saveBtn) return;

  saveBtn.onclick = async () => {

    const test_type = document.getElementById("testType").value;
    const test_date = document.getElementById("testDate").value;
    const result = document.getElementById("testResult").value;
    const notes = document.getElementById("testNotes").value;

    const student_id = window.currentStudentId;

    const body = {
      student_id,
      test_type,
      test_date,
      result,
      notes
    };

    const { res, data } = await fetchJson(`${API_BASE}/tests`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (res.ok) {
      document.getElementById("testModalOverlay").classList.add("hidden");
      loadStudentTests(student_id);
    }

  };

}

function formatNextLesson(lesson) {

  if (!lesson) return "⚠ No lesson booked";

  const lessonDate = new Date(`${lesson.lesson_date}T${lesson.start_time}`);
  const today = new Date();

  const todayStr = today.toDateString();

  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);

  if (lessonDate.toDateString() === todayStr) {
    return `📅 Today ${lesson.start_time.slice(0,5)}`;
  }

  if (lessonDate.toDateString() === tomorrow.toDateString()) {
    return `📅 Tomorrow ${lesson.start_time.slice(0,5)}`;
  }

  const options = { weekday: "short", day: "numeric", month: "short" };

  return `📅 ${lessonDate.toLocaleDateString("en-GB", options)} ${lesson.start_time.slice(0,5)}`;

}


// =======================
// Normalise UK phone number
// =======================
function normaliseUKPhone(phone) {

  if (!phone) return null;

  // remove spaces
  phone = phone.replace(/\s+/g, '');

  // convert 07xxxxxxxxx → +447xxxxxxxxx
  if (phone.startsWith('0')) {
    return '+44' + phone.slice(1);
  }

  return phone;
}

function setupStudentFormToggle() {
  const btn = document.getElementById("toggle-student-form");
  const wrap = document.getElementById("create-student-wrap");
  if (!btn || !wrap) return;

  wrap.style.display = "none";
  btn.textContent = "+ Create Student";

  btn.addEventListener("click", () => {
    const hidden = wrap.style.display === "none";
    wrap.style.display = hidden ? "block" : "none";
    btn.textContent = hidden ? "× Close" : "+ Create Student";
  });
}

function hideStudentForm() {
  const btn = document.getElementById("toggle-student-form");
  const wrap = document.getElementById("create-student-wrap");
  if (wrap) wrap.style.display = "none";
  if (btn) btn.textContent = "+ Create Student";
}

// ===== Load & Render Students as Cards =====
async function loadStudents() {

  // Get the new card container
  const container = document.getElementById("students-list");
  if (!container) return;

  // Clear existing cards
  container.innerHTML = "";

  // Fetch students from API
  const { res, data } = await fetchJson(`${API_BASE}/students`);

  if (!res.ok) {
    container.innerHTML = "<p>Failed to load students</p>";
    return;
  }

  allStudents = data;

  renderStudents();

}

function renderSection(title, students) {

  if (!students.length) return;

  const mainContainer = document.getElementById("students-list");
  if (!mainContainer) return;

  // Section wrapper
  const section = document.createElement("div");
  section.className = "student-section";

  // Section title
  const heading = document.createElement("h3");
  heading.className = "student-section-title";
  heading.textContent = `${title} (${students.length})`;

  // Grid for cards
  const grid = document.createElement("div");
  grid.className = "students-grid";

  section.appendChild(heading);
  section.appendChild(grid);

  students.forEach(s => {
    renderStudentCard(s, grid);
  });

  mainContainer.appendChild(section);

}

function renderStudents() {

  const container = document.getElementById("students-list");
  if (!container) return;

  container.innerHTML = "";

  let students = getFilteredStudents();

  const today = new Date().toDateString();

  // Smart sorting
  students.sort((a, b) => {

    const aDate = a.next_lesson
      ? new Date(`${a.next_lesson.lesson_date}T${a.next_lesson.start_time}`)
      : null;

    const bDate = b.next_lesson
      ? new Date(`${b.next_lesson.lesson_date}T${b.next_lesson.start_time}`)
      : null;

    const aToday = aDate && aDate.toDateString() === today;
    const bToday = bDate && bDate.toDateString() === today;

    if (aToday && !bToday) return -1;
    if (!aToday && bToday) return 1;

    if (aDate && bDate) return aDate - bDate;

    if (!aDate && bDate) return 1;
    if (aDate && !bDate) return -1;

    return 0;
  });

  const countEl = document.getElementById("student-count");

  if (countEl) {
    // Work out how many students are actually visible after limit is applied
    const visibleCount =
      studentLimit === Infinity ? students.length : Math.min(students.length, studentLimit);

    countEl.textContent = `Showing ${visibleCount} of ${allStudents.length} students`;
  }

  // Apply student display limit AFTER sorting
  students = students.slice(0, studentLimit);

  const todayStudents = [];
  const upcomingStudents = [];
  const noLessonStudents = [];

  students.forEach(s => {

    if (!s.next_lesson) {
      noLessonStudents.push(s);
      return;
    }

    const lessonDate = new Date(`${s.next_lesson.lesson_date}T${s.next_lesson.start_time}`);

    if (lessonDate.toDateString() === today) {
      todayStudents.push(s);
    } else {
      upcomingStudents.push(s);
    }

  });

  // =======================
  // Sort inside each group by test status

  todayStudents.sort((a, b) =>
    getTestStatusPriority(a.tests || []) - getTestStatusPriority(b.tests || [])
  );

  upcomingStudents.sort((a, b) =>
    getTestStatusPriority(a.tests || []) - getTestStatusPriority(b.tests || [])
  );

  noLessonStudents.sort((a, b) =>
    getTestStatusPriority(a.tests || []) - getTestStatusPriority(b.tests || [])
  );

  renderSection("Today", todayStudents);
  renderSection("Upcoming Lessons", upcomingStudents);
  renderSection("No Lesson Booked", noLessonStudents);

  lucide.createIcons();

}

function renderStudentCard(s, container) {

    // Student Readiness
  let readiness = "beginner";
  let readinessLabel = "Beginner";

  if (s.hours_driven >= 20) {
    readiness = "ready";
    readinessLabel = "Test Ready";
  } else if (s.hours_driven >= 10) {
    readiness = "progress";
    readinessLabel = "Mid Progress";
  }

  const testStatus = getStudentTestDashboardStatus(s.tests || []);
  const attempts = getTestAttemptsSummary(s.tests || []);
  const theoryPassed = (s.tests || []).some(
    t => t.test_type === "theory" && t.result === "pass"
  );

  const practicalPassed = (s.tests || []).some(
    t => t.test_type === "practical" && t.result === "pass"
  );

  const isStruggling =
    (!theoryPassed && attempts.theory >= 3) ||
    (!practicalPassed && attempts.practical >= 2);

  const card = document.createElement("div");
  card.className = `
    student-card 
    readiness-${readiness}
    ${testStatus.className === 'test-status-ready' ? 'highlight-ready' : ''}
    ${isStruggling ? 'highlight-struggling' : ''}
  `;

  card.innerHTML = `
    <div class="student-header">
      <div class="student-name">
        ${s.first_name} ${s.last_name}
      </div>

      <span class="${s.active ? 'badge-active' : 'badge-inactive'}">
        ${s.active ? 'Active' : 'Inactive'}
      </span>
    </div>

    <div class="student-meta">
      📞 ${s.phone || "No phone"}
    </div>

    <div class="student-progress">
      <span>Lessons: ${s.lessons_completed || 0}</span>
      <span>Hours: ${s.hours_driven || 0}</span>
      <span>⭐ ${s.instructor_rating || "-"}</span>
    </div>

    <div class="student-readiness">
      ${readinessLabel}
    </div>

    <div class="student-test-status ${testStatus.className}">
      ${testStatus.label}
    </div>

    <div class="student-test-attempts">
      🎯 Theory: ${attempts.theory} | 🚗 Practical: ${attempts.practical}
    </div>

    <div class="student-next-lesson">
      ${formatNextLesson(s.next_lesson)}
    </div>

    <div class="student-balance ${s.outstanding_balance > 0 ? 'owing' : 'paid'}">
      ${
        s.outstanding_balance > 0
          ? `💷 Owes £${s.outstanding_balance}`
          : "💷 All Paid"
      }
    </div>

    <div class="student-actions">
      <button class="actions-btn edit-btn">Edit</button>
      <button class="actions-btn diary-btn">Weekly Diary</button>
      <button class="delete-btn" title="Delete Student">
        <i data-lucide="trash-2"></i>
      </button>
    </div>
  `;

  card.addEventListener("click", async () => {
    await loadSection("student-detail");
    setTimeout(() => {
      loadStudentDetail(s.id);
    }, 0);
  });

  card.querySelector(".diary-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    loadSection('weekly', { student_id: s.id });
  });

  card.querySelector(".edit-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    openEditStudentModal(s.id);
  });

  card.querySelector(".delete-btn").addEventListener("click", async (e) => {
    e.stopPropagation();

    const confirmDelete = confirm("Are you sure you want to delete this student?");
    if (!confirmDelete) return;

    const response = await fetch(`/students/${s.id}`, { method: "DELETE" });

    if (!response.ok) {
      showMessage("Error deleting student", e.clientX, e.clientY);
      return;
    }

    await loadStudents();
  });

  container.appendChild(card);

}

function getFilteredStudents() {
  let filtered = [...allStudents];

  if (studentFilter !== "all") {
    const activeValue = studentFilter === "active";
    filtered = filtered.filter(s => s.active === activeValue);
  }

  if (studentSearch.trim()) {
    const q = studentSearch.toLowerCase();

    filtered = filtered.filter(s =>
      `${s.first_name} ${s.last_name}`.toLowerCase().includes(q)
    );
  }

  if (studentPriorityFilter !== "all") {
    filtered = filtered.filter(s =>
      getStudentPriorityType(s.tests || []) === studentPriorityFilter
    );
  }

  return filtered;
}


// Fetch student information and display it on the student detail page
async function loadStudentDetail(studentId) {

  // global variable
  currentStudentId = studentId;

  // Request student data from API
  const res = await fetch(`${API_BASE}/students/${studentId}`);

  const student = await res.json();

  // Display student name at the top of the page
  document.getElementById("student-name").textContent =
    `${student.first_name} ${student.last_name}`;

  // Load instructor notes into textarea
  loadStudentNotes(student);

  document
    .getElementById("save-notes")
    ?.addEventListener("click", saveStudentNotes);

  /* =========================================
    LOAD STUDENT FINANCIAL SUMMARY
  ========================================= */

  // Request finance data
  const financeRes = await fetch(`${API_BASE}/students/${studentId}/finance`);
  const finance = await financeRes.json();

  // Display totals
  document.getElementById("student-total").textContent =
    `£${Number(finance.total || 0).toFixed(2)}`;

  document.getElementById("student-paid").textContent =
    `£${Number(finance.paid || 0).toFixed(2)}`;

  document.getElementById("student-outstanding").textContent =
    `£${Number(finance.outstanding || 0).toFixed(2)}`;

  // Wait until the student detail section exists before loading lessons
  const waitForLessonsContainer = setInterval(() => {

    const container = document.getElementById("student-lessons");

    if (container) {
      clearInterval(waitForLessonsContainer);
      loadStudentLessons(studentId);
      loadStudentTests(studentId);
      setupTestHistoryToggle();
      setupSaveTest();
    }

  }, 10);

  // Show all lessons
  document.getElementById("filter-all").onclick = () => {
    renderStudentLessons(currentLessons);
  };

  // Show only unpaid lessons
  document.getElementById("filter-unpaid").onclick = () => {
    renderStudentLessons(currentLessons.filter(l => !l.paid));
  };

  // Show only paid lessons
  document.getElementById("filter-paid").onclick = () => {
    renderStudentLessons(currentLessons.filter(l => l.paid));
  };

  
  /* =========================================
   BACK TO STUDENTS LIST
  ========================================= */

  const backBtn = document.getElementById("back-to-students");

  if (backBtn) {
    backBtn.addEventListener("click", () => {
      loadSection("students");
    });
  }

}

function setupStudentForm() {
  const form = document.getElementById("student-form");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const payload = {
      first_name: document.getElementById("first_name").value.trim(),
      last_name: document.getElementById("last_name").value.trim(),
      phone: normaliseUKPhone(
        document.getElementById("phone").value.trim()
      ),
      email: document.getElementById("email").value.trim() || null,
      date_of_birth: document.getElementById("date_of_birth").value || null,
      address1: document.getElementById("address1").value.trim(),
      address2: document.getElementById("address2").value.trim() || null,
      town_city: document.getElementById("town_city").value.trim(),
      postcode: document.getElementById("postcode").value.trim().toUpperCase(),
      source: document.getElementById("source").value,
      hourly_rate: parseFloat(document.getElementById("hourly_rate").value),
      notes: document.getElementById("notes").value.trim() || null,
      active: document.getElementById("active").value  === "true"
    };

    const editId = form.dataset.editId;
    // When in Edit mode
    const submitBtn = document.getElementById("student-submit-btn");
    if (submitBtn) submitBtn.textContent = "Update Student";

    let response;

    if (editId) {
      // UPDATE
      response = await fetch(`/students/${editId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      delete form.dataset.editId;
      const submitBtn = document.getElementById("student-submit-btn");
      if (submitBtn) submitBtn.textContent = "Add Student";
    } else {
      // CREATE
      response = await fetch("/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }

    if (!response.ok) {
      showMessage("Error saving student", e.clientX, e.clientY);
      return;
    }

    form.reset();
    hideStudentForm();
    await loadStudents();
  });
}

// Function to edit student
async function openEditStudentModal(id) {

  const submitBtn = document.getElementById("student-submit-btn");
  if (submitBtn) submitBtn.textContent = "Update Student";

  try {
    const { res, data } = await fetchJson(`${API_BASE}/students`);

    if (!res.ok) {
      console.error("Failed to fetch students");
      return;
    }

    const student = data.find(s => s.id === id);
    if (!student) return;

    const form = document.getElementById("student-form");

    form.first_name.value = student.first_name || "";
    form.last_name.value = student.last_name || "";
    form.phone.value = student.phone || "";
    form.email.value = student.email || "";
    form.date_of_birth.value = student.date_of_birth || "";

    form.address1.value = student.address1 || "";
    form.address2.value = student.address2 || "";
    form.town_city.value = student.town_city || "";
    form.postcode.value = student.postcode || "";

    form.source.value = student.source || "SELF";
    form.hourly_rate.value = student.hourly_rate || "";
    form.notes.value = student.notes || "";
    form.active.value = String(student.active);

    form.dataset.editId = student.id;


    const wrap = document.getElementById("create-student-wrap");
    if (wrap) wrap.style.display = "block";

    const btn = document.getElementById("toggle-student-form");
    if (btn) btn.textContent = "Close";

    //document.getElementById("studentFormContainer").style.display = "block";

  } catch (err) {
    console.error("Edit load error:", err);
  }
}

// Render student lesson rows into the table
function renderStudentLessons(lessons) {

  const container = document.getElementById("student-lessons");

  if (!container) {
    console.error("student-lessons container not found");
    return;
  }

  if (!lessons || lessons.length === 0) {
    container.innerHTML = "<p>No lessons found</p>";
    return;
  }

  const rows = lessons.map(l => {

    const date = l.lesson_date || "";
    const start = l.start_time ? l.start_time.slice(0, 5) : "";
    const end = l.end_time ? l.end_time.slice(0, 5) : "";
    const price = l.price ? "£" + Number(l.price).toFixed(2) : "-";

    return `
      <tr>
        <td>${date}</td>
        <td>${start}–${end}</td>
        <td>${price}</td>
        <td>
          <span class="${l.paid ? 'status-paid' : 'status-unpaid'}">
            ${l.paid ? 'Paid' : 'Unpaid'}
          </span>
        </td>
        <td>
          <button class="lesson-pay ${l.paid ? 'hidden-pay' : ''}" data-id="${l.id}">💷</button>
          <button class="lesson-edit" data-id="${l.id}">✏️</button>
          <button class="lesson-delete" data-id="${l.id}">🗑</button>
        </td>
      </tr>
    `;

  }).join("");

  container.innerHTML = `
    <table class="lesson-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Time</th>
          <th>Price</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;

  // Mark lesson as paid
  const payButtons = container.querySelectorAll(".lesson-pay");

  payButtons.forEach(btn => {
    btn.addEventListener("click", async () => {
      const lessonId = btn.dataset.id;

      const res = await fetch(`${API_BASE}/lessons/${lessonId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ paid: true })
      });

      if (res.ok) {
        loadStudentDetail(currentStudentId);
      } else {
        showMessage("Failed to update payment", e.clientX, e.clientY);
      }
    });
  });

  // Delete lesson
  const deleteButtons = container.querySelectorAll(".lesson-delete");

  deleteButtons.forEach(btn => {
    btn.addEventListener("click", async () => {
      const confirmDelete = confirm("Delete this lesson?");
      if (!confirmDelete) return;

      const lessonId = btn.dataset.id;

      const res = await fetch(`${API_BASE}/lessons/${lessonId}`, {
        method: "DELETE"
      });

      if (res.ok) {
        loadStudentDetail(currentStudentId);
      } else {
        showMessage("Failed to delete lesson", e.clientX, e.clientY);
      }
    });
  });

  // ==========================================
  // Edit lesson
  // ==========================================

  const editButtons = container.querySelectorAll(".lesson-edit");

  editButtons.forEach(btn => {

    btn.addEventListener("click", () => {

      const lessonId = btn.dataset.id;

      // Find lesson in memory
      const lesson = currentLessons.find(l => l.id === lessonId);

      if (!lesson) return;

      openLessonModal(lesson);

    });

  });

}

// Fetch and display lesson history for a student
async function loadStudentLessons(studentId) {

  const res = await fetch(`${API_BASE}/lessons?student_id=${studentId}`);
  const lessons = await res.json();

  // Adding new code here
  let lessonCount = 0;
  let totalMinutes = 0;

  lessons.forEach(l => {

    lessonCount++;

    const start = l.start_time.split(":");
    const end = l.end_time.split(":");

    const startMinutes = (+start[0]) * 60 + (+start[1]);
    const endMinutes = (+end[0]) * 60 + (+end[1]);

    const duration = endMinutes - startMinutes;

    totalMinutes += duration;

  });

  const hoursDriven = (totalMinutes / 60).toFixed(1);
  
  // 👉 UPDATE UI HERE
  document.getElementById("progressLessons").textContent = lessonCount;
  document.getElementById("progressHours").textContent = hoursDriven;
  
  // Edning new code here

  currentLessons = lessons;

  const container = document.getElementById("student-lessons");

  if (!container) {
    console.error("student-lessons container missing");
    return;
  }

  if (!lessons || lessons.length === 0) {
    container.innerHTML = "<p>No lessons yet</p>";
    return;
  }

  renderStudentLessons(lessons);
}

// ==========================================
// Open Edit Lesson Modal
// ==========================================

function openEditLessonModal(lesson) {

  document.getElementById("edit-lesson-date").value =
    lesson.lesson_date;

  document.getElementById("edit-start-time").value =
    lesson.start_time;

  document.getElementById("edit-end-time").value =
    lesson.end_time;

  document.getElementById("edit-notes").value =
    lesson.notes || "";

  // store id globally
  window.currentLessonEdit = lesson.id;

  document.getElementById("edit-lesson-modal").style.display = "block";

}

// Load existing student notes
function loadStudentNotes(student) {
  const notesField = document.getElementById('student-notes');
  if (!notesField) return;

  notesField.value = student.notes || '';
}

async function saveStudentNotes() {

  const notes = document.getElementById('student-notes').value;

  const res = await fetch(`${API_BASE}/students/${window.currentStudentId}/notes`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes })
  });

  if (!res.ok) {
    showMessage("Failed to save notes", e.clientX, e.clientY);
    return;
  }

  showMessage("Notes saved ✔", e.clientX, e.clientY);

}



// ==========================================
// Save edited lesson
// ==========================================

document.addEventListener("click", async (e) => {

  if (e.target.id !== "save-lesson-edit") return;

  const lesson_date = document.getElementById("edit-lesson-date").value;
  const start_time = document.getElementById("edit-start-time").value;
  const end_time = document.getElementById("edit-end-time").value;
  const notes = document.getElementById("edit-notes").value;

  const res = await fetch(`${API_BASE}/lessons/${window.currentLessonEdit}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      lesson_date,
      start_time,
      end_time,
      notes
    })
  });

  if (!res.ok) {
    showMessage("Failed to update lesson", e.clientX, e.clientY);
    return;
  }

  // close modal
  document.getElementById("edit-lesson-modal").style.display = "none";

  // reload student lessons
  loadStudentDetail(currentStudentId);

});

window.initStudents = function () {
  setupStudentFormToggle();
  setupStudentForm();
  loadStudents();
  setupTestModal();
  setupSaveTest();
  setupDeleteTest();
  setupTestToggle();

  // Student limit dropdown
  const limitSelect = document.getElementById("student-limit");

  if (limitSelect) {
    limitSelect.addEventListener("change", (e) => {

      const value = e.target.value;

      studentLimit = value === "all" ? Infinity : parseInt(value);

      renderStudents();

    });
  }

  document.querySelectorAll(".filter-btn").forEach(btn => {

    btn.addEventListener("click", () => {

      document.querySelectorAll(".filter-btn")
        .forEach(b => b.classList.remove("active"));

      btn.classList.add("active");

      studentFilter = btn.dataset.filter;

      renderStudents();

    });

  });

  const searchInput = document.getElementById("student-search");

  if (searchInput) {

    searchInput.addEventListener("input", (e) => {

      studentSearch = e.target.value;

      renderStudents();

    });

  }


  // Attach lesson modal buttons so edit works from student profile
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

  document.querySelectorAll(".priority-btn").forEach(btn => {

    if (btn.dataset.bound) return; // ✅ prevent duplicate binding

    btn.addEventListener("click", () => {

      document.querySelectorAll(".priority-btn")
        .forEach(b => b.classList.remove("active"));

      btn.classList.add("active");

      studentPriorityFilter = btn.dataset.priority;

      renderStudents();

    });

    btn.dataset.bound = "true"; // ✅ mark as bound

  });

}

//document.addEventListener("DOMContentLoaded", initStudents);
