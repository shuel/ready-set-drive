const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');

// =======================
// GET student financial summary
router.get('/:id/finance', async (req, res) => {

  const { id } = req.params;

  const { data: lessons, error } = await supabase
    .from('lessons')
    .select('price, paid')
    .eq('student_id', id);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const total = lessons.reduce((sum, l) => sum + Number(l.price || 0), 0);

  const paid = lessons
    .filter(l => l.paid)
    .reduce((sum, l) => sum + Number(l.price || 0), 0);

  const outstanding = total - paid;

  res.json({
    total,
    paid,
    outstanding
  });

});

// =======================
// GET single student
router.get('/:id', async (req, res) => {

  const { id } = req.params;

  const { data, error } = await supabase
    .from('students')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    return res.status(404).json({ error: 'Student not found' });
  }

  res.json(data);
});


// GET all students with lesson stats
router.get('/', async (req, res) => {

  const { data, error } = await supabase
    .from('students')
    .select(`
      *,
      lessons:lessons (
        lesson_date,
        id,
        start_time,
        end_time,
        price,
        paid
      )
    `)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  // Calculate lesson stats
  const studentsWithStats = data.map(student => {

    const lessons = student.lessons || [];

    const lessons_completed = lessons.length;

    const total_lesson_value = lessons.reduce((total, l) => {
      return total + (l.price || 0);
    }, 0);

    const total_paid = lessons.reduce((total, l) => {
      return total + (l.paid ? (l.price || 0) : 0);
    }, 0);

    const outstanding_balance = total_lesson_value - total_paid;

    const hours_driven = lessons.reduce((total, l) => {
      if (!l.start_time || !l.end_time) return total;

      const start = new Date(`1970-01-01T${l.start_time}`);
      const end = new Date(`1970-01-01T${l.end_time}`);

      return total + ((end - start) / 3600000);
    }, 0);

    const now = new Date();
    const today = new Date().toDateString();

    // Lessons happening today (past OR future)
    const todayLessons = lessons.filter(l =>
      new Date(`${l.lesson_date}T${l.start_time}`).toDateString() === today
    );

    // Future lessons
    const futureLessons = lessons
      .filter(l => new Date(`${l.lesson_date}T${l.start_time}`) > now)
      .sort((a, b) =>
        new Date(`${a.lesson_date}T${a.start_time}`) -
        new Date(`${b.lesson_date}T${b.start_time}`)
      );

    let nextLesson = null;

    if (todayLessons.length) {
      nextLesson = todayLessons[0];
    } else if (futureLessons.length) {
      nextLesson = futureLessons[0];
    }

    return {
      ...student,
      lessons: undefined, // remove lesson array
      lessons_completed,
      hours_driven: Number(hours_driven.toFixed(1)),
      next_lesson: nextLesson,
      outstanding_balance
    };

  });


  res.json(studentsWithStats);

});


// POST create a new student
router.post('/', async (req, res) => {
  const {
    first_name,
    last_name,
    phone,
    email,
    date_of_birth,
    address1,
    address2,
    town_city,
    postcode,
    source,
    hourly_rate,
    notes,
    active
  } = req.body;

  // Basic server-side validation
  if (
    !first_name ||
    !last_name ||
    !phone ||
    !address1 ||
    !town_city ||
    !postcode ||
    !source ||
    !hourly_rate ||
    !active
  ) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const { data, error } = await supabase
    .from('students')
    .insert([{
      first_name,
      last_name,
      phone,
      email: email || null,
      date_of_birth: date_of_birth || null,
      address1,
      address2: address2 || null,
      town_city,
      postcode,
      source,
      hourly_rate,
      notes: notes || null,
      active
    }]);

  if (error) return res.status(500).json({ error: error.message });

  res.status(201).json(data);
});

// UPDATE student
router.put('/:id', async (req, res) => {
  const { id } = req.params;

  const {
    first_name,
    last_name,
    phone,
    email,
    date_of_birth,
    address1,
    address2,
    town_city,
    postcode,
    source,
    hourly_rate,
    notes,
    active
  } = req.body;

  if (!first_name || !last_name) {
    return res.status(400).json({ error: 'First and last name required' });
  }

  const { data, error } = await supabase
    .from('students')
    .update({
      first_name,
      last_name,
      phone,
      email,
      date_of_birth,
      address1,
      address2,
      town_city,
      postcode,
      source,
      hourly_rate,
      notes,
      active
    })
    .eq('id', id)
    .select();

  if (error) return res.status(500).json({ error: error.message });

  res.json(data[0]);
});

//Deleteing a student
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  const { error } = await supabase
    .from('students')
    .delete()
    .eq('id', id);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ message: 'Student deleted' });
});

// Update instructor notes
router.put('/:id/notes', async (req, res) => {
  const { id } = req.params;
  const { notes } = req.body;

  const { data, error } = await supabase
    .from('students')
    .update({ notes })
    .eq('id', id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  res.json(data);
});


module.exports = router;
