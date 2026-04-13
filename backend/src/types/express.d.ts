import type { UserDocument } from '../utils/auth.js';

declare global {
  namespace Express {
    interface Request {
      user?: UserDocument;
    }
  }
}

export {};
