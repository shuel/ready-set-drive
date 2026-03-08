const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');

// =======================
// Helpers
function toMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

// =======================
// Calculate lesson price
// duration × student hourly rate
function calculateLessonPrice(start_time, end_time, hourlyRate) {

  const start = toMinutes(start_time);
  const end = toMinutes(end_time);

  const durationMinutes = end - start;

  let price = (durationMinutes / 60) * hourlyRate;

  // round to 2 decimals
  return Math.round(price * 100) / 100;
}


/* function hasOverlapWithBuffer(newStart, newEnd, lessons) {
  return lessons.some(l => {
    const start = toMinutes(l.start_time);
    const end = toMinutes(l.end_time);

    // 30 min buffer either side
    return newStart < end + 30 && newEnd > start - 30;
  });
}
*/
function getOverlapWithBuffer(newStart, newEnd, lessons) {

  for (const l of lessons) {
    const start = toMinutes(l.start_time);
    const end = toMinutes(l.end_time);

    if (newStart < end + 30 && newEnd > start - 30) {
      return l; // return the conflicting lesson
    }
  }

  return null;
}

function buildRange(date, start, end) {
  return `[${date} ${start}, ${date} ${end})`;
}

async function overlapsBlockedTime(lesson_date, start_time, end_time) {

  const { data: blocks, error } = await supabase
    .from('blocked_times')
    .select('start_time, end_time')
    .eq('block_date', lesson_date);

  if (error) {
    console.error('Blocked time check failed:', error);
    return false; // fail open OR you could return true to fail safe
  }

  const newStart = toMinutes(start_time);
  const newEnd = toMinutes(end_time);

  for (const b of blocks) {
    const blockStart = toMinutes(b.start_time);
    const blockEnd = toMinutes(b.end_time);

    // Basic overlap check
    if (newStart < blockEnd && newEnd > blockStart) {
      return true;
    }
  }

  return false;
}


// =======================
// GET lessons
// Supports:
//  - /lessons?student_id=UUID
//  - /lessons?lesson_date=YYYY-MM-DD
//  - /lessons?start=YYYY-MM-DD&end=YYYY-MM-DD  (weekly calendar)
router.get('/', async (req, res) => {
  const { student_id, lesson_date, start, end } = req.query;

  let query = supabase
    .from('lessons')
    .select('*, students(first_name, last_name, hourly_rate)')
    .order('lesson_date', { ascending: false })
    .order('start_time', { ascending: false });

  if (student_id) query = query.eq('student_id', student_id);

  if (lesson_date) query = query.eq('lesson_date', lesson_date);

  if (start && end) query = query.gte('lesson_date', start).lt('lesson_date', end);

  const { data, error } = await query;

  if (error) return res.status(500).json({ error: error.message });

  const lessons = (data || []).map(l => ({
    ...l,
    student_name: l.students
        ? `${l.students.first_name || ''} ${l.students.last_name || ''}`.trim()
        : ''
    }));

  res.json(lessons);
});

