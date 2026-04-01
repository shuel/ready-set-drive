async function openCreateLessonModal() {

  // Fetch selected student's hourly rate for live price calculation
  if (selectedStudentId) {
    const { res, data } = await fetchJson(`${API}/students/${selectedStudentId}`);

    if (res.ok) {
      window.currentHourlyRate = data.hourly_rate || 0;
    } else {
      window.currentHourlyRate = 0;
    }
  } else {
    window.currentHourlyRate = 0;
  }

  // Show lesson fields
  document.getElementById("lessonFields").style.display = "block";
  document.getElementById("blockFields").style.display = "none";

  isCreateMode = true;
  isBlockMode = false;
  selectedLessonId = null;

  if (selectedStudentId && isStudentView) {
    if (typeof toggleStudentSelect === "function") {
      toggleStudentSelect(false); // coming from student profile
    }
  } else {
    if (typeof toggleStudentSelect === "function") {
      toggleStudentSelect(true); // coming from weekly
    }
  }

  // 👇 ensure student is set when coming from student view
  if (selectedStudentId && window.isStudentView) {
    window.selectedStudentIdForLesson = selectedStudentId;
  }

  // Set modal defaults
  document.getElementById("lessonModalTitle").textContent = "Create Lesson";
  document.getElementById("editLessonType").value = "Lesson";
  document.getElementById("editLessonPaid").value = "No";

  const studentSearch = document.getElementById("lessonStudentSearch");
  const studentResults = document.getElementById("lessonStudentResults");

  if (studentSearch && studentResults) {
    if (window.currentStudentId) {
      studentSearch.value = window.selectedStudentName || "";
      studentSearch.style.display = "none";
      studentResults.style.display = "none";
    } else {
      studentSearch.value = "";
      studentSearch.dataset.studentId = "";
      studentSearch.style.display = "block";
      studentResults.style.display = "block";
    }
  }

  const modal = getLessonModal();
  if (!modal) return;

  modal.classList.remove("hidden");
  setupStudentSearch();

  const startInput = document.getElementById("editStartTime");
  const endInput = document.getElementById("editEndTime");

  // Update price preview when times change
  function updateLivePrice() {
    const price = calculateLessonPrice(
      startInput.value,
      endInput.value,
      window.currentHourlyRate
    );

    document.getElementById("editLessonPrice").textContent =
      `£${price.toFixed(2)}`;
  }

  // Run once immediately
  updateLivePrice();

  // Update whenever times change
  startInput.addEventListener("input", updateLivePrice);
  endInput.addEventListener("input", updateLivePrice);
}

// Expose functions to be global
window.openCreateLessonModal = openCreateLessonModal;