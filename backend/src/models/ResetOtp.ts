import { model, Schema } from 'mongoose';

const resetOtpSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    code: { type: String, required: true },
    expiresAt: { type: Date, required: true, expires: 0 },
    attempts: { type: Number, default: 0 }
  },
  {
    timestamps: true
  }
);

export const ResetOtp = model('ResetOtp', resetOtpSchema);
