console.log("auth.js loaded");

// Handle login form
const form = document.getElementById("loginForm");

if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      document.getElementById("error").textContent = error.message;
      return;
    }

    // Login successful → go to app
    window.location.href = "/";
  });
}

// Check if already logged in
async function checkSession() {
  const { data } = await supabase.auth.getSession();

  if (data.session && window.location.pathname === "/login.html") {
    window.location.href = "/";
  }
}

checkSession();

// Handle logout
const logoutBtn = document.getElementById("logoutBtn");

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    await supabase.auth.signOut();
    window.location.href = "/login.html";
  });
}