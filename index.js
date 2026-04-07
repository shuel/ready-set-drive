require('dotenv').config();
console.log("ENV URL:", process.env.SUPABASE_URL);
const path = require('path');

console.log('Index.js loaded');

const supabase = require('./supabaseClient');

/*
(async () => {
  const { data, error } = await supabase.from('students').select('*');
  if (error) {
    console.error('Supabase test failed:', error);
  } else {
    console.log('Supabase test succeeded:', data);
  }
})();
*/
const express = require('express');
const cors = require('cors');

const dashboardRoutes = require('./routes/dashboard');
const studentRoutes = require('./routes/students');
const lessonRoutes = require('./routes/lessons');
const testRoutes = require('./routes/tests');
const blockedTimesRoutes = require('./routes/blocked_times');

const app = express();

app.use(cors());
app.use(express.json());
// Serve frontend
app.use(express.static(path.join(__dirname, 'public')));

app.use('/students', studentRoutes);
app.use('/lessons', lessonRoutes);
app.use('/tests', testRoutes);
app.use('/blocked_times', blockedTimesRoutes);
app.use('/dashboard', dashboardRoutes);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
