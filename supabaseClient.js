const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('Supabase URL:', supabaseUrl);
console.log('Using service role key:', serviceRoleKey ? 'YES' : 'NO');

const supabase = createClient(supabaseUrl, serviceRoleKey);

module.exports = supabase;
