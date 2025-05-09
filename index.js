import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { getAndSyncMembers } from './getAndSynchMembers.js';

dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

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
    const { data, error } = await supabase
      .from('members')
      .select('tier, active')
      .eq('email', email)
      .single();

    if (error || !data) {
      return res.status(404).json({ active: false, tier: null });
    }

    return res.json({
      active: data.active,
      tier: data.tier
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

  const { error } = await supabase.from('members').upsert(
    {
      email,
      member_id: memberId,
      nickname: nickname,
      tier: tierName,
      active: isActive,
      renewal_date: formattedRenewDate,
    },
    { onConflict: 'email' }
  );

  if (error) {
    console.error('[Webhook] ❌ Supabase error:', error);
    return res.status(500).send('Supabase error');
  }

  res.sendStatus(200);
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
    // Store in Supabase `verification` table
    const { error } = await supabase.from('verifications').insert([
      {
        email: lowerEmail,
        code,
        expires: expires.toISOString(),
        created_at: now.toISOString(),
      },
    ]);

    if (error) {
      console.error('[Send Code] ❌ Supabase insert error:', error);
      return res.status(500).json({ success: false, error: 'Supabase insert failed' });
    }

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

  // Step 1: Validate verification code
  const { data: verification, error: verificationError } = await supabase
    .from('verifications')
    .select('code, expires')
    .eq('email', lowerEmail)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (verificationError || !verification) {
    return res.status(401).json({ success: false, error: 'Code not found' });
  }

  const isExpired = new Date() > new Date(verification.expires);
  if (verification.code !== code || isExpired) {
    return res.status(401).json({ success: false, error: 'Invalid or expired code' });
  }

  console.log(`[Verify Code] 🔑 Code matched for ${lowerEmail}`);

  // Step 2: Sync members from Fourthwall → Supabase
  await getAndSyncMembers();

  // Step 3: Try again to find member in Supabase
  const { data: syncedMember, error: syncedError } = await supabase
    .from('members')
    .select('tier, renewal_date')
    .eq('email', lowerEmail)
    .single();

  if (syncedMember) {
    // Track install ID
    try {
      await supabase.from('member_installs').upsert({
        email: lowerEmail,
        install_id: installId ?? null,
      });
    } catch (err) {
      console.warn('[Verify Code] ⚠️ Could not insert install_id:', err.message);
    }

    return res.json({
      success: true,
      email: lowerEmail,
      level: syncedMember.tier,
      renewDate: syncedMember.renewal_date,
    });
  }

  // Step 4: Fallback insert as Free Member
  const freeTier = 'Free';
  const fallbackRenewDate = new Date();
  fallbackRenewDate.setFullYear(fallbackRenewDate.getFullYear() + 1);

  const { error: insertError } = await supabase.from('members').upsert({
    email: lowerEmail,
    tier: freeTier,
    active: true,
    renewal_date: null,
    install_id: installId ?? null,
  }, { onConflict: 'email' });

  if (insertError) {
    console.error('[Verify Code] ❌ Supabase insert error:', insertError);
  }

  try {
    await supabase.from('member_installs').upsert({
      email: lowerEmail,
      install_id: installId ?? null,
    });
  } catch (err) {
    console.warn('[Verify Code] ⚠️ Could not insert install_id:', err.message);
  }

  return res.json({
    success: true,
    email: lowerEmail,
    level: freeTier,
    renewDate: fallbackRenewDate.toISOString().split('T')[0],
  });
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
