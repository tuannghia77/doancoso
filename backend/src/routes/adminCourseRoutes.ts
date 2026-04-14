import { Router } from 'express';

import { adminOnly, authRequired } from '../middleware/auth.js';
import { CourseAccessRequest } from '../models/CourseAccessRequest.js';
import { Course, type CourseCategory } from '../models/Course.js';
import { normalizeCourseLessons } from '../utils/courses.js';

const router = Router();

const normalizeCategory = (value: unknown): CourseCategory => {
  if (value === 'presentation' || value === 'interview' || value === 'cv') {
    return value;
  }

  return 'presentation';
};

const mapCourse = (course: any) => ({
  id: course._id.toString(),
  title: course.title,
  category: course.category,
  summary: course.summary,
  description: course.description,
  thumbnailUrl: course.thumbnailUrl,
  level: course.level,
  estimatedDuration: course.estimatedDuration,
  isPublished: course.isPublished,
  lessonsCount: course.lessons.length,
  lessons: course.lessons
    .slice()
    .sort((left: any, right: any) => left.order - right.order)
    .map((lesson: any) => ({
      title: lesson.title,
      description: lesson.description,
      durationLabel: lesson.durationLabel,
      youtubeUrl: lesson.youtubeUrl,
      youtubeVideoId: lesson.youtubeVideoId,
      order: lesson.order
    })),
  createdAt: course.createdAt
});

router.get('/', authRequired, adminOnly, async (_req, res) => {
  const [courses, requests] = await Promise.all([
    Course.find().sort({ createdAt: -1 }),
    CourseAccessRequest.find()
      .populate('courseId', 'title category')
      .populate('userId', 'name email targetRole')
      .populate('reviewerId', 'name email')
      .sort({ requestedAt: -1 })
      .limit(200)
  ]);

  return res.json({
    courses: courses.map(mapCourse),
    requests: requests.map((request: any) => ({
      id: request._id.toString(),
      status: request.status,
      requestedAt: request.requestedAt,
      reviewedAt: request.reviewedAt,
      adminNote: request.adminNote,
      course: request.courseId
        ? {
            id: request.courseId._id.toString(),
            title: request.courseId.title,
            category: request.courseId.category
          }
        : null,
      user: request.userId
        ? {
            id: request.userId._id.toString(),
            name: request.userId.name,
            email: request.userId.email,
            targetRole: request.userId.targetRole
          }
        : null,
      reviewer: request.reviewerId
        ? {
            id: request.reviewerId._id.toString(),
            name: request.reviewerId.name,
            email: request.reviewerId.email
          }
        : null
    }))
  });
});

router.post('/', authRequired, adminOnly, async (req, res) => {
  const actor = req.user!;
  const { title, category, summary, description, thumbnailUrl, level, estimatedDuration, lessons } = req.body as {
    title?: string;
    category?: CourseCategory;
    summary?: string;
    description?: string;
    thumbnailUrl?: string;
    level?: string;
    estimatedDuration?: string;
    lessons?: unknown;
  };

  if (!String(title ?? '').trim() || !String(summary ?? '').trim()) {
    return res.status(400).json({ message: 'Vui lòng nhập tên khóa học và mô tả ngắn.' });
  }

  try {
    const normalizedLessons = normalizeCourseLessons(lessons);
    const course = await Course.create({
      title: String(title).trim(),
      category: normalizeCategory(category),
      summary: String(summary).trim(),
      description: String(description ?? '').trim(),
      thumbnailUrl: String(thumbnailUrl ?? '').trim(),
      level: String(level ?? '').trim() || 'Cơ bản',
      estimatedDuration: String(estimatedDuration ?? '').trim(),
      lessons: normalizedLessons,
      createdByUserId: actor._id,
      createdByEmail: actor.email
    });

    return res.status(201).json({
      message: 'Đã tạo khóa học và phát hành cho học viên.',
      course: {
        id: course._id.toString(),
        title: course.title
      }
    });
  } catch (error) {
    return res.status(400).json({
      message: error instanceof Error ? error.message : 'Không thể tạo khóa học lúc này.'
    });
  }
});

