import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import { Resend } from 'resend';
import pool from './supabaseClient.js';

dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);

const app = express();
const port = process.env.PORT || 8080;

app.use(cors());
app.use(bodyParser.json());

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
