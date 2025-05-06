import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';

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
  const event = req.body;

  console.log('🔔 Webhook received from Fourthwall:', event?.type);
  
  if (!event || !event.type || !event.data) {
    return res.status(400).send('Invalid webhook payload');
  }

  // Handle membership events
  const { type, data } = event;

  switch (type) {
    case 'membership.created':
    case 'membership.updated':
      console.log(`✅ Membership active: ${data.customer.email} (${data.tier?.name})`);
      // TODO: Save or update membership in your DB
      break;

    case 'membership.cancelled':
      console.log(`❌ Membership cancelled: ${data.customer.email}`);
      // TODO: Remove/flag access in your DB
      break;

    default:
      console.log(`ℹ️ Unhandled event type: ${type}`);
  }

  res.sendStatus(200);
});
