// Initialize Supabase client (frontend)

const SUPABASE_URL = "https://mdqqyoqetsosmtfltcae.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kcXF5b3FldHNvc210Zmx0Y2FlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0MTM5OTgsImV4cCI6MjA4NDk4OTk5OH0.RL01gHs-Z3lOeCJEEAuQlzdWjrPR1Zvat_fARO1VeAY";

window.supabase = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);