import { model, Schema, type InferSchemaType, type Types } from 'mongoose';

const courseAccessRequestSchema = new Schema(
  {
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    },
    requestedAt: { type: Date, default: Date.now },
    reviewedAt: { type: Date, default: null },
    reviewerId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    adminNote: { type: String, default: '', trim: true }
  },
  {
    timestamps: true
  }
);

courseAccessRequestSchema.index({ courseId: 1, userId: 1 }, { unique: true });

export type CourseAccessRequestShape = InferSchemaType<typeof courseAccessRequestSchema> & { _id: Types.ObjectId };

export const CourseAccessRequest = model('CourseAccessRequest', courseAccessRequestSchema);
