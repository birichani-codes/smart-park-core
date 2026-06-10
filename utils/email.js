const nodemailer = require('nodemailer');

const SMTP_USER = process.env.SMTP_USER || 'birichani.code@gmail.com';
const SMTP_PASS = process.env.SMTP_PASS || 'uvra mwqq bkmc muew';
const SMTP_FROM = process.env.SMTP_FROM || `SmartPark <${SMTP_USER}>`;

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

async function sendEmail({ to, subject, text, html }) {
  const mailOptions = {
    from: SMTP_FROM,
    to,
    subject,
    text,
    html,
  };
  return transporter.sendMail(mailOptions);
}

module.exports = { sendEmail };
