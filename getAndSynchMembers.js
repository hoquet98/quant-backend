import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const username = process.env.FOURTHWALL_API_USER;
const password = process.env.FOURTHWALL_API_PASS;

const tierMap = {
  'mt_28243': 'Pro',
  'mt_28247': 'Elite',
  // Add more tierId mappings if needed
};

export async function getAndSyncMembers() {
  const authHeader = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');

  try {
    const res = await fetch('https://api.fourthwall.com/open-api/v1.0/memberships/members', {
      method: 'GET',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`HTTP error! Status: ${res.status}`);
    }

    const json = await res.json();

    const members = json.results.map(m => ({
      email: m.email?.toLowerCase() ?? 'unknown',
      member_id: parseInt(m.id, 10) || null,
      nickname: m.nickname || null,
      tier: tierMap[m.subscription?.variant?.tierId] ?? 'Free',
      active: ['ACTIVE', 'SUSPENDED'].includes(m.subscription?.type),
    }));

    let successCount = 0;

    for (const member of members) {
      const { error } = await supabase.from('members').upsert(
        {
          email: member.email,
          member_id: member.member_id,
          nickname: member.nickname,
          tier: member.tier,
          active: member.active,
          // ❌ Do NOT include renewal_date here — we want to preserve webhook values
        },
        { onConflict: 'email' }
      );

      if (error) {
        console.error(`[Supabase] ❌ Failed to upsert ${member.email}:`, error);
      } else {
        successCount++;
      }
    }

    console.log(`[Supabase] ✅ Synced ${successCount} members`);
    return members;
  } catch (err) {
    console.error('[Fourthwall] ❌ Failed to fetch or parse members:', err.message);
    return [];
  }
}

