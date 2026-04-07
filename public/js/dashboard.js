async function loadDashboardStats() {

  console.log("DASHBOARD FUNCTION RUNNING");

  // Fetch students
  const { data: students } = await fetchJson(`${API_BASE}/students`);
  const activeStudents = students?.filter(s => s.active).length || 0;

  // Date range (this week)
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - today.getDay() + 1);

  const end = new Date(start);
  end.setDate(start.getDate() + 7);

  const startStr = start.toISOString().split("T")[0];
  const endStr = end.toISOString().split("T")[0];

  // Fetch lessons
  const { data: lessons } = await fetchJson(
    `${API_BASE}/lessons?start=${startStr}&end=${endStr}`
  );

  const todayStr = today.toISOString().split("T")[0];

  const todayLessons = lessons?.filter(l => l.lesson_date === todayStr).length || 0;
  const weekLessons = lessons?.length || 0;

  const weekRevenue = lessons
    ?.filter(l => l.paid)
    .reduce((sum, l) => sum + Number(l.price || 0), 0) || 0;

  const outstandingRevenue = lessons
    ?.filter(l => !l.paid)
    .reduce((sum, l) => sum + Number(l.price || 0), 0) || 0;

  // Update UI
  document.getElementById('dash-today').textContent = todayLessons;
  document.getElementById('dash-week').textContent = weekLessons;
  document.getElementById('dash-students').textContent = activeStudents;
  document.getElementById('dash-revenue').textContent = `£${weekRevenue.toFixed(2)}`;
  document.getElementById('dash-outstanding').textContent = `£${outstandingRevenue.toFixed(2)}`;
}