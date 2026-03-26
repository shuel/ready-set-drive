// Accounts logic (v1 - summary only)

// --- Helper fumctions here ---//
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

  const today = new Date();

  // Get start of week (Monday)
  const startOfWeek = new Date(today);
  const day = startOfWeek.getDay();
  const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
  startOfWeek.setDate(diff);
  startOfWeek.setHours(0, 0, 0, 0);

  const weeklyLessons = lessons.filter(l => {
    if (!l.lesson_date) return false;

    const lessonDate = new Date(l.lesson_date);
    return lessonDate >= startOfWeek;
  });

  lessons.forEach(l => {

    const price = l.price || 0;

    // Total revenue
    totalRevenue += price;

    // Paid
    if (l.paid === "Yes" || l.paid === true) {
      totalPaid += price;
    }

    // Weekly revenue (based on lesson_date)
    if (l.lesson_date) {
      const lessonDate = new Date(l.lesson_date);

      if (lessonDate >= startOfWeek) {
        weeklyRevenue += price;
      }
    }

  });

  const totalOutstanding = totalRevenue - totalPaid;

  weeklyLessons.sort((a, b) => {
    return new Date(a.lesson_date + "T" + a.start_time) - 
          new Date(b.lesson_date + "T" + b.start_time);
  });

  // --- Render ---
  document.getElementById("totalRevenue").textContent = formatCurrency(totalRevenue);
  document.getElementById("totalRevenue").textContent = formatCurrency(totalRevenue);
  document.getElementById("totalPaid").textContent = formatCurrency(totalPaid);
  document.getElementById("totalOutstanding").textContent = formatCurrency(totalOutstanding);
  document.getElementById("weeklyRevenue").textContent = formatCurrency(weeklyRevenue);

  const outstandingEl = document.getElementById("totalOutstanding");

  // reset classes first (important if it re-renders)
  outstandingEl.classList.remove("text-red", "text-green");

  if (totalOutstanding > 0) {
    outstandingEl.classList.add("text-red");
  } else {
    outstandingEl.classList.add("text-green");
  }

  const container = document.getElementById("weeklyLessons");

  if (weeklyLessons.length === 0) {
    container.innerHTML = "No lessons this week";
    return;
  }

  container.innerHTML = weeklyLessons.map(l => {

    const price = l.price || 0;
    const paid = (l.paid === "Yes" || l.paid === true);

    return `
      <div class="lesson-item">
        <div class="lesson-left">
          <strong>${l.student_name || "Student"}</strong>
          <span>${formatLessonDate(l.lesson_date, l.start_time)}</span>
        </div>

        <div class="lesson-right">
          <div>£${price.toFixed(2)}</div>
          <div class="${paid ? "paid" : "unpaid"}">
            ${paid ? "Paid" : "Unpaid"}
          </div>
        </div>
      </div>
    `;

  }).join("");
}
