// Accounts logic (v1 - summary only)

// --- Helper fumctions here ---//
function getLessonDuration(start, end) {
  if (!start || !end) return "";

  const s = new Date(`1970-01-01T${start}`);
  const e = new Date(`1970-01-01T${end}`);

  const mins = (e - s) / 60000;
  return `${mins / 60}h`;
}

function formatCurrency(value) {
  return `£${value.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

function formatLessonDate(dateStr, timeStr) {
  if (!dateStr) return "";

  // Remove seconds (09:00:00 → 09:00)
  const cleanTime = timeStr ? timeStr.slice(0, 5) : "";

  const date = new Date(`${dateStr}T${cleanTime || "00:00"}`);

  const options = {
    weekday: "short",
    day: "numeric",
    month: "short"
  };

  const formattedDate = date.toLocaleDateString("en-GB", options);

  return `${formattedDate} – ${cleanTime}`;
}

// Main functions
async function initAccounts() {

  const start = "2000-01-01";
  const end = "2100-01-01";

  // Fetch all lessons
  const { res, data: lessons } = await fetchJson(`${API_BASE}/lessons?start=${start}&end=${end}`);

  if (!res.ok) {
    console.error("Failed to load lessons");
    return;
  }

  // --- Totals ---
  let totalRevenue = 0;
  let totalPaid = 0;
  let weeklyRevenue = 0;
  let weeklyPaid = 0;

  const today = new Date();

  // Get start of week (Monday)
  const startOfWeek = new Date(today);
  const day = startOfWeek.getDay();
  const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
  startOfWeek.setDate(diff);
  startOfWeek.setHours(0, 0, 0, 0);

  // End of week (Sunday)
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);

  // Format range
  const formatDate = d => d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short"
  });

  const weekRange = `${formatDate(startOfWeek)} – ${formatDate(endOfWeek)}`;

  // Render
  document.getElementById("weeklyRange").textContent = weekRange;

  const weeklyLessons = lessons.filter(l => {
    if (!l.lesson_date) return false;

    const lessonDate = new Date(l.lesson_date);
    return lessonDate >= startOfWeek;
  });

  lessons.forEach(l => {

    const price = Number(l.price) || 0;

    const isPaid = (l.paid === "Yes" || l.paid === true);

    // Total revenue
    totalRevenue += price;

    // Total paid
    if (isPaid) {
      totalPaid += price;
    }

    // Weekly revenue
    if (l.lesson_date) {
      const lessonDate = new Date(l.lesson_date);

      if (lessonDate >= startOfWeek) {
        weeklyRevenue += price;

        // NEW: weekly paid
        if (isPaid) {
          weeklyPaid += price;
        }
      }
    }

  });

  const totalOutstanding = totalRevenue - totalPaid;
  const weeklyOutstanding = weeklyRevenue - weeklyPaid;

  weeklyLessons.sort((a, b) => {
    return new Date(a.lesson_date + "T" + a.start_time) - 
          new Date(b.lesson_date + "T" + b.start_time);
  });

  // --- Render ---
  document.getElementById("weeklyRevenue").textContent = formatCurrency(weeklyRevenue);
  document.getElementById("weeklyPaid").textContent = formatCurrency(weeklyPaid);
  document.getElementById("weeklyOutstanding").textContent = formatCurrency(weeklyOutstanding);

  const weeklyOutstandingEl = document.getElementById("weeklyOutstanding");

  weeklyOutstandingEl.classList.remove("text-red", "text-green");

  if (weeklyOutstanding > 0) {
    weeklyOutstandingEl.classList.add("text-red");
  } else {
    weeklyOutstandingEl.classList.add("text-green");
  }

  const container = document.getElementById("weeklyLessons");

  if (weeklyLessons.length === 0) {
    container.innerHTML = "No lessons this week";
    return;
  }

  // Group by student
  const lessonsByStudent = {};

  weeklyLessons.forEach(l => {
    const name = l.student_name || "Student";

    if (!lessonsByStudent[name]) {
      lessonsByStudent[name] = [];
    }

    lessonsByStudent[name].push(l);
  });

  container.innerHTML = Object.entries(lessonsByStudent).map(([student, lessons]) => {

    const rows = lessons.map(l => {

      const price = Number(l.price) || 0;
      const paid = (l.paid === "Yes" || l.paid === true);

      const duration = getLessonDuration(l.start_time, l.end_time);

      return `
        <div class="lesson-row">
          <span>${formatLessonDate(l.lesson_date, l.start_time)}</span>
          <span>${duration}</span>
          <span>${formatCurrency(price)}</span>
          <span class="${paid ? "paid" : "unpaid"}">
            ${paid ? "Paid" : "Unpaid"}
          </span>
        </div>
      `;

    }).join("");

    return `
      <div class="student-group">
        <h3>${student}</h3>
        <div class="lesson-rows">
          ${rows}
        </div>
      </div>
    `;

  }).join("");

}


