import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

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

app.post('/webhook/fourthwall', (req, res) => {
  const { type, data } = req.body;
  const email = data?.customer?.email?.toLowerCase();

  if (!email) return res.sendStatus(400);

  const members = loadMembers();

  if (['membership.created', 'membership.updated'].includes(type)) {
    members[email] = {
      tier: data.tier?.name || '',
      active: data.active ?? true,
      updated: new Date().toISOString()
    };
    saveMembers(members);
    console.log(`✅ Stored membership: ${email} (${data.tier?.name})`);
  } else if (type === 'membership.cancelled') {
    if (members[email]) {
      members[email].active = false;
      members[email].updated = new Date().toISOString();
      saveMembers(members);
      console.log(`❌ Cancelled membership: ${email}`);
    }
  }

  res.sendStatus(200);
});