// =======================
// CREATE lesson
router.post('/', async (req, res) => {

  const { 
    student_id, 
    lesson_date, 
    start_time, 
    end_time, 
    status, 
    paid, 
    notes, 
    lesson_type,
    price,
    payment_method
  } = req.body;

  if (!student_id || !lesson_date || !start_time || !end_time) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const newStart = toMinutes(start_time);
  const newEnd = toMinutes(end_time);

  const { data: lessons, error } = await supabase
    .from('lessons')
    .select('start_time, end_time')
    .eq('lesson_date', lesson_date);

  if (error) return res.status(500).json({ error: error.message });

  /*
  if (hasOverlapWithBuffer(newStart, newEnd, lessons)) {
    return res.status(400).json({
      error: 'Lesson overlaps another lesson or violates 30-minute buffer'
    });
  }
  */
  const conflict = getOverlapWithBuffer(newStart, newEnd, lessons);

  if (conflict) {
    return res.status(400).json({
      error: `You already have a lesson booked from ${conflict.start_time.slice(0,5)} to ${conflict.end_time.slice(0,5)}.`
    });
  }

  if (await overlapsBlockedTime(lesson_date, start_time, end_time)) {
    return res.status(400).json({
      error: 'Lesson overlaps a blocked time'
    });
  }

  // 🔹 Determine final price (auto from student if not provided)
  console.log("Incoming price:", price, typeof price);
  
  // Get student hourly rate
  const { data: student } = await supabase
    .from('students')
    .select('hourly_rate')
    .eq('id', student_id)
    .single();

  const hourlyRate = Number(student?.hourly_rate) || 0;

  // Calculate price using helper
  const finalPrice = calculateLessonPrice(start_time, end_time, hourlyRate);

  const isPaid = paid === true;

  const payment_date = isPaid
    ? new Date().toISOString().split('T')[0]
    : null;

  const { data, error: insertError } = await supabase
    .from('lessons')
    .insert([{
      student_id,
      lesson_date,
      start_time,
      end_time,
      lesson_timerange: buildRange(lesson_date, start_time, end_time),
      status: status || 'Booked',
      lesson_type: lesson_type || 'Lesson',
      notes: notes || null,
      price: finalPrice,
      paid: isPaid,
      payment_date,
      payment_method: isPaid ? payment_method || null : null
    }])
    .select();

  if (insertError) {
    return res.status(500).json({ error: insertError.message });
  }

  res.status(201).json(data);

  console.log("Duration:", durationMinutes);
  console.log("Hourly:", hourlyRate);
  console.log("Final Price:", finalPrice);
});

// =======================
// UPDATE lesson
router.put('/:id', async (req, res) => {
  const { id } = req.params;

  const {
    lesson_date,
    start_time,
    end_time,
    lesson_type,
    price,
    paid,
    payment_method
  } = req.body;

  // If time fields are provided, run overlap logic
  if (lesson_date && start_time && end_time) {

    const newStart = toMinutes(start_time);
    const newEnd = toMinutes(end_time);

    const { data: lessons, error } = await supabase
      .from('lessons')
      .select('id, start_time, end_time')
      .eq('lesson_date', lesson_date);

    if (error) return res.status(500).json({ error: error.message });

    const otherLessons = lessons.filter(l => l.id !== id);

    const conflict = getOverlapWithBuffer(newStart, newEnd, otherLessons);

    if (conflict) {
      return res.status(400).json({
        error: `You already have a lesson booked from ${conflict.start_time.slice(0,5)} to ${conflict.end_time.slice(0,5)}.`
      });
    }

    if (await overlapsBlockedTime(lesson_date, start_time, end_time)) {
      return res.status(400).json({
        error: 'Lesson overlaps a blocked time'
      });
    }
  }

  // Build update object dynamically
  const updateFields = { ...req.body };

  // 🔹 Rebuild timerange if date/time provided
  if (lesson_date && start_time && end_time) {
    updateFields.lesson_timerange =
      buildRange(lesson_date, start_time, end_time);
  }

  // =========================================
  // 🔹 Recalculate lesson price on edit
  // =========================================

  if (lesson_date && start_time && end_time) {

    // Get the student's hourly rate
    const { data: lesson, error } = await supabase
      .from('lessons')
      .select('student_id, students(hourly_rate)')
      .eq('id', id)
      .single();

    if (!error && lesson) {

      const hourlyRate = Number(lesson.students?.hourly_rate) || 0;

      // Recalculate price using helper
      updateFields.price = calculateLessonPrice(
        start_time,
        end_time,
        hourlyRate
      );

    }
  }
  
  // =========================================

  // 🔹 Normalise paid + revenue fields
  if (typeof paid !== 'undefined') {

    const isPaid = paid === true;

    updateFields.paid = isPaid;

    if (isPaid) {
      updateFields.payment_date =
        new Date().toISOString().split('T')[0];
      updateFields.payment_method = payment_method || null;
    } else {
      updateFields.payment_date = null;
      updateFields.payment_method = null;
    }
  }

  const { data, error: updateError } = await supabase
    .from('lessons')
    .update(updateFields)
    .eq('id', id)
    .select();

  if (updateError) {
    return res.status(500).json({ error: updateError.message });
  }

  res.json(data);
});


// =======================
// DELETE lesson
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  const { error } = await supabase
    .from('lessons')
    .delete()
    .eq('id', id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
