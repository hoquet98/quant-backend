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


app.post('/webhook/fourthwall', async (req, res) => {
  const { type, data } = req.body;
  const email = data?.customer?.email?.toLowerCase();
  console.log('[Webhook] 🔍 Full payload:', JSON.stringify(req.body, null, 2));

  if (!email) return res.sendStatus(400);

  try {
    if (['membership.created', 'membership.updated'].includes(type)) {
      const { error } = await supabase
        .from('members')
        .upsert({
          email,
          tier: data.tier?.name || '',
          active: data.active ?? true
        }, { onConflict: 'email' });

      if (error) throw error;

      console.log(`✅ Supabase: stored ${email} (${data.tier?.name})`);
    }

    if (type === 'membership.cancelled') {
      const { error } = await supabase
        .from('members')
        .update({ active: false })
        .eq('email', email);

      if (error) throw error;

      console.log(`❌ Supabase: cancelled ${email}`);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('❌ Supabase error:', err.message);
    res.sendStatus(500);
  }
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

  const codes = global.codes || {};
  const record = codes[email.toLowerCase()];

  if (!record) {
    return res.status(400).json({ success: false, error: 'No code found for this email' });
  }

  if (Date.now() > record.expires) {
    delete codes[email.toLowerCase()];
    return res.status(400).json({ success: false, error: 'Code has expired' });
  }

  if (record.code !== code) {
    return res.status(400).json({ success: false, error: 'Invalid code' });
  }

  // ✅ Lookup membership info from Supabase
  try {
    const { data: member, error } = await supabase
      .from('members')
      .select('tier, renew_date')
      .eq('email', email.toLowerCase())
      .single();

    if (error || !member) {
      console.error('[Verify Code] ❌ Supabase error:', error);
      return res.status(200).json({ success: true, email, tier: 'Pro', renew_date: 'Unknown' }); // fallback
    }

    console.log(`[Verify Code] ✅ Verified ${email} — Tier: ${member.tier}, Renew: ${member.renew_date}`);

    return res.json({
      success: true,
      email,
      tier: member.tier,
      renew_date: member.renew_date,
    });
  } catch (err) {
    console.error('[Verify Code] ❌ Error fetching membership:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

