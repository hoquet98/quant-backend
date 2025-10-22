import dotenv from 'dotenv';
import fetch from 'node-fetch';
import pool from './supabaseClient.js';

dotenv.config();

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
      try {
        await pool.query(
          `INSERT INTO members (email, member_id, nickname, tier, active)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (email)
           DO UPDATE SET
             member_id = EXCLUDED.member_id,
             nickname = EXCLUDED.nickname,
             tier = EXCLUDED.tier,
             active = EXCLUDED.active`,
          [member.email, member.member_id, member.nickname, member.tier, member.active]
        );
        successCount++;
      } catch (error) {
        console.error(`[Database] ❌ Failed to upsert ${member.email}:`, error);
      }
    }

    console.log(`[Database] ✅ Synced ${successCount} members`);
    return members;
  } catch (err) {
    console.error('[Fourthwall] ❌ Failed to fetch or parse members:', err.message);
    return [];
  }
}

