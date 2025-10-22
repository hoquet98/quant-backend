import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { Resend } from 'resend';
import { getAndSyncMembers } from './getAndSynchMembers.js';
import pool from './supabaseClient.js';

dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);

const app = express();
const port = process.env.PORT || 8080;

app.use(cors());
app.use(bodyParser.json());

const MEMBERS_FILE = path.resolve('members.json');
const verificationCodes = {};

const tierMap = {
  'mt_28243': 'Pro',
  'mt_28247': 'Elite',
  // add more as needed
};

function loadMembers() {
  if (!fs.existsSync(MEMBERS_FILE)) return {};
  return JSON.parse(fs.readFileSync(MEMBERS_FILE, 'utf-8'));
}

function saveMembers(data) {
  fs.writeFileSync(MEMBERS_FILE, JSON.stringify(data, null, 2));
}

app.get('/', (req, res) => {
  res.send('Quant backend is running!');
});

app.get('/check-membership', async (req, res) => {
  const email = req.query.email?.toLowerCase();

  if (!email) return res.status(400).json({ error: 'Missing email parameter' });

  try {
    const result = await pool.query(
      'SELECT tier, active FROM members WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ active: false, tier: null });
    }

    return res.json({
      active: result.rows[0].active,
      tier: result.rows[0].tier
    });
  } catch (err) {
    console.error('❌ Error checking membership:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/webhook/fourthwall', async (req, res) => {
  const payload = req.body;
  console.log('[Webhook] 🔍 Full payload:', JSON.stringify(payload, null, 2));

  const email = payload?.data?.email?.toLowerCase();
  const tierId = payload?.data?.subscription?.variant?.tierId || 'unknown';
  const interval = payload?.data?.subscription?.variant?.interval || 'MONTHLY';
  const isActive = ['ACTIVE', 'SUSPENDED'].includes(payload?.data?.subscription?.type);
  const tierName = tierMap[tierId] || 'Free';
  const renewDate = new Date();
  if (interval === 'MONTHLY') renewDate.setMonth(renewDate.getMonth() + 1);
  if (interval === 'YEARLY') renewDate.setFullYear(renewDate.getFullYear() + 1);
  const formattedRenewDate = renewDate.toISOString().split('T')[0];

  const nickname = payload?.data?.nickname || null;
  const memberId = parseInt(payload?.data?.id, 10) || null;

  if (!email) return res.status(400).send('Missing email');

  try {
    await pool.query(
      `INSERT INTO members (email, member_id, nickname, tier, active, renewal_date)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (email)
       DO UPDATE SET
         member_id = EXCLUDED.member_id,
         nickname = EXCLUDED.nickname,
         tier = EXCLUDED.tier,
         active = EXCLUDED.active,
         renewal_date = EXCLUDED.renewal_date`,
      [email, memberId, nickname, tierName, isActive, formattedRenewDate]
    );

    res.sendStatus(200);
  } catch (error) {
    console.error('[Webhook] ❌ Database error:', error);
    return res.status(500).send('Database error');
  }
});


app.post('/send-code', async (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ success: false, error: 'Invalid email' });
  }

  const lowerEmail = email.toLowerCase();
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const now = new Date();
  const expires = new Date(now.getTime() + 15 * 60 * 1000); // 15 minutes

  try {
    // Store in database `verifications` table
    await pool.query(
      `INSERT INTO verifications (email, code, expires, created_at)
       VALUES ($1, $2, $3, $4)`,
      [lowerEmail, code, expires.toISOString(), now.toISOString()]
    );

    // Send email via Resend
    await resend.emails.send({
      from: 'Quant Trading <no-reply@quanttradingpro.com>',
      to: [lowerEmail],
      subject: 'Your Quant Trading Verification Code',
      html: `<p>Your verification code is:</p><h2>${code}</h2>`,
    });

    console.log('[Send Code] ✅ Sent and stored code for:', lowerEmail);
    res.json({ success: true });
  } catch (err) {
    console.error('[Send Code] ❌ Unexpected error:', err);
    res.status(500).json({ success: false, error: 'Unexpected error' });
  }
});


