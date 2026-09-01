export default async function handler(req: any, res: any) {
  // Only allow GET requests for the cron job
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Missing Supabase credentials in Vercel Environment Variables' });
  }

  try {
    // A simple GET request to the REST API root is enough to register activity
    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: 'GET',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    });

    if (response.ok) {
      return res.status(200).json({ status: 'Supabase ping successful' });
    } else {
      return res.status(response.status).json({ error: 'Failed to ping Supabase' });
    }
  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error', details: String(error) });
  }
}
