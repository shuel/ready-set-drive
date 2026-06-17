const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');
const requireAuth = require('../middleware/requireAuth');

const PDFDocument = require('pdfkit');
const path = require('path');

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
router.get('/', requireAuth, async (req, res) => {
  const { student_id, lesson_date, start, end } = req.query;

  let query = supabase
    .from('lessons')
    .select('*, students(first_name, last_name, hourly_rate)')
    .order('lesson_date', { ascending: true })
    .order('start_time', { ascending: true });

  if (student_id) query = query.eq('student_id', student_id);

  if (lesson_date) query = query.eq('lesson_date', lesson_date);

  if (start && end) query = query.gte('lesson_date', start).lte('lesson_date', end);

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
// GENERATE lesson receipt PDF
// =======================
// Creates a professional PDF receipt for a paid lesson.
// If the lesson does not already have a receipt number,
// one is generated and saved before the PDF is downloaded.
router.get('/:id/receipt', requireAuth, async (req, res) => {
  const { id } = req.params;

  try {
    // Load lesson with linked student details
    const { data: lesson, error } = await supabase
      .from('lessons')
      .select('*, students(first_name, last_name, hourly_rate)')
      .eq('id', id)
      .single();

    if (error || !lesson) {
      return res.status(404).json({ error: 'Lesson not found' });
    }

    // Receipts should only be generated for paid lessons
    if (!lesson.paid) {
      return res.status(400).json({
        error: 'Receipt can only be generated for paid lessons'
      });
    }

    const studentName = lesson.students
      ? `${lesson.students.first_name || ''} ${lesson.students.last_name || ''}`.trim()
      : 'Student';

    // ========================================
    // PAYMENT REFERENCE FALLBACK
    // ========================================
    // Older paid lessons may not have a payment
    // reference because the feature was added
    // later. If missing, generate and save one.
    // ========================================

    let paymentReference = lesson.payment_reference;

    if (!paymentReference) {

      const initials = studentName
        .split(" ")
        .filter(Boolean)
        .map(name => name[0].toUpperCase())
        .join("");

      const [year, month, day] = lesson.lesson_date.split("-");

      paymentReference =
        `${initials}${day}${month}${year.slice(2)}DR`;

      await supabase
        .from("lessons")
        .update({
          payment_reference: paymentReference
        })
        .eq("id", lesson.id);
    }

    // Use existing receipt number if already generated
    let receiptNumber = lesson.receipt_number;

    // Generate a receipt number only the first time a receipt is requested
    if (!receiptNumber) {
      const year = new Date().getFullYear();

      // Count existing receipts for the current year
      const { count, error: countError } = await supabase
        .from('lessons')
        .select('id', {
          count: 'exact',
          head: true
        })
        .like('receipt_number', `RSD-${year}-%`);

      if (countError) {
        return res.status(500).json({ error: countError.message });
      }

      const nextNumber = String((count || 0) + 1).padStart(6, '0');

      receiptNumber = `RSD-${year}-${nextNumber}`;

      // Save receipt number permanently
      const { error: receiptUpdateError } = await supabase
        .from('lessons')
        .update({ receipt_number: receiptNumber })
        .eq('id', id);

      if (receiptUpdateError) {
        return res.status(500).json({ error: receiptUpdateError.message });
      }
    }

    // File name shown when downloaded
    const safeStudentName = studentName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const filename = `${receiptNumber}_${safeStudentName}.pdf`;

    // Tell browser this is a downloadable PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`
    );

    // Create PDF
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50
    });

    doc.pipe(res);

    // Logo path
    const logoPath = path.join(
      __dirname,
      '..',
      'public',
      'images',
      'rsd-logo.png'
    );

    // Header
    doc.image(logoPath, 50, 40, { width: 90 });

    doc
      .fontSize(22)
      .font('Helvetica-Bold')
      .text('Ready Set Drive', 160, 50);

    doc
      .fontSize(11)
      .font('Helvetica')
      .text('Automatic Driving Lessons', 160, 78)
      .text('Professional Driving Tuition', 160, 94);

    doc
      .moveTo(50, 145)
      .lineTo(545, 145)
      .stroke();

    // Receipt title
    doc
      .fontSize(20)
      .font('Helvetica-Bold')
      .text('Payment Receipt', 50, 175);

    doc
      .fontSize(10)
      .font('Helvetica')
      .text(`Receipt No: ${receiptNumber}`, 50, 210)
      .text(`Payment Ref: ${paymentReference}`, 50, 228)
      .text(`Payment Date: ${lesson.payment_date || 'N/A'}`, 50, 246);

    // Student details
    doc
      .fontSize(13)
      .font('Helvetica-Bold')
      .text('Student Details', 50, 295);

    doc
      .fontSize(11)
      .font('Helvetica')
      .text(`Student Name: ${studentName}`, 50, 320);

    // Lesson details
    doc
      .fontSize(13)
      .font('Helvetica-Bold')
      .text('Lesson Details', 50, 365);

    doc
      .fontSize(11)
      .font('Helvetica')
      .text(`Lesson Date: ${lesson.lesson_date}`, 50, 390)
      .text(`Start Time: ${lesson.start_time?.slice(0, 5) || ''}`, 50, 408)
      .text(`End Time: ${lesson.end_time?.slice(0, 5) || ''}`, 50, 426)
      .text(`Lesson Type: ${lesson.lesson_type || 'Lesson'}`, 50, 444);

    // Amount box
    doc
      .roundedRect(50, 500, 495, 70, 8)
      .stroke();

    doc
      .fontSize(13)
      .font('Helvetica-Bold')
      .text('Amount Paid', 70, 522);

    doc
      .fontSize(20)
      .font('Helvetica-Bold')
      .text(`£${Number(lesson.price || 0).toFixed(2)}`, 420, 518);

    // Footer
    doc
      .fontSize(10)
      .font('Helvetica')
      .text(
        'Thank you for your payment. Please keep this receipt for your records.',
        50,
        650,
        { align: 'center' }
      );

    doc
      .fontSize(9)
      .fillColor('gray')
      .text(
        'Ready Set Drive | Automatic Driving Lessons',
        50,
        720,
        { align: 'center' }
      );

    doc.end();

  } catch (err) {
    console.error('Receipt generation error:', err);
    return res.status(500).json({ error: 'Failed to generate receipt' });
  }
});

