import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import supabase from './supabaseClient.js';

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
