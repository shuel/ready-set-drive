const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');

// GET /blocked_times?start=YYYY-MM-DD&end=YYYY-MM-DD
router.get('/', async (req, res) => {
  const { start, end } = req.query;

  if (!start || !end) {
    return res.status(400).json({ error: 'start and end are required' });
  }

  const { data, error } = await supabase
    .from('blocked_times')
    .select('*')
    .gte('block_date', start)
    .lt('block_date', end)
    .order('block_date', { ascending: true })
    .order('start_time', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// CREATE blocked time
router.post('/', async (req, res) => {
  const { block_date, start_time, end_time, reason } = req.body;

  if (!block_date || !start_time || !end_time) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const toMinutes = (t) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  const newStart = toMinutes(start_time);
  const newEnd = toMinutes(end_time);

  // 1️⃣ Check overlap with existing lessons
  const { data: lessons, error: lessonError } = await supabase
    .from('lessons')
    .select('start_time, end_time')
    .eq('lesson_date', block_date);

  if (lessonError)
    return res.status(500).json({ error: lessonError.message });

  for (const l of lessons) {
    const start = toMinutes(l.start_time);
    const end = toMinutes(l.end_time);

    if (newStart < end && newEnd > start) {
      return res.status(400).json({
        error: 'Blocked time overlaps an existing lesson'
      });
    }
  }

  // 2️⃣ Insert blocked time
  const { data, error } = await supabase
    .from('blocked_times')
    .insert([{ block_date, start_time, end_time, reason }])
    .select();

  if (error)
    return res.status(500).json({ error: error.message });

  res.status(201).json(data);
});

module.exports = router;
