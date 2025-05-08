import dotenv from 'dotenv';
import fetch from 'node-fetch';
import zlib from 'zlib';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const username = process.env.FOURTHWALL_API_USER;
const password = process.env.FOURTHWALL_API_PASS;

const tierMap = {
  'mt_28243': 'Pro',
  'mt_28247': 'Elite',
  // Add more tierId mappings here
};

export async function getAndSyncMembers() {
  const authHeader = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');

  try {
    const res = await fetch('https://api.fourthwall.com/open-api/v1.0/memberships/members', {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    const buffer = await res.buffer();
    //const json = JSON.parse(zlib.gunzipSync(buffer).toString('utf-8'));
    const json = await res.json(); // Let node-fetch handle encoding automatically


    const members = json.results.map(m => ({
      email: m.email?.toLowerCase() ?? 'unknown',
      tier: tierMap[m.subscription?.variant?.tierId] ?? 'Free',
      active: ['ACTIVE', 'SUSPENDED'].includes(m.subscription?.type),
      interval: m.subscription?.variant?.interval ?? null,
      amount: m.subscription?.variant?.amount?.value ?? null,
    }));

    for (const member of members) {
      const { error } = await supabase.from('members').upsert(
        {
          email: member.email,
          tier: member.tier,
          active: member.active,
          renewal_date: null, // You could calculate this if you want
        },
        { onConflict: 'email' }
      );

      if (error) {
        console.error(`[Supabase] ❌ Failed to upsert ${member.email}:`, error);
      } else {
        console.log(`[Supabase] ✅ Synced member: ${member.email}`);
      }
    }

    console.log(`[Fourthwall] ✅ Synced ${members.length} members`);
    return members;
  } catch (err) {
    console.error('[Fourthwall] ❌ Failed to fetch or parse members:', err.message);
    return [];
  }
}
