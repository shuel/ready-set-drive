async function loadDashboardStats() {

  const res = await fetch('/dashboard/stats');
  const stats = await res.json();

  document.getElementById('dash-today').textContent =
    stats.todayLessons;

  document.getElementById('dash-week').textContent =
    stats.weekLessons;

  document.getElementById('dash-students').textContent =
    stats.activeStudents;

  document.getElementById('dash-revenue').textContent =
    '£' + stats.weekRevenue.toFixed(2);

  document.getElementById("dash-outstanding").textContent =
    `£${Number(stats.outstandingRevenue).toFixed(2)}`;
}
