import { Router } from 'express';

import { authRequired } from '../middleware/auth.js';
import { CourseAccessRequest } from '../models/CourseAccessRequest.js';
import { Course, type CourseCategory } from '../models/Course.js';
import { buildYouTubeEmbedUrl } from '../utils/courses.js';

const router = Router();

const normalizeCategory = (value: unknown): CourseCategory | 'all' => {
  if (value === 'presentation' || value === 'interview' || value === 'cv') {
    return value;
  }

  return 'all';
};

const mapCourseSummary = (
  course: any,
  accessRequest?: any,
  options?: {
    isAdmin?: boolean;
  }
) => {
  const isAdmin = options?.isAdmin ?? false;
  const accessStatus = isAdmin ? 'approved' : accessRequest?.status ?? 'none';
  const canView = isAdmin || accessStatus === 'approved';

  return {
    id: course._id.toString(),
    title: course.title,
    category: course.category,
    summary: course.summary,
    description: course.description,
    thumbnailUrl: course.thumbnailUrl,
    level: course.level,
    estimatedDuration: course.estimatedDuration,
    lessonsCount: course.lessons.length,
    isPublished: course.isPublished,
    accessStatus,
    canView,
    canRequest: !isAdmin && accessStatus !== 'approved' && accessStatus !== 'pending',
    requestedAt: accessRequest?.requestedAt ?? null,
    reviewedAt: accessRequest?.reviewedAt ?? null,
    adminNote: accessRequest?.adminNote ?? ''
  };
};

router.get('/', authRequired, async (req, res) => {
  const user = req.user!;
  const isAdmin = user.role === 'admin';
  const category = normalizeCategory(req.query.category);

  const courseFilter: Record<string, unknown> = isAdmin ? {} : { isPublished: true };
  if (category !== 'all') {
    courseFilter.category = category;
  }

  const courses = await Course.find(courseFilter).sort({ createdAt: -1 });

  if (courses.length === 0) {
    return res.json({ courses: [] });
  }

  let requestMap = new Map<string, any>();
  if (!isAdmin) {
    const requests = await CourseAccessRequest.find({
      userId: user._id,
      courseId: { $in: courses.map((course) => course._id) }
    });

    requestMap = new Map(requests.map((item) => [item.courseId.toString(), item]));
  }

  return res.json({
    courses: courses.map((course) => mapCourseSummary(course, requestMap.get(course._id.toString()), { isAdmin }))
  });
});

router.get('/:courseId', authRequired, async (req, res) => {
  const user = req.user!;
  const isAdmin = user.role === 'admin';

  const course = await Course.findById(req.params.courseId);
  if (!course || (!course.isPublished && !isAdmin)) {
    return res.status(404).json({ message: 'Không tìm thấy khóa học.' });
  }

  const accessRequest = isAdmin
    ? null
    : await CourseAccessRequest.findOne({
        courseId: course._id,
        userId: user._id
      });

  const accessStatus = isAdmin ? 'approved' : accessRequest?.status ?? 'none';
  const canView = isAdmin || accessStatus === 'approved';

  return res.json({
    course: {
      ...mapCourseSummary(course, accessRequest, { isAdmin }),
      lessons: course.lessons
        .slice()
        .sort((left, right) => left.order - right.order)
        .map((lesson) => ({
          title: lesson.title,
          description: lesson.description,
          durationLabel: lesson.durationLabel,
          order: lesson.order,
          youtubeVideoId: canView ? lesson.youtubeVideoId : '',
          youtubeUrl: canView ? lesson.youtubeUrl : '',
          embedUrl: canView ? buildYouTubeEmbedUrl(lesson.youtubeVideoId) : ''
        }))
    }
  });
});

router.post('/:courseId/request-access', authRequired, async (req, res) => {
  const user = req.user!;
  if (user.role === 'admin') {
    return res.status(400).json({ message: 'Tài khoản quản trị không cần gửi yêu cầu học.' });
  }

  const course = await Course.findOne({ _id: req.params.courseId, isPublished: true });
  if (!course) {
    return res.status(404).json({ message: 'Không tìm thấy khóa học để gửi yêu cầu.' });
  }

  const existingRequest = await CourseAccessRequest.findOne({
    courseId: course._id,
    userId: user._id
  });

  if (existingRequest?.status === 'approved') {
    return res.status(409).json({ message: 'Bạn đã được duyệt vào khóa học này.' });
  }

  if (existingRequest?.status === 'pending') {
    return res.status(200).json({
      message: 'Yêu cầu của bạn đang chờ quản trị viên phê duyệt.',
      request: {
        id: existingRequest._id.toString(),
        status: existingRequest.status,
        requestedAt: existingRequest.requestedAt,
        reviewedAt: existingRequest.reviewedAt,
        adminNote: existingRequest.adminNote
      }
    });
  }

  const request = existingRequest
    ? await CourseAccessRequest.findByIdAndUpdate(
        existingRequest._id,
        {
          status: 'pending',
          requestedAt: new Date(),
          reviewedAt: null,
          reviewerId: null,
          adminNote: ''
        },
        { new: true }
      )
    : await CourseAccessRequest.create({
        courseId: course._id,
        userId: user._id,
        status: 'pending'
      });

  return res.status(201).json({
    message: 'Đã gửi yêu cầu học tới quản trị viên.',
    request: {
      id: request!._id.toString(),
      status: request!.status,
      requestedAt: request!.requestedAt,
      reviewedAt: request!.reviewedAt,
      adminNote: request!.adminNote
    }
  });
});

export default router;