app.post('/verify-code', async (req, res) => {
  const { email, code, installId } = req.body;
  if (!email || !code) {
    return res.status(400).json({ success: false, error: 'Missing email or code' });
  }

  const lowerEmail = email.toLowerCase();

  try {
    // Step 1: Validate verification code
    const verificationResult = await pool.query(
      `SELECT code, expires FROM verifications
       WHERE email = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [lowerEmail]
    );

    if (verificationResult.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'Code not found' });
    }

    const verification = verificationResult.rows[0];
    const isExpired = new Date() > new Date(verification.expires);
    if (verification.code !== code || isExpired) {
      return res.status(401).json({ success: false, error: 'Invalid or expired code' });
    }

    console.log(`[Verify Code] 🔑 Code matched for ${lowerEmail}`);

    // Step 2: Skip syncing, handled by UptimeRobot

    // Step 3: Get member info from database
    const memberResult = await pool.query(
      `SELECT tier, renewal_date, member_id, nickname FROM members WHERE email = $1`,
      [lowerEmail]
    );

    if (memberResult.rows.length > 0) {
      const syncedMember = memberResult.rows[0];

      // Track install ID (logs all installs without duplicate checking)
      if (installId) {
        try {
          await pool.query(
            `INSERT INTO member_installs (email, install_id) VALUES ($1, $2)`,
            [lowerEmail, installId]
          );
        } catch (err) {
          console.warn('[Verify Code] ⚠️ Could not insert install_id:', err.message);
        }
      }

      console.log('[Verify Code] ✅ Returning verified member info:', {
        email: lowerEmail,
        level: syncedMember.tier,
        renewDate: syncedMember.renewal_date,
        memberId: syncedMember.member_id,
        memberNickname: syncedMember.nickname,
      });

      return res.json({
        success: true,
        email: lowerEmail,
        level: syncedMember.tier,
        renewDate: syncedMember.renewal_date,
        memberId: syncedMember.member_id ?? null,
        memberNickname: syncedMember.nickname ?? null,
      });
    }

    // Step 4: Fallback insert as Free Member
    const freeTier = 'Free';
    const fallbackRenewDate = new Date();
    fallbackRenewDate.setFullYear(fallbackRenewDate.getFullYear() + 1);

    await pool.query(
      `INSERT INTO members (email, tier, active, renewal_date)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email)
       DO UPDATE SET
         tier = EXCLUDED.tier,
         active = EXCLUDED.active,
         renewal_date = EXCLUDED.renewal_date`,
      [lowerEmail, freeTier, true, null]
    );

    if (installId) {
      try {
        await pool.query(
          `INSERT INTO member_installs (email, install_id) VALUES ($1, $2)`,
          [lowerEmail, installId]
        );
      } catch (err) {
        console.warn('[Verify Code] ⚠️ Could not insert install_id:', err.message);
      }
    }

    return res.json({
      success: true,
      email: lowerEmail,
      level: freeTier,
      renewDate: fallbackRenewDate.toISOString().split('T')[0],
      memberId: null,
      memberNickname: null,
    });
  } catch (err) {
    console.error('[Verify Code] ❌ Database error:', err);
    return res.status(500).json({ success: false, error: 'Database error' });
  }
});





app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

app.get('/sync-members', async (req, res) => {
  try {
    await getAndSyncMembers();
    res.status(200).send('Members synced successfully.');
  } catch (error) {
    console.error('Error syncing members:', error);
    res.status(500).send('Error syncing members.');
  }
});



app.post('/api/verify-membership', async (req, res) => {
  const { memberId } = req.body;
  if (!memberId) return res.status(400).json({ success: false, error: 'Missing memberId' });

  try {
    const authHeader = 'Basic ' + Buffer.from(`${process.env.FOURTHWALL_API_USER}:${process.env.FOURTHWALL_API_PASS}`).toString('base64');
    const url = `https://api.fourthwall.com/open-api/v1.0/memberships/members/${memberId}`;
    const fwRes = await fetch(url, {
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json'
      }
    });

    if (!fwRes.ok) {
      return res.status(500).json({ success: false, error: `Fourthwall error: ${fwRes.status}` });
    }

    const member = await fwRes.json();

    const tierId = member.subscription?.variant?.tierId ?? 'unknown';
    const tier = tierMap[tierId] ?? 'Free';
    const isActive = ['ACTIVE', 'SUSPENDED'].includes(member.subscription?.type);

        // ✅ Add debug log here
        console.log(`[Verify Membership] ✅ Verified member:
      ID: ${member.id}
      Name: ${member.nickname}
      Email: ${member.email}
      Tier: ${tier}
      Active: ${isActive}`);

    return res.json({
      success: true,
      active: isActive,
      tier,
      nickname: member.nickname ?? null
    });
  } catch (err) {
    console.error('[Verify Membership] ❌', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});
