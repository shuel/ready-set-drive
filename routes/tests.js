const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');


// GET tests for a student
router.get('/student/:id', async (req, res) => {

  const { id } = req.params;

  const { data, error } = await supabase
    .from('tests')
    .select('*')
    .eq('student_id', id)
    .order('test_date', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  res.json(data);

});


// CREATE test
router.post('/', async (req, res) => {

  const { student_id, test_type, test_date, result, attempt_number, notes } = req.body;

  const { data, error } = await supabase
    .from('tests')
    .insert([{
      student_id,
      test_type,
      test_date,
      result,
      attempt_number,
      notes
    }])
    .select();

  if (error) return res.status(500).json({ error: error.message });

  res.json(data[0]);

});


// DELETE test
router.delete('/:id', async (req, res) => {

  const { id } = req.params;

  const { error } = await supabase
    .from('tests')
    .delete()
    .eq('id', id);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ success: true });

});

// UPDATE test result
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { result } = req.body;

  const { data, error } = await supabase
    .from("tests")
    .update({ result })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error(error);
    return res.status(400).json({ error: "Failed to update test" });
  }

  res.json(data);
});

module.exports = router;