import nodemailer from 'nodemailer';

import { env } from '../config/env.js';

const transporter = env.smtpHost
  ? nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpSecure,
      auth: env.smtpUser
        ? {
            user: env.smtpUser,
            pass: env.smtpPass
          }
        : undefined
    })
  : null;

export const verifyMailTransport = async () => {
  if (!transporter) {
    console.warn('Chưa cấu hình SMTP, hệ thống sẽ dùng chế độ OTP debug/console.');
    return { configured: false as const };
  }

  await transporter.verify();
  console.log('SMTP đã sẵn sàng để gửi email xác thực thật.');
  return { configured: true as const };
};

export const sendResetOtpEmail = async (email: string, code: string) => {
  if (!transporter) {
    console.log(`[SpeakAI OTP] ${email} -> ${code}`);
    return { mode: 'console' as const };
  }

  await transporter.sendMail({
    from: env.mailFrom,
    to: email,
    subject: 'SpeakAI - Mã xác thực đặt lại mật khẩu',
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #132238; max-width: 640px; margin: 0 auto; padding: 24px; background: #f8fbff; border-radius: 20px;">
        <div style="padding: 20px 24px; background: linear-gradient(135deg, #132238 0%, #1cc3d6 100%); border-radius: 18px; color: white;">
          <h2 style="margin: 0; font-size: 28px;">SpeakAI</h2>
          <p style="margin: 8px 0 0; opacity: 0.9;">Xác thực đặt lại mật khẩu</p>
        </div>
        <div style="padding: 24px 8px 8px;">
          <p>Xin chào,</p>
          <p>Bạn vừa yêu cầu đặt lại mật khẩu cho tài khoản SpeakAI. Mã xác thực của bạn là:</p>
          <p style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #0f4c5e; margin: 18px 0;">${code}</p>
          <p>Mã này có hiệu lực trong <strong>10 phút</strong>.</p>
          <p>Nếu bạn không thực hiện yêu cầu này, hãy bỏ qua email.</p>
          <p style="margin-top: 24px; color: #5b6d7d;">Trân trọng,<br/>Đội ngũ SpeakAI</p>
        </div>
      </div>
    `
  });

  return { mode: 'smtp' as const };
};
