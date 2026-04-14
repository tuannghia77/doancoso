import { model, Schema, type InferSchemaType, type Types } from 'mongoose';

const courseCategoryValues = ['presentation', 'interview', 'cv'] as const;

const courseLessonSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    youtubeUrl: { type: String, required: true, trim: true },
    youtubeVideoId: { type: String, required: true, trim: true },
    durationLabel: { type: String, default: '', trim: true },
    order: { type: Number, default: 0 }
  },
  { _id: false }
);

const courseSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: courseCategoryValues,
      default: 'presentation',
      required: true
    },
    summary: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    thumbnailUrl: { type: String, default: '', trim: true },
    level: { type: String, default: 'Cơ bản', trim: true },
    estimatedDuration: { type: String, default: '', trim: true },
    isPublished: { type: Boolean, default: true },
    lessons: { type: [courseLessonSchema], default: [] },
    createdByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdByEmail: { type: String, required: true, trim: true }
  },
  {
    timestamps: true
  }
);

export type CourseCategory = (typeof courseCategoryValues)[number];
export type CourseLessonShape = InferSchemaType<typeof courseLessonSchema>;
export type CourseShape = InferSchemaType<typeof courseSchema> & { _id: Types.ObjectId };

export const Course = model('Course', courseSchema);
