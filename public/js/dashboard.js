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
  document.getElementById('dash-today').textContent = todayLessonsCount;
  document.getElementById('dash-week').textContent = weekLessons;
  document.getElementById('dash-students').textContent = activeStudents;
  document.getElementById('dash-revenue').textContent = `£${weekRevenue.toFixed(2)}`;
  document.getElementById('dash-outstanding').textContent = `£${outstandingRevenue.toFixed(2)}`;
}