// =======================
// CREATE lesson
router.post('/', requireAuth, async (req, res) => {

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
    payment_method,
    forceBooking
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
  /*const conflict = getOverlapWithBuffer(newStart, newEnd, lessons);

  if (conflict) {
    return res.status(400).json({
      error: `You already have a lesson booked from ${conflict.start_time.slice(0,5)} to ${conflict.end_time.slice(0,5)}.`
    });
  }*/

  for (const l of lessons) {

    const existingStart = toMinutes(l.start_time);
    const existingEnd = toMinutes(l.end_time);

    // 🚫 HARD BLOCK — real overlap (never allowed)
    const isOverlap = newStart < existingEnd && newEnd > existingStart;

    if (isOverlap) {
      return res.status(400).json({
        error: "OVERLAP_NOT_ALLOWED"
      });
    }

    // ⚠️ BUFFER CHECK — 30 mins before/after
    const bufferStart = existingStart - 30;
    const bufferEnd = existingEnd + 30;

    const isWithinBuffer = newStart < bufferEnd && newEnd > bufferStart;

    if (isWithinBuffer && !forceBooking) {
      return res.status(400).json({
        error: "BUFFER_CONFLICT"
      });
    }
  }

  if (await overlapsBlockedTime(lesson_date, start_time, end_time)) {
    return res.status(400).json({
      error: 'Lesson overlaps a blocked time'
    });
  }

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

});

// =======================
// UPDATE lesson
router.put('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;

  const {
    lesson_date,
    start_time,
    end_time,
    lesson_type,
    price,
    paid,
    payment_method,
    payment_reference,
    forceBooking
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

    /*const conflict = getOverlapWithBuffer(newStart, newEnd, otherLessons);

    if (conflict) {
      return res.status(400).json({
        error: `You already have a lesson booked from ${conflict.start_time.slice(0,5)} to ${conflict.end_time.slice(0,5)}.`
      });
    }*/

    for (const l of otherLessons) {

      const existingStart = toMinutes(l.start_time);
      const existingEnd = toMinutes(l.end_time);

      // 🚫 HARD BLOCK — real overlap
      const isOverlap = newStart < existingEnd && newEnd > existingStart;

      if (isOverlap) {
        return res.status(400).json({
          error: "OVERLAP_NOT_ALLOWED"
        });
      }

      // ⚠️ BUFFER CHECK — 30 mins
      const bufferStart = existingStart - 30;
      const bufferEnd = existingEnd + 30;

      const isWithinBuffer = newStart < bufferEnd && newEnd > bufferStart;

      if (isWithinBuffer && !forceBooking) {
        return res.status(400).json({
          error: "BUFFER_CONFLICT"
        });
      }
    }

    if (await overlapsBlockedTime(lesson_date, start_time, end_time)) {
      return res.status(400).json({
        error: 'Lesson overlaps a blocked time'
      });
    }
  }

  // Build update object dynamically
  //const updateFields = { ...req.body };
  const updateFields = {
    lesson_date,
    start_time,
    end_time,
    lesson_type,
    paid,
    payment_method,
    payment_reference
  };

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
      // Keep the generated reference from the frontend
      updateFields.payment_reference = payment_reference || null;
    } else {
      updateFields.payment_date = null;
      updateFields.payment_method = null;
      // If lesson is marked unpaid, remove payment reference
      updateFields.payment_reference = null;
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
router.delete('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;

  const { error } = await supabase
    .from('lessons')
    .delete()
    .eq('id', id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
