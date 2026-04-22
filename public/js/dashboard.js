// Format time HH:MM (removes seconds)
function formatTime(timeStr) {
  if (!timeStr) return "";
  return timeStr.slice(0, 5);
}

// Render today's lessons list
async function loadTodayLessons() {

  const now = new Date();

  // Get local date (NOT UTC)
  const today = now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0')

  // Fetch today's lessons
  const { res, data } = await fetchJson(`${API}/lessons?lesson_date=${today}`);

  const container = document.getElementById("today-list");

  // Clear previous
  container.innerHTML = "";

  if (!res.ok || !data || data.length === 0) {
    container.innerHTML = `<div class="today-empty">No lessons today</div>`;
    return;
  }

  // Sort by start time
  data.sort((a, b) => a.start_time.localeCompare(b.start_time));

  data.forEach(lesson => {

    const item = document.createElement("div");
    item.className = "today-item";

    // Build student name (safe fallback)
    const name = lesson.student_name || "Unknown";

    item.innerHTML = `
      <div class="today-time">
        ${formatTime(lesson.start_time)} – ${formatTime(lesson.end_time)}
      </div>
      <div class="today-name">
        ${name}
      </div>
    `;

    container.appendChild(item);
  });
}

// Load upcoming lessons (next 3)
async function loadUpcomingLessons() {

  const limit = Number(document.getElementById("upnext-limit")?.value || 3);

  const todayStr = new Date().toLocaleDateString("en-CA");

  const future = new Date();
  future.setDate(future.getDate() + 14);
  const endStr = future.toLocaleDateString("en-CA");

  const { res, data } = await fetchJson(
    `${API_BASE}/lessons?start=${todayStr}&end=${endStr}`
  );

  const container = document.getElementById("upcoming-list");
  container.innerHTML = "";

  if (!res.ok || !data) {
    container.innerHTML = `<div class="today-empty">No upcoming lessons</div>`;
    return;
  }

  const upcoming = data
    .filter(l => l.lesson_date > todayStr)
    .sort((a, b) => {
      const aTime = new Date(`${a.lesson_date}T${a.start_time}`);
      const bTime = new Date(`${b.lesson_date}T${b.start_time}`);
      return aTime - bTime;
    });

  if (upcoming.length === 0) {
    container.innerHTML = `<div class="today-empty">No upcoming lessons</div>`;
    return;
  }

  upcoming.slice(0, limit).forEach(lesson => {

    const item = document.createElement("div");
    item.className = "today-item";

    const dateObj = new Date(lesson.lesson_date);
    const dayLabel = dateObj.toLocaleDateString(undefined, {
      weekday: "short"
    });

    const name = lesson.student_name || "Unknown";

    item.innerHTML = `
      <div class="today-time">
        ${dayLabel} ${formatTime(lesson.start_time)}
      </div>
      <div class="today-name">
        ${name}
      </div>
    `;

    container.appendChild(item);
  });
}

async function loadDashboardStats() {

  // Fetch students
  const { data: students } = await fetchJson(`${API_BASE}/students`);
  const activeStudents = students?.filter(s => s.active).length || 0;

  // Date range (this week)
  const today = new Date();

  const day = today.getDay() === 0 ? 7 : today.getDay();

  const start = new Date(today);
  start.setDate(today.getDate() - day + 1);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  const formatDate = d => d.toLocaleDateString("en-CA");

  const startStr = formatDate(start);
  const endStr = formatDate(end);

  console.log("Start Date: ", startStr, " End Date: ", endStr);

  // Fetch lessons
  const { data: lessons } = await fetchJson(
    `${API_BASE}/lessons?start=${startStr}&end=${endStr}`
  );

  const todayStr = new Date().toLocaleDateString("en-CA");
  const todayLessons = lessons?.filter(l => l.lesson_date === todayStr) || [];
  todayLessons.sort((a, b) =>
    a.start_time.localeCompare(b.start_time)
  );

  //console.log("Lessons for today: ", todayLessons);

  const todayLessonsCount = todayLessons.length;
  const weekLessons = lessons?.length || 0;

  //console.log("Weeks lesson: ", weekLessons);

  const weekRevenue = lessons
    ?.filter(l => l.paid)
    .reduce((sum, l) => sum + Number(l.price || 0), 0) || 0;

  const outstandingRevenue = lessons
    ?.filter(l => !l.paid)
    .reduce((sum, l) => sum + Number(l.price || 0), 0) || 0;

  // Update UI
  document.getElementById('dash-today-count').textContent = todayLessonsCount;
  document.getElementById('dash-week').textContent = weekLessons;
  document.getElementById('dash-students').textContent = activeStudents;
  document.getElementById('dash-revenue').textContent = `£${weekRevenue.toFixed(2)}`;
  document.getElementById('dash-outstanding').textContent = `£${outstandingRevenue.toFixed(2)}`;

  loadTodayLessons();
  loadUpcomingLessons();

  // Attach event once when page/section loads
  setTimeout(() => {
    const dropdown = document.getElementById("upnext-limit");

    if (dropdown) {
      dropdown.addEventListener("change", () => {
        loadUpcomingLessons();
      });
    }
  }, 0);

}
