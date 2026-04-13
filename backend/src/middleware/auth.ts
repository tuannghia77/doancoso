import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';

import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { ensureDailyGoals, ensureWeeklyBucket, refillEnergy } from '../utils/progression.js';

export const authRequired: RequestHandler = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Bạn chưa đăng nhập.' });
    }

    const token = authHeader.replace('Bearer ', '');
    const payload = jwt.verify(token, env.jwtSecret) as { sub?: string };

    if (!payload.sub) {
      return res.status(401).json({ message: 'Token không hợp lệ.' });
    }

    const user = await User.findById(payload.sub);
    if (!user) {
      return res.status(401).json({ message: 'Tài khoản không tồn tại.' });
    }

    if (user.isDisabled) {
      return res.status(403).json({
        message: user.disabledReason
          ? `Tài khoản của bạn đang bị vô hiệu hóa. Lý do: ${user.disabledReason}`
          : 'Tài khoản của bạn đang bị vô hiệu hóa. Vui lòng liên hệ quản trị viên.'
      });
    }

    ensureWeeklyBucket(user);
    refillEnergy(user);
    ensureDailyGoals(user);
    if (user.isModified()) {
      await user.save();
    }

    req.user = user;
    return next();
  } catch (_error) {
    return res.status(401).json({ message: 'Phiên đăng nhập đã hết hạn hoặc không hợp lệ.' });
  }
};

export const adminOnly: RequestHandler = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Bạn không có quyền truy cập khu vực này.' });
  }

  return next();
};
