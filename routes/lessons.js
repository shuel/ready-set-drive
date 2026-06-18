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

// ========================================
// PDF LESSON DISPLAY HELPERS
// ========================================

function getLessonDescription(lesson) {
  if (lesson.lesson_type === 'Test') {
    return 'Driving Test Vehicle Hire & Instructor Support';
  }

  return 'Automatic Driving Lesson';
}

function getLessonTimeDisplay(lesson, startTime, endTime) {
  if (lesson.lesson_type === 'Test') {
    return startTime;
  }

  return `${startTime} - ${endTime}`;
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
    const safeStudentName = studentName.replace(/[^a-z0-9]/gi, '-');
    const filename = `${receiptNumber}-${safeStudentName}.pdf`;

    // Format dates for receipt display
    const formatDate = (dateStr) => {
      if (!dateStr) return 'N/A';

      return new Date(dateStr).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      });
    };

    const lessonDateDisplay = formatDate(lesson.lesson_date);
    const paymentDateDisplay = formatDate(lesson.payment_date);

    const startTime = lesson.start_time?.slice(0, 5) || '';
    const endTime = lesson.end_time?.slice(0, 5) || '';
    const amountPaid = `£${Number(lesson.price || 0).toFixed(2)}`;

    // Tell browser this is a downloadable PDF
    res.setHeader('Content-Type', 'application/pdf');

    res.setHeader(
      'Access-Control-Expose-Headers',
      'Content-Disposition'
    );

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`
    );

    // Create PDF
    const doc = new PDFDocument({
      size: 'A4',
      margin: 45
    });

    doc.pipe(res);

    // Brand colours
    const navy = '#0B1F3A';
    const blue = '#1E88E5';
    const lightBlue = '#EAF3FF';
    const grey = '#6B7280';
    const lightGrey = '#E5E7EB';

    // Logo path
    const logoPath = path.join(
      __dirname,
      '..',
      'public',
      'images',
      'rsd-logo.png'
    );

    // ========================================
    // HEADER
    // ========================================

    doc.image(logoPath, 45, 35, { width: 82 });

    doc
      .fillColor(navy)
      .fontSize(22)
      .font('Helvetica-Bold')
      .text('READY SET DRIVE', 145, 45);

    doc
      .fillColor(grey)
      .fontSize(10)
      .font('Helvetica')
      .text('Automatic Driving Lessons', 145, 74)
      .text('DVSA Approved Driving Instructor', 145, 90);

    // Receipt box
    doc
      .roundedRect(390, 42, 155, 68, 8)
      .fillAndStroke(lightBlue, blue);

    doc
      .fillColor(navy)
      .fontSize(16)
      .font('Helvetica-Bold')
      .text('RECEIPT', 410, 55, { width: 115, align: 'center' });

    doc
      .fillColor(grey)
      .fontSize(8)
      .font('Helvetica')
      .text(receiptNumber, 405, 82, { width: 125, align: 'center' });

    // Blue divider
    doc
      .strokeColor(blue)
      .lineWidth(2)
      .moveTo(45, 135)
      .lineTo(550, 135)
      .stroke();

    // ========================================
    // PAYMENT SUMMARY
    // ========================================

    doc
      .fillColor(navy)
      .fontSize(12)
      .font('Helvetica-Bold')
      .text('RECEIVED FROM', 45, 165);

    doc
      .fillColor('#000000')
      .fontSize(15)
      .font('Helvetica-Bold')
      .text(studentName, 45, 188);

    doc
      .fillColor(navy)
      .fontSize(12)
      .font('Helvetica-Bold')
      .text('PAYMENT DETAILS', 320, 165);

    doc
      .fillColor(grey)
      .fontSize(10)
      .font('Helvetica')
      .text('Payment Reference', 320, 190)
      .fillColor('#000000')
      .font('Helvetica-Bold')
      .text(paymentReference, 440, 190);

    doc
      .fillColor(grey)
      .font('Helvetica')
      .text('Payment Date', 320, 210)
      .fillColor('#000000')
      .font('Helvetica-Bold')
      .text(paymentDateDisplay, 440, 210);

    // ========================================
    // LESSON DETAILS CARD
    // ========================================

    doc
      .roundedRect(45, 260, 505, 120, 10)
      .strokeColor(lightGrey)
      .lineWidth(1)
      .stroke();

    doc
      .fillColor(navy)
      .fontSize(13)
      .font('Helvetica-Bold')
      .text('LESSON DETAILS', 65, 282);

    doc
      .fillColor(grey)
      .fontSize(10)
      .font('Helvetica')
      .text('Date', 65, 315)
      .text('Time', 65, 340)
      .text('Lesson Type', 65, 365);

    const receiptLessonTime = getLessonTimeDisplay(
      lesson,
      startTime,
      endTime
    );

    const receiptLessonDescription = getLessonDescription(
      lesson
    );

    doc
      .fillColor('#000000')
      .font('Helvetica-Bold')
      .text(lessonDateDisplay, 170, 315)
      .text(receiptLessonTime, 170, 340)
      .text(receiptLessonDescription, 170, 365);

    // ========================================
    // AMOUNT RECEIVED CARD
    // ========================================

    doc
      .roundedRect(45, 425, 505, 105, 12)
      .fillAndStroke(lightBlue, blue);

    doc
      .fillColor(navy)
      .fontSize(12)
      .font('Helvetica-Bold')
      .text('AMOUNT RECEIVED', 45, 450, {
        width: 505,
        align: 'center'
      });

    doc
      .fillColor(navy)
      .fontSize(34)
      .font('Helvetica-Bold')
      .text(amountPaid, 45, 475, {
        width: 505,
        align: 'center'
      });

    // ========================================
    // FOOTER
    // ========================================

    doc
      .fillColor('#000000')
      .fontSize(11)
      .font('Helvetica')
      .text('Thank you for your payment.', 45, 585, {
        width: 505,
        align: 'center'
      });

    doc
      .fillColor(grey)
      .fontSize(9)
      .text(
        'Ready Set Drive — Helping you become a safe, confident driver for life.',
        45,
        710,
        {
          width: 505,
          align: 'center'
        }
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
