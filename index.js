import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const app = express();
const port = process.env.PORT || 8080;

app.use(cors());
app.use(bodyParser.json());

const MEMBERS_FILE = path.resolve('members.json');
const verificationCodes = {};

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
  const isActive = payload?.data?.subscription?.type === 'ACTIVE';

  const renewDate = new Date();
  if (interval === 'MONTHLY') renewDate.setMonth(renewDate.getMonth() + 1);
  if (interval === 'YEARLY') renewDate.setFullYear(renewDate.getFullYear() + 1);
  const formattedRenewDate = renewDate.toISOString().split('T')[0];

  if (!email) return res.status(400).send('Missing email');

  const { error } = await supabase.from('members').upsert(
    {
      email,
      tier: tierId,
      active: isActive,
      renew_date: formattedRenewDate,
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

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  verificationCodes[email.toLowerCase()] = {
    code,
    expiresAt: Date.now() + 15 * 60 * 1000,
  };

  try {
    await resend.emails.send({
      from: 'Quant Trading <no-reply@quanttradingpro.com>',
      to: [email],
      subject: 'Your Quant Trading Verification Code',
      html: `<p>Your verification code is:</p><h2>${code}</h2>`
    });
    console.log('[Send Code] ✅ Sent code to:', email);
    res.json({ success: true });
  } catch (err) {
    console.error('[Send Code] ❌ Error:', err);
    res.status(500).json({ success: false, error: 'Failed to send code' });
  }
});

app.post('/verify-code', async (req, res) => {
  const { email, code } = req.body;
  const entry = verificationCodes[email.toLowerCase()];

  if (!entry || entry.code !== code || Date.now() > entry.expiresAt) {
    return res.status(401).json({ success: false, error: 'Invalid or expired code' });
  }

  console.log(`[Verify Code] 🔑 Verifying ${email}`);

  const { data: member, error } = await supabase
    .from('members')
    .select('tier, renew_date')
    .eq('email', email)
    .single();

  if (member) {
    return res.json({
      success: true,
      email,
      level: member.tier,
      renewDate: member.renew_date,
    });
  }

  const username = process.env.FOURTHWALL_API_USER;
  const password = process.env.FOURTHWALL_API_PASS;
  const authHeader = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');

  try {
    const fwRes = await fetch(
      `https://api.fourthwall.com/open-api/v1/customers?email=${encodeURIComponent(email)}`,
      {
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
      }
    );

    const fwData = await fwRes.json();
    if (!fwData?.data || fwData.data.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found in Fourthwall' });
    }

    const customer = fwData.data[0];
    const tier = customer.subscription?.variant?.tierName || 'Pro';
    const interval = customer.subscription?.variant?.interval || 'MONTHLY';
    const createdAt = new Date(customer.subscription?.createdAt || Date.now());
    const renewDate = new Date(createdAt);
    if (interval === 'MONTHLY') renewDate.setMonth(renewDate.getMonth() + 1);
    else if (interval === 'YEARLY') renewDate.setFullYear(renewDate.getFullYear() + 1);

    await supabase.from('members').upsert({
      email,
      tier,
      active: true,
      renew_date: renewDate.toISOString().split('T')[0],
    });

    return res.json({
      success: true,
      email,
      level: tier,
      renewDate: renewDate.toISOString().split('T')[0],
    });
  } catch (err) {
    console.error('[Verify Code] ❌ Fourthwall fetch failed:', err);
    return res.status(500).json({ success: false, error: 'Fourthwall API error' });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
