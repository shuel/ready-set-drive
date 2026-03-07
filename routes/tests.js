const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');

// =======================
// GET tests (optionally by student)
// =======================
router.get('/', async (req, res) => {
  const { student_id } = req.query;

  let query = supabase.from('tests').select('*');

  if (student_id) {
    query = query.eq('student_id', student_id);
  }

  const { data, error } = await query.order('test_date', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// =======================
// POST create a new test
// =======================
router.post('/', async (req, res) => {
  const { student_id, test_date, test_type, status, result, location } = req.body;

  if (!student_id || !test_date || !test_type) {
    return res.status(400).json({ error: 'student_id, test_date and test_type are required' });
  }

  const { data, error } = await supabase.from('tests').insert([{
    student_id,
    test_date,
    test_type,
    status: status || 'Pending',
    result: result || null,
    location
  }]).select();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// =======================
// PUT update a test
// =======================
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  const { data, error } = await supabase
    .from('tests')
    .update(updates)
    .eq('id', id)
    .select();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// =======================
// DELETE a test
// =======================
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  const { data, error } = await supabase
    .from('tests')
    .delete()
    .eq('id', id)
    .select();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
