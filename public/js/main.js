console.log("MAIN JS LOADED");

// ========================================
// 🔐 AUTH CHECK
// ========================================
async function requireAuth() {
  console.log("Checking auth...");

  const { data } = await supabase.auth.getSession();

  console.log("Session:", data);

  if (!data.session) {
    console.log("❌ No session, redirecting");
    window.location.href = "/login.html";
    return false;
  }

  console.log("✅ Auth OK");
  return true;
}

// ========================================
// 🚀 APP START (ONLY ENTRY POINT)
// ========================================
window.addEventListener("DOMContentLoaded", () => {
  startApp();
});

async function startApp() {

  console.log("START APP");

  const isAuthed = await requireAuth();
  if (!isAuthed) return;

  await loadAllStudents();

  console.log("STUDENTS LOADED");

  // ✅ Attach logout (button is static in index.html)
  const logoutBtn = document.getElementById("logoutBtn");

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      console.log("Logout clicked");
      await supabase.auth.signOut();
      window.location.href = "/login.html";
    });
  }

  // ✅ Attach nav buttons
  document.querySelectorAll(".nav-links button").forEach(btn => {
    btn.addEventListener("click", () => {

      document.querySelectorAll(".nav-links button")
        .forEach(b => b.classList.remove("active"));

      btn.classList.add("active");

      loadSection(btn.dataset.section);
    });
  });

  // ✅ Load default page
  loadSection("dashboard");

  const firstBtn = document.querySelector('.nav-links button[data-section="dashboard"]');
  if (firstBtn) firstBtn.classList.add('active');

  console.log("DASHBOARD LOADED");
}

// ========================================
// 🌐 GLOBAL CONFIG
// ========================================
window.API_BASE = "http://localhost:5000";
window.allStudents = [];

// ========================================
// 🔧 HELPERS
// ========================================
async function loadAllStudents() {
  const { res, data } = await fetchJson(`${API_BASE}/students`);
  if (res.ok) window.allStudents = data;
}

/*async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  return { res, data };
}*/
async function fetchJson(url, options = {}) {

  // Get current session
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;

  // Add Authorization header
  const headers = {
    ...(options.headers || {}),
    Authorization: `Bearer ${token}`
  };

  const res = await fetch(url, {
    ...options,
    headers
  });

  const dataRes = await res.json().catch(() => ({}));

  return { res, data: dataRes };
}

// ========================================
// 📦 LOAD SECTION
// ========================================
function loadSection(section, params = {}) {

  if (!section) {
    console.error("❌ loadSection called without section");
    return;
  }

  fetch(`${section}.html`)
    .then(res => res.text())
    .then(html => {

      document.getElementById('content').innerHTML = html;

      if (section === 'dashboard') {
        loadDashboardStats();
      }

      if (section === 'students') initStudents();

      if (section === 'weekly') {
        initLessons(params);
      }

      if (section === "accounts") initAccounts();
    });
}