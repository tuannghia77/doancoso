import {
  BookOpen,
  Briefcase,
  Clock3,
  Filter,
  Layers3,
  PlayCircle,
  Presentation,
  Send,
  ShieldCheck
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import type { CourseCategory, CourseDetail, CourseSummary } from '../types';

const formatDate = (value?: string | null) => {
  if (!value) {
    return '';
  }

  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
};

const accessLabelMap: Record<CourseSummary['accessStatus'], string> = {
  none: 'Chưa gửi yêu cầu',
  pending: 'Đang chờ duyệt',
  approved: 'Đã được duyệt',
  rejected: 'Đã bị từ chối'
};

const categoryMeta: Record<
  'all' | CourseCategory,
  { label: string; icon: typeof Filter; description: string; theme: string }
> = {
  all: {
    label: 'Tất cả',
    icon: Filter,
    description: 'Toàn bộ khóa học đang phát hành cho học viên',
    theme: 'all'
  },
  presentation: {
    label: 'Thuyết trình',
    icon: Presentation,
    description: 'Bố cục bài nói, giọng nói, phong thái và khả năng làm chủ sân khấu',
    theme: 'presentation'
  },
  interview: {
    label: 'Phỏng vấn',
    icon: Briefcase,
    description: 'Rèn câu trả lời, phản biện và xử lý tình huống tuyển dụng thực tế',
    theme: 'interview'
  },
  cv: {
    label: 'CV',
    icon: BookOpen,
    description: 'Tối ưu hồ sơ, kể dự án và luyện trả lời bám sát nội dung CV',
    theme: 'cv'
  }
};

export function CoursesPage() {
  const { user } = useAuth();
  const [allCourses, setAllCourses] = useState<CourseSummary[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [courseDetail, setCourseDetail] = useState<CourseDetail | null>(null);
  const [activeLessonOrder, setActiveLessonOrder] = useState(1);
  const [activeCategory, setActiveCategory] = useState<'all' | CourseCategory>('all');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadCourses = async (preferredCourseId?: string) => {
    setLoading(true);
    setError('');

    try {
      const response = await api.get('/courses');
      const nextCourses = response.data.courses as CourseSummary[];
      setAllCourses(nextCourses);

      const nextSelectedId =
        preferredCourseId && nextCourses.some((item) => item.id === preferredCourseId)
          ? preferredCourseId
          : nextCourses[0]?.id ?? '';

      setSelectedCourseId(nextSelectedId);
    } catch (loadError: any) {
      setError(loadError.response?.data?.message ?? 'Không thể tải thư viện khóa học.');
    } finally {
      setLoading(false);
    }
  };

  const filteredCourses = useMemo(() => {
    if (activeCategory === 'all') {
      return allCourses;
    }

    return allCourses.filter((course) => course.category === activeCategory);
  }, [activeCategory, allCourses]);

  const selectedCourse = useMemo(
    () => filteredCourses.find((item) => item.id === selectedCourseId) ?? null,
    [filteredCourses, selectedCourseId]
  );

  const loadCourseDetail = async (courseId: string) => {
    if (!courseId) {
      setCourseDetail(null);
      return;
    }

    setDetailLoading(true);
    setError('');

    try {
      const response = await api.get(`/courses/${courseId}`);
      const detail = response.data.course as CourseDetail;
      setCourseDetail(detail);
      setActiveLessonOrder((current) =>
        detail.lessons.some((lesson) => lesson.order === current) ? current : detail.lessons[0]?.order ?? 1
      );
    } catch (loadError: any) {
      setError(loadError.response?.data?.message ?? 'Không thể tải chi tiết khóa học.');
      setCourseDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    void loadCourses();
  }, []);

  useEffect(() => {
    if (selectedCourseId && filteredCourses.some((course) => course.id === selectedCourseId)) {
      return;
    }

    setSelectedCourseId(filteredCourses[0]?.id ?? '');
  }, [filteredCourses, selectedCourseId]);

  useEffect(() => {
    void loadCourseDetail(selectedCourseId);
  }, [selectedCourseId]);

  const activeLesson =
    courseDetail?.lessons.find((lesson) => lesson.order === activeLessonOrder) ?? courseDetail?.lessons[0] ?? null;

  const handleRequestAccess = async () => {
    if (!selectedCourse) {
      return;
    }

    setRequesting(true);
    setError('');
    setMessage('');

    try {
      const response = await api.post(`/courses/${selectedCourse.id}/request-access`);
      setMessage(response.data.message);
      await loadCourses(selectedCourse.id);
      await loadCourseDetail(selectedCourse.id);
    } catch (requestError: any) {
      setError(requestError.response?.data?.message ?? 'Không thể gửi yêu cầu học lúc này.');
    } finally {
      setRequesting(false);
    }
  };

  const categoryCards = (Object.keys(categoryMeta) as Array<'all' | CourseCategory>).map((key) => ({
    key,
    ...categoryMeta[key],
    count: key === 'all' ? allCourses.length : allCourses.filter((course) => course.category === key).length
  }));

  if (loading) {
    return <div className="panel-card">Đang tải thư viện khóa học...</div>;
  }

  return (
    <div className="page-stack course-page course-page-upgraded">
      {message ? <p className="success-text">{message}</p> : null}
      {error ? <p className="error-text">{error}</p> : null}

      <section className="panel-card course-hero-card">
        <div className="course-hero-copy">
          <p className="eyebrow">Thư viện khóa học</p>
          <h3>Học theo danh mục, gửi yêu cầu và mở video ngay trên web</h3>
          <p>
            Mỗi khóa học được quản trị viên phát hành theo từng nhóm nội dung để bạn chọn đúng lộ trình cần học:
            thuyết trình, phỏng vấn hoặc CV.
          </p>
        </div>

        <div className="course-hero-stats">
          <div className="course-hero-stat">
            <span>Khóa học đang mở</span>
            <strong>{allCourses.length}</strong>
          </div>
          <div className="course-hero-stat">
            <span>Đã được duyệt</span>
            <strong>{allCourses.filter((course) => course.accessStatus === 'approved').length}</strong>
          </div>
          <div className="course-hero-stat">
            <span>Đang chờ duyệt</span>
            <strong>{allCourses.filter((course) => course.accessStatus === 'pending').length}</strong>
          </div>
        </div>
      </section>

      <section className="course-category-strip">
        {categoryCards.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              type="button"
              className={`course-category-card theme-${item.theme}${activeCategory === item.key ? ' active' : ''}`}
              onClick={() => setActiveCategory(item.key)}
            >
              <div className="course-category-icon">
                <Icon size={18} />
              </div>
              <div>
                <strong>{item.label}</strong>
                <p>{item.description}</p>
              </div>
              <span>{item.count}</span>
            </button>
          );
        })}
      </section>

      <section className="course-shell-grid">
        <article className="panel-card course-catalog-card">
          <div className="section-heading compact-heading">
            <div>
              <p className="eyebrow">Danh sách khóa học</p>
              <h3>{categoryMeta[activeCategory].label}</h3>
            </div>
            <span className="badge-soft">
              <Layers3 size={14} />
              {filteredCourses.length} khóa học
            </span>
          </div>

          <div className="course-catalog-list">
            {filteredCourses.length ? (
              filteredCourses.map((course) => (
                <button
                  key={course.id}
                  type="button"
                  className={`course-list-item theme-${course.category}${course.id === selectedCourseId ? ' active' : ''}`}
                  onClick={() => setSelectedCourseId(course.id)}
                >
                  <div className="course-list-thumb">
                    {course.thumbnailUrl ? <img src={course.thumbnailUrl} alt={course.title} /> : <BookOpen size={24} />}
                  </div>

                  <div className="course-list-body">
                    <div className="course-list-header">
                      <span className={`course-category-badge theme-${course.category}`}>
                        {categoryMeta[course.category].label}
                      </span>
                      <span className="course-list-lessons">{course.lessonsCount} bài</span>
                    </div>

                    <strong>{course.title}</strong>
                    <p>{course.summary}</p>

                    <div className="course-list-meta">
                      <span>{course.level}</span>
                      <span>{course.estimatedDuration || 'Tự học linh hoạt'}</span>
                    </div>
                  </div>

                  <span
                    className={`status-badge ${
                      course.accessStatus === 'approved'
                        ? 'success'
                        : course.accessStatus === 'pending'
                          ? 'dark'
                          : course.accessStatus === 'rejected'
                            ? 'danger'
                            : ''
                    }`}
                  >
                    {accessLabelMap[course.accessStatus]}
                  </span>
                </button>
              ))
            ) : (
              <p className="muted-text">Chưa có khóa học nào trong danh mục này.</p>
            )}
          </div>
        </article>

        <article className="panel-card course-detail-card">
          {detailLoading ? (
            <p className="muted-text">Đang tải chi tiết khóa học...</p>
          ) : courseDetail ? (
            <>
              <div className="course-detail-head">
                <div>
                  <div className="course-detail-topline">
                    <span className={`course-category-badge theme-${courseDetail.category}`}>
                      {categoryMeta[courseDetail.category].label}
                    </span>
                    <span className="badge-soft">
                      <Clock3 size={14} />
                      {courseDetail.estimatedDuration || 'Tự học linh hoạt'}
                    </span>
                  </div>
                  <h3>{courseDetail.title}</h3>
                  <p className="course-detail-summary">{courseDetail.summary}</p>
                </div>

                <div className="course-detail-badges">
                  <span className="badge-soft">
                    <PlayCircle size={14} />
                    {courseDetail.lessonsCount} bài học
                  </span>
                  <span className="badge-soft">
                    <BookOpen size={14} />
                    {courseDetail.level}
                  </span>
                </div>
              </div>

              <div className="course-detail-description">
                <p>
                  {courseDetail.description ||
                    'Khóa học này được thiết kế để học viên xem bài bản theo từng bài, kết hợp song song với luyện tập AI để cải thiện kết quả thực tế.'}
                </p>
              </div>

              <div className="course-access-banner">
                <div>
                  <strong>{accessLabelMap[courseDetail.accessStatus]}</strong>
                  <p>
                    {courseDetail.canView
                      ? 'Bạn đã được mở quyền học. Hãy chọn bài ở cột bên trái để xem video ngay trên web.'
                      : courseDetail.accessStatus === 'pending'
                        ? 'Yêu cầu của bạn đã được gửi. Quản trị viên sẽ xem xét và phê duyệt trước khi mở video.'
                        : courseDetail.accessStatus === 'rejected'
                          ? `Yêu cầu trước đó đã bị từ chối.${courseDetail.adminNote ? ` Ghi chú: ${courseDetail.adminNote}` : ''}`
                          : 'Bạn có thể gửi yêu cầu học để quản trị viên cấp quyền truy cập khóa học này.'}
                  </p>
                  {courseDetail.reviewedAt ? (
                    <span className="muted-text">Cập nhật lần cuối: {formatDate(courseDetail.reviewedAt)}</span>
                  ) : null}
                </div>

                {!user || (user.role !== 'admin' && courseDetail.canRequest) ? (
                  <button type="button" className="primary-button" onClick={handleRequestAccess} disabled={requesting}>
                    <Send size={16} />
                    {requesting ? 'Đang gửi...' : 'Gửi yêu cầu học'}
                  </button>
                ) : null}

                {user?.role === 'admin' ? (
                  <span className="badge-soft">
                    <ShieldCheck size={14} />
                    Tài khoản quản trị xem trực tiếp
                  </span>
                ) : null}
              </div>

              <div className="course-learning-grid">
                <div className="course-lesson-list">
                  <div className="section-heading compact-heading">
                    <div>
                      <p className="eyebrow">Lộ trình bài học</p>
                      <h3>{courseDetail.canView ? 'Chọn bài để học' : 'Xem trước chương trình'}</h3>
                    </div>
                  </div>

                  {courseDetail.lessons.map((lesson) => (
                    <button
                      key={`${courseDetail.id}-${lesson.order}`}
                      type="button"
                      className={`course-lesson-item${lesson.order === activeLesson?.order ? ' active' : ''}`}
                      onClick={() => setActiveLessonOrder(lesson.order)}
                    >
                      <div>
                        <strong>
                          Bài {lesson.order}: {lesson.title}
                        </strong>
                        <p>{lesson.description || 'Bài học theo video, có thể học lại nhiều lần.'}</p>
                      </div>
                      <span>{lesson.durationLabel || 'Video học'}</span>
                    </button>
                  ))}
                </div>

                <div className="course-player-card">
                  {courseDetail.canView && activeLesson ? (
                    <>
                      <div className="section-heading compact-heading">
                        <div>
                          <p className="eyebrow">Đang xem</p>
                          <h3>{activeLesson.title}</h3>
                        </div>
                        <span className="badge-soft">
                          <PlayCircle size={14} />
                          {activeLesson.durationLabel || 'YouTube'}
                        </span>
                      </div>

                      <div className="course-video-frame">
                        <iframe
                          src={activeLesson.embedUrl}
                          title={activeLesson.title}
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                          referrerPolicy="strict-origin-when-cross-origin"
                          allowFullScreen
                        />
                      </div>

                      <p className="muted-text">
                        {activeLesson.description || 'Nội dung bài học đang được phát trực tiếp từ YouTube.'}
                      </p>
                    </>
                  ) : (
                    <div className="course-player-empty">
                      <ShieldCheck size={36} />
                      <h3>Khóa học đang chờ duyệt</h3>
                      <p>Quản trị viên cần duyệt yêu cầu trước khi hệ thống mở quyền xem video cho bạn.</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <p className="muted-text">Hãy chọn một khóa học để xem chi tiết.</p>
          )}
        </article>
      </section>
    </div>
  );
}
