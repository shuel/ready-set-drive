window.API_BASE = "http://localhost:5000";

// global variable to store all students
window.allStudents = [];

// ================================
// Shared API helper
// ================================

window.toggleStudentSelect = function(show) {
  const wrap = document.getElementById("studentSelectWrap");
  if (!wrap) return;

  wrap.style.display = show ? "block" : "none";
};

async function loadAllStudents() {

  const { res, data } = await fetchJson(`${API_BASE}/students`);

  if(res.ok){
    window.allStudents = data;
  }

}

function getLessonModal() {
  return document.getElementById("lessonModalOverlay");
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

function loadSection(section, params = {}) {
  fetch(`${section}.html`)
    .then(res => res.text())
    .then(html => {
      document.getElementById('content').innerHTML = html;

      if (section === 'dashboard') {
        initDashboard();
        loadDashboardStats();
      }

      if (section === 'students') initStudents();

      if (section === 'weekly') {
        // pass optional params (e.g. student_id) into lessons init
        initLessons(params);
      }
    });
}

async function initDashboard() {

  // Fetch students
  const { data: students } = await fetchJson(`${API_BASE}/students`);
  const activeStudents = students?.filter(s => s.active).length || 0;

  // Fetch this week's lessons
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - today.getDay() + 1); // Monday
  const end = new Date(start);
  end.setDate(start.getDate() + 7);

  const startStr = start.toISOString().split("T")[0];
  const endStr = end.toISOString().split("T")[0];

  const { data: lessons } = await fetchJson(
    `${API_BASE}/lessons?start=${startStr}&end=${endStr}`
  );

  const todayStr = today.toISOString().split("T")[0];

  const todayLessons = lessons?.filter(l => l.lesson_date === todayStr).length || 0;
  const weekLessons = lessons?.length || 0;

  const revenue = lessons
    ?.filter(l => l.paid)
    .reduce((sum, l) => sum + Number(l.price || 0), 0) || 0;

  document.getElementById("dash-today").textContent = todayLessons;
  document.getElementById("dash-week").textContent = weekLessons;
  document.getElementById("dash-students").textContent = activeStudents;
  document.getElementById("dash-revenue").textContent = `£${revenue.toFixed(2)}`;

  lucide.createIcons();
}


// ===== Navigation Handling =====
document.querySelectorAll(".nav-links button").forEach(btn => {

  btn.addEventListener("click", () => {

    // Remove active state from all
    document.querySelectorAll(".nav-links button")
      .forEach(b => b.classList.remove("active"));

    // Add active to clicked
    btn.classList.add("active");

    // Load the section
    loadSection(btn.dataset.section);

  });

});

window.addEventListener('DOMContentLoaded', () => {
  loadAllStudents();
  loadSection('students');
  
  // Set Students button as active on initial load
  const firstBtn = document.querySelector('.nav-links button[data-section="students"]');
  if (firstBtn) firstBtn.classList.add('active');
});