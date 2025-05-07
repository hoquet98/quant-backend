import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import supabase from './supabaseClient.js';
import { sendVerificationEmail } from './sendVerificationEmail.js';

const MEMBERS_FILE = path.resolve('members.json');

function loadMembers() {
  if (!fs.existsSync(MEMBERS_FILE)) return {};
  return JSON.parse(fs.readFileSync(MEMBERS_FILE, 'utf-8'));
}

function saveMembers(data) {
  fs.writeFileSync(MEMBERS_FILE, JSON.stringify(data, null, 2));
}

dotenv.config();

const app = express();
const port = process.env.PORT || 8080;

app.use(cors());
app.use(bodyParser.json());

// Test route
app.get('/', (req, res) => {
  res.send('Quant backend is running!');
});

// Placeholder: Webhook, login, etc. will go here

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});






app.get('/check-membership', async (req, res) => {
  const email = req.query.email?.toLowerCase();

  if (!email) return res.status(400).json({ error: 'Missing email parameter' });
  app.post('/webhook/fourthwall', async (req, res) => {
    const payload = req.body;
    console.log('[Webhook] 🔍 Full payload:', JSON.stringify(payload, null, 2));
  
    const email = payload?.data?.email?.toLowerCase();
    const tierId = payload?.data?.subscription?.variant?.tierId || 'unknown';
    const interval = payload?.data?.subscription?.variant?.interval || 'MONTHLY';
    const isActive = payload?.data?.subscription?.type === 'ACTIVE';
  
    // Approximate renewal date
    const renewDate = new Date();
    if (interval === 'MONTHLY') renewDate.setMonth(renewDate.getMonth() + 1);
    if (interval === 'YEARLY') renewDate.setFullYear(renewDate.getFullYear() + 1);
    const formattedRenewDate = renewDate.toISOString().split('T')[0];
  
    if (!email) return res.status(400).send('Missing email');
  
    const { error } = await supabase.from('members').upsert(
      {
        email,
        tier: tierId, // optionally map this to "Pro" / "Elite"
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

app.post('/send-code', async (req, res) => {
  const { email } = req.body;
  console.log('[Send Code] ✉️ Requested for:', email);

  if (!email || !email.includes('@')) {
    console.log('[Send Code] ❌ Invalid email input:', email);
    return res.status(400).json({ success: false, error: 'Invalid email' });
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();

  try {
    const result = await sendVerificationEmail(email, code);
    if (!result.success) throw new Error(result.error);

    if (!global.codes) global.codes = {};
    global.codes[email.toLowerCase()] = {
      code,
      expires: Date.now() + 15 * 60 * 1000,
    };

    console.log('[Send Code] ✅ Sent code to:', email);
    res.json({ success: true });
  } catch (err) {
    console.error('[Send Code] ❌ Server error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/verify-code', async (req, res) => {
  const { email, code } = req.body;

  if (!email || !code) {
    return res.status(400).json({ success: false, error: 'Missing email or code' });
  }

  const expected = verificationCodes[email];
  if (!expected || expected.code !== code || Date.now() > expected.expiresAt) {
    return res.status(401).json({ success: false, error: 'Invalid or expired code' });
  }

  console.log(`[Verify Code] 🔑 Verifying code for ${email}`);

  // Try to fetch from Supabase first
  const { data: member, error } = await supabase
    .from('members')
    .select('tier, active, created_at')
    .eq('email', email)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('[Verify Code] ❌ Supabase error:', error);
    return res.status(500).json({ success: false, error: 'Supabase error' });
  }

  if (member) {
    const renewDate = new Date(member.created_at);
    renewDate.setMonth(renewDate.getMonth() + 1); // Assuming 1 month membership for now

    return res.json({
      success: true,
      email,
      level: member.tier,
      renewDate: renewDate.toISOString().split('T')[0],
    });
  }

  // Fallback to Fourthwall API
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
    const tier = customer.subscription?.variant?.tierName ?? 'Pro';
    const interval = customer.subscription?.variant?.interval ?? 'MONTHLY';
    const createdAt = new Date(customer.subscription?.createdAt ?? Date.now());

    let renewDate = new Date(createdAt);
    if (interval === 'MONTHLY') renewDate.setMonth(renewDate.getMonth() + 1);
    else if (interval === 'YEARLY') renewDate.setFullYear(renewDate.getFullYear() + 1);

    // Optionally insert to Supabase
    await supabase.from('members').insert([
      {
        email,
        tier,
        active: true,
        created_at: new Date().toISOString(),
      },
    ]);

    return res.json({
      success: true,
      email,
      level: tier,
      renewDate: renewDate.toISOString().split('T')[0],
    });
  } catch (err) {
    console.error('[Verify Code] ❌ Fourthwall fetch failed:', err);
    return res.status(500).json({ success: false, error: 'Failed to query Fourthwall API' });
  }
});



