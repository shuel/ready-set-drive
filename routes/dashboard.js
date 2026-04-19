const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');
const requireAuth = require('../middleware/requireAuth');
const formatDate = (d) => d.toLocaleDateString('en-CA');

router.get('/stats', requireAuth, async (req, res) => {

  console.log("STATS ROUTE HIT");

  const today = formatDate(new Date());
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const weekStartDate = new Date(now);
  weekStartDate.setDate(now.getDate() + diffToMonday);

  const weekEndDate = new Date(weekStartDate);
  weekEndDate.setDate(weekStartDate.getDate() + 6);

  const weekStart = formatDate(weekStartDate);
  const weekEnd = formatDate(weekEndDate);

  // Get lessons
  const { data: lessons, error: lessonError } = await supabase
    .from('lessons')
    .select('price, paid, lesson_date');

  if (lessonError) {
    return res.status(500).json({ error: lessonError.message });
    //return res.status(500).json({ error: lessonError });
  }

  // Get active students
  const { count: activeStudents, error: studentError } = await supabase
    .from('students')
    .select('*', { count: 'exact', head: true })
    .eq('active', 'true');

  if (studentError) {
    return res.status(500).json({ error: studentError.message });
    //return res.status(500).json({ error: studentError });
  }

  let todayLessons = 0;
  let weekLessons = 0;
  let weekRevenue = 0;

  console.log("Today:", today);
  console.log("Week Start:", weekStart);
  console.log("Week End:", weekEnd);
  console.log("Lesson Dates:", lessons.map(l => l.lesson_date));

  lessons.forEach(l => {

    if (l.lesson_date === today) {
      todayLessons++;
    }

    if (l.lesson_date >= weekStart && l.lesson_date <= weekEnd) {
      weekLessons++;

      if (l.paid) {
        weekRevenue += Number(l.price) || 0;
      }
    }
  });

  // Outstanding revenue (unpaid lessons)
  const { data: unpaidLessons, error: unpaidError } = await supabase
  .from('lessons')
  .select('price')
  .eq('paid', false);

  if (unpaidError) {
  return res.status(500).json({ error: unpaidError.message });
  }

  const outstandingRevenue = unpaidLessons
  .reduce((sum, l) => sum + Number(l.price || 0), 0);

  res.json({
    todayLessons,
    weekLessons,
    activeStudents: activeStudents || 0,
    weekRevenue,
    outstandingRevenue
  });
});

module.exports = router;
