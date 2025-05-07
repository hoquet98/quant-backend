import { Resend } from 'resend';
import dotenv from 'dotenv';
dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendVerificationEmail(email, code) {
  try {
    const response = await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to: email,
      subject: 'Your Quant Trading Verification Code',
      html: `<p>Your verification code is:</p><h2>${code}</h2>`,
    });

    return { success: true, id: response.id };
  } catch (err) {
    console.error('❌ Email send error:', err);
    return { success: false, error: err.message || 'Failed to send email' };
  }
}
