import { Router } from 'express';

import { authRequired } from '../middleware/auth.js';
import { ResetOtp } from '../models/ResetOtp.js';
import { User } from '../models/User.js';
import { sendResetOtpEmail } from '../services/mailService.js';
import { comparePassword, generateOtp, hashPassword, serializeUser, signToken } from '../utils/auth.js';
import { applyLoginProgression } from '../utils/progression.js';

const router = Router();

router.post('/register', async (req, res) => {
  const { name, email, password } = req.body as {
    name?: string;
    email?: string;
    password?: string;
  };

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Vui lòng nhập đầy đủ họ tên, email và mật khẩu.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ message: 'Mật khẩu cần có ít nhất 6 ký tự.' });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    return res.status(409).json({ message: 'Email đã được sử dụng.' });
  }

  const user = new User({
    name: name.trim(),
    email: normalizedEmail,
    passwordHash: await hashPassword(password),
    role: 'user'
  });

  applyLoginProgression(user);
  await user.save();

  return res.status(201).json({
    message: 'Đăng ký thành công.',
    token: signToken(user),
    user: serializeUser(user)
  });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    return res.status(400).json({ message: 'Vui lòng nhập email và mật khẩu.' });
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user || !(await comparePassword(password, user.passwordHash))) {
    return res.status(401).json({ message: 'Email hoặc mật khẩu không đúng.' });
  }

  if (user.isDisabled) {
    return res.status(403).json({
      message: user.disabledReason
        ? `Tài khoản của bạn đang bị vô hiệu hóa. Lý do: ${user.disabledReason}`
        : 'Tài khoản của bạn đang bị vô hiệu hóa. Vui lòng liên hệ quản trị viên.'
    });
  }

  applyLoginProgression(user);
  await user.save();

  return res.json({
    message: 'Đăng nhập thành công.',
    token: signToken(user),
    user: serializeUser(user)
  });
});

router.get('/me', authRequired, async (req, res) => {
  return res.json({ user: serializeUser(req.user!) });
});

router.post('/forgot-password/request', async (req, res) => {
  const { email } = req.body as { email?: string };
  if (!email) {
    return res.status(400).json({ message: 'Vui lòng nhập email.' });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail });

  if (!user || user.isDisabled) {
    return res.json({ message: 'Nếu email tồn tại, mã xác thực đã được gửi.' });
  }

  const code = generateOtp();
  await ResetOtp.deleteMany({ email: normalizedEmail });
  await ResetOtp.create({
    email: normalizedEmail,
    code,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000)
  });

  const delivery = await sendResetOtpEmail(normalizedEmail, code);

  return res.json({
    message: delivery.mode === 'smtp' ? 'Mã xác thực đã được gửi qua email.' : 'Mã xác thực đã được tạo.',
    deliveryMode: delivery.mode,
    debugCode: delivery.mode === 'console' ? code : undefined
  });
});

router.post('/forgot-password/verify', async (req, res) => {
  const { email, code } = req.body as { email?: string; code?: string };
  if (!email || !code) {
    return res.status(400).json({ message: 'Vui lòng nhập email và mã OTP.' });
  }

  const record = await ResetOtp.findOne({
    email: email.toLowerCase().trim(),
    code: code.trim(),
    expiresAt: { $gt: new Date() }
  });

  if (!record) {
    return res.status(400).json({ message: 'Mã OTP không đúng hoặc đã hết hạn.' });
  }

  return res.json({ message: 'OTP hợp lệ.' });
});

router.post('/forgot-password/reset', async (req, res) => {
  const { email, code, newPassword } = req.body as {
    email?: string;
    code?: string;
    newPassword?: string;
  };

  if (!email || !code || !newPassword) {
    return res.status(400).json({ message: 'Vui lòng nhập đầy đủ thông tin.' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ message: 'Mật khẩu mới cần ít nhất 6 ký tự.' });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const record = await ResetOtp.findOne({
    email: normalizedEmail,
    code: code.trim(),
    expiresAt: { $gt: new Date() }
  });

  if (!record) {
    return res.status(400).json({ message: 'Mã OTP không đúng hoặc đã hết hạn.' });
  }

  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    return res.status(404).json({ message: 'Tài khoản không tồn tại.' });
  }

  if (user.isDisabled) {
    return res.status(403).json({ message: 'Tài khoản này đang bị vô hiệu hóa, không thể đặt lại mật khẩu.' });
  }

  user.passwordHash = await hashPassword(newPassword);
  await user.save();
  await ResetOtp.deleteMany({ email: normalizedEmail });

  return res.json({ message: 'Đặt lại mật khẩu thành công.' });
});

export default router;