router.patch('/:courseId', authRequired, adminOnly, async (req, res) => {
  const { title, category, summary, description, thumbnailUrl, level, estimatedDuration, lessons, isPublished } = req.body as {
    title?: string;
    category?: CourseCategory;
    summary?: string;
    description?: string;
    thumbnailUrl?: string;
    level?: string;
    estimatedDuration?: string;
    lessons?: unknown;
    isPublished?: boolean;
  };

  const course = await Course.findById(req.params.courseId);
  if (!course) {
    return res.status(404).json({ message: 'Không tìm thấy khóa học cần cập nhật.' });
  }

  if (!String(title ?? '').trim() || !String(summary ?? '').trim()) {
    return res.status(400).json({ message: 'Vui lòng nhập tên khóa học và mô tả ngắn.' });
  }

  try {
    const normalizedLessons = normalizeCourseLessons(lessons);

    course.title = String(title).trim();
    course.category = normalizeCategory(category);
    course.summary = String(summary).trim();
    course.description = String(description ?? '').trim();
    course.thumbnailUrl = String(thumbnailUrl ?? '').trim();
    course.level = String(level ?? '').trim() || 'Cơ bản';
    course.estimatedDuration = String(estimatedDuration ?? '').trim();
    course.lessons = normalizedLessons as any;
    if (typeof isPublished === 'boolean') {
      course.isPublished = isPublished;
    }

    await course.save();

    return res.json({
      message: 'Đã cập nhật khóa học thành công.',
      course: {
        id: course._id.toString(),
        title: course.title
      }
    });
  } catch (error) {
    return res.status(400).json({
      message: error instanceof Error ? error.message : 'Không thể cập nhật khóa học lúc này.'
    });
  }
});

router.delete('/:courseId', authRequired, adminOnly, async (req, res) => {
  const course = await Course.findById(req.params.courseId);
  if (!course) {
    return res.status(404).json({ message: 'Không tìm thấy khóa học để xóa.' });
  }

  await Promise.all([
    CourseAccessRequest.deleteMany({ courseId: course._id }),
    Course.deleteOne({ _id: course._id })
  ]);

  return res.json({
    message: 'Đã xóa khóa học và toàn bộ yêu cầu học liên quan.',
    course: {
      id: course._id.toString(),
      title: course.title
    }
  });
});

router.patch('/requests/:requestId', authRequired, adminOnly, async (req, res) => {
  const actor = req.user!;
  const { status, adminNote } = req.body as {
    status?: 'approved' | 'rejected';
    adminNote?: string;
  };

  if (status !== 'approved' && status !== 'rejected') {
    return res.status(400).json({ message: 'Trạng thái duyệt không hợp lệ.' });
  }

  const request = await CourseAccessRequest.findById(req.params.requestId)
    .populate('courseId', 'title category')
    .populate('userId', 'name email');

  if (!request) {
    return res.status(404).json({ message: 'Không tìm thấy yêu cầu truy cập khóa học.' });
  }

  request.status = status;
  request.adminNote = String(adminNote ?? '').trim();
  request.reviewedAt = new Date();
  request.reviewerId = actor._id;
  await request.save();

  return res.json({
    message: status === 'approved' ? 'Đã duyệt cho học viên vào khóa học.' : 'Đã từ chối yêu cầu học.',
    request: {
      id: request._id.toString(),
      status: request.status,
      reviewedAt: request.reviewedAt,
      adminNote: request.adminNote,
      course: request.courseId
        ? {
            id: (request.courseId as any)._id.toString(),
            title: (request.courseId as any).title,
            category: (request.courseId as any).category
          }
        : null,
      user: request.userId
        ? {
            id: (request.userId as any)._id.toString(),
            name: (request.userId as any).name,
            email: (request.userId as any).email
          }
        : null
    }
  });
});

export default router;
