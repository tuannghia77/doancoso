import type { CourseLessonShape } from '../models/Course.js';

const normalizeText = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();

const videoIdPattern = /^[A-Za-z0-9_-]{11}$/;

export const extractYouTubeVideoId = (value: string) => {
  const input = normalizeText(value);
  if (!input) {
    return '';
  }

  if (videoIdPattern.test(input)) {
    return input;
  }

  try {
    const url = new URL(input);
    const host = url.hostname.replace(/^www\./i, '').toLowerCase();

    if (host === 'youtu.be') {
      const candidate = url.pathname.split('/').filter(Boolean)[0] ?? '';
      return videoIdPattern.test(candidate) ? candidate : '';
    }

    if (host.endsWith('youtube.com')) {
      if (url.pathname === '/watch') {
        const candidate = url.searchParams.get('v') ?? '';
        return videoIdPattern.test(candidate) ? candidate : '';
      }

      const [, section, candidate] = url.pathname.split('/');
      if (['embed', 'shorts', 'live'].includes(section) && videoIdPattern.test(candidate ?? '')) {
        return candidate;
      }
    }
  } catch {
    const matched = input.match(/[A-Za-z0-9_-]{11}/);
    return matched?.[0] ?? '';
  }

  return '';
};

export const normalizeYouTubeUrl = (value: string, videoId: string) => {
  const input = normalizeText(value);
  if (input) {
    return input;
  }

  return `https://www.youtube.com/watch?v=${videoId}`;
};

export const buildYouTubeEmbedUrl = (videoId: string) => `https://www.youtube.com/embed/${videoId}`;

export const normalizeCourseLessons = (lessons: unknown): CourseLessonShape[] => {
  if (!Array.isArray(lessons) || lessons.length === 0) {
    throw new Error('Vui lòng thêm ít nhất một bài học cho khóa học.');
  }

  return lessons.map((rawLesson, index) => {
    const lesson = typeof rawLesson === 'object' && rawLesson ? (rawLesson as Record<string, unknown>) : {};
    const title = normalizeText(lesson.title);
    const description = normalizeText(lesson.description);
    const durationLabel = normalizeText(lesson.durationLabel);
    const youtubeInput = normalizeText(lesson.youtubeUrl ?? lesson.youtubeVideoId);
    const youtubeVideoId = extractYouTubeVideoId(youtubeInput);

    if (!title) {
      throw new Error(`Bài học #${index + 1} chưa có tiêu đề.`);
    }

    if (!youtubeVideoId) {
      throw new Error(`Bài học "${title}" chưa có link YouTube hợp lệ.`);
    }

    return {
      title,
      description,
      durationLabel,
      youtubeVideoId,
      youtubeUrl: normalizeYouTubeUrl(youtubeInput, youtubeVideoId),
      order: index + 1
    };
  });
};
