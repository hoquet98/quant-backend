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
