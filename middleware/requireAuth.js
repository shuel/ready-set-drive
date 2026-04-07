// middleware/requireAuth.js

const { createClient } = require('@supabase/supabase-js');

// Create Supabase server client (safe for backend)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async function requireAuth(req, res, next) {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: "No token provided" });
    }

    // Extract token (Bearer xxx)
    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "Invalid token format" });
    }

    // Verify user with Supabase
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Attach user to request (optional but useful)
    req.user = data.user;

    next(); // allow request through

  } catch (err) {
    console.error("Auth error:", err);
    res.status(500).json({ error: "Server error" });
  }
};