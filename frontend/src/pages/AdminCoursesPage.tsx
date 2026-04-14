import {
  BookOpen,
  Briefcase,
  CheckCircle2,
  Clock3,
  LayoutPanelTop,
  Pencil,
  Plus,
  Presentation,
  RotateCcw,
  ShieldCheck,
  StickyNote,
  Trash2,
  XCircle
} from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { api } from '../lib/api';
import type { AdminCourseSummary, CourseCategory, CourseRequestRecord } from '../types';

type LessonInput = {
  title: string;
  description: string;
  youtubeUrl: string;
  durationLabel: string;
};

const emptyLesson = (): LessonInput => ({
  title: '',
  description: '',
  youtubeUrl: '',
  durationLabel: ''
});

const createEmptyForm = () => ({
  title: '',
  category: 'presentation' as CourseCategory,
  summary: '',
  description: '',
  thumbnailUrl: '',
  level: 'Cơ bản',
  estimatedDuration: '',
  lessons: [emptyLesson()]
});

const categoryMeta: Record<CourseCategory, { label: string; icon: typeof Presentation; helper: string }> = {
  presentation: {
    label: 'Thuyết trình',
    icon: Presentation,
    helper: 'Nhóm nội dung rèn phong thái, giọng nói, cấu trúc và khả năng trình bày.'
  },
  interview: {
    label: 'Phỏng vấn',
    icon: Briefcase,
    helper: 'Nhóm nội dung luyện trả lời phỏng vấn, phản biện và xử lý tình huống.'
  },
  cv: {
    label: 'CV',
    icon: BookOpen,
    helper: 'Nhóm nội dung tối ưu hồ sơ, kể dự án và bám sát ngữ cảnh từ CV.'
  }
};

const requestStatusLabel: Record<CourseRequestRecord['status'], string> = {
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  rejected: 'Đã từ chối'
};

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

export function AdminCoursesPage() {
  const [courses, setCourses] = useState<AdminCourseSummary[]>([]);
  const [requests, setRequests] = useState<CourseRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [processingRequestId, setProcessingRequestId] = useState('');
  const [deletingCourseId, setDeletingCourseId] = useState('');
  const [editingCourseId, setEditingCourseId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState(createEmptyForm());

  const loadData = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await api.get('/admin/courses');
      setCourses(response.data.courses);
      setRequests(response.data.requests);
    } catch (loadError: any) {
      setError(loadError.response?.data?.message ?? 'Không thể tải khu quản trị khóa học.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const updateLesson = (index: number, key: keyof LessonInput, value: string) => {
    setForm((current) => ({
      ...current,
      lessons: current.lessons.map((lesson, lessonIndex) =>
        lessonIndex === index ? { ...lesson, [key]: value } : lesson
      )
    }));
  };

  const addLesson = () => {
    setForm((current) => ({
      ...current,
      lessons: [...current.lessons, emptyLesson()]
    }));
  };

  const removeLesson = (index: number) => {
    setForm((current) => ({
      ...current,
      lessons: current.lessons.filter((_, lessonIndex) => lessonIndex !== index)
    }));
  };

  const resetForm = () => {
    setEditingCourseId('');
    setForm(createEmptyForm());
  };

  const startEditCourse = (course: AdminCourseSummary) => {
    setEditingCourseId(course.id);
    setError('');
    setMessage('');
    setForm({
      title: course.title,
      category: course.category,
      summary: course.summary,
      description: course.description,
      thumbnailUrl: course.thumbnailUrl,
      level: course.level,
      estimatedDuration: course.estimatedDuration,
      lessons:
        course.lessons.length > 0
          ? course.lessons
              .slice()
              .sort((left, right) => left.order - right.order)
              .map((lesson) => ({
                title: lesson.title,
                description: lesson.description,
                youtubeUrl: lesson.youtubeUrl,
                durationLabel: lesson.durationLabel
              }))
          : [emptyLesson()]
    });
  };

  const handleSubmitCourse = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setMessage('');

    try {
      const response = editingCourseId
        ? await api.patch(`/admin/courses/${editingCourseId}`, form)
        : await api.post('/admin/courses', form);

      setMessage(response.data.message);
      resetForm();
      await loadData();
    } catch (submitError: any) {
      setError(
        submitError.response?.data?.message ??
          (editingCourseId ? 'Không thể cập nhật khóa học lúc này.' : 'Không thể tạo khóa học lúc này.')
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteCourse = async (course: AdminCourseSummary) => {
    const confirmed = window.confirm(
      `Bạn có chắc muốn xóa khóa học "${course.title}" không? Toàn bộ yêu cầu học liên quan cũng sẽ bị xóa.`
    );

    if (!confirmed) {
      return;
    }

    setDeletingCourseId(course.id);
    setError('');
    setMessage('');

    try {
      const response = await api.delete(`/admin/courses/${course.id}`);
      setMessage(response.data.message);

      if (editingCourseId === course.id) {
        resetForm();
      }

      await loadData();
    } catch (deleteError: any) {
      setError(deleteError.response?.data?.message ?? 'Không thể xóa khóa học lúc này.');
    } finally {
      setDeletingCourseId('');
    }
  };

  const handleReviewRequest = async (request: CourseRequestRecord, status: 'approved' | 'rejected') => {
    const adminNote =
      status === 'rejected'
        ? window.prompt('Nhập ghi chú từ chối để học viên biết cần bổ sung gì:', request.adminNote || '') ?? ''
        : window.prompt('Ghi chú cho học viên (không bắt buộc):', request.adminNote || '') ?? '';

    setProcessingRequestId(request.id);
    setError('');
    setMessage('');

    try {
      const response = await api.patch(`/admin/courses/requests/${request.id}`, {
        status,
        adminNote
      });
      setMessage(response.data.message);
      await loadData();
    } catch (reviewError: any) {
      setError(reviewError.response?.data?.message ?? 'Không thể cập nhật yêu cầu học.');
    } finally {
      setProcessingRequestId('');
    }
  };

  const pendingCount = requests.filter((item) => item.status === 'pending').length;
  const approvedCount = requests.filter((item) => item.status === 'approved').length;
  const rejectedCount = requests.filter((item) => item.status === 'rejected').length;
  const categoryCounts = useMemo(
    () => ({
      presentation: courses.filter((course) => course.category === 'presentation').length,
      interview: courses.filter((course) => course.category === 'interview').length,
      cv: courses.filter((course) => course.category === 'cv').length
    }),
    [courses]
  );

  if (loading) {
    return <div className="panel-card">Đang tải quản trị khóa học...</div>;
  }

  return (
    <div className="page-stack admin-courses-page admin-courses-page-upgraded">
      {message ? <p className="success-text">{message}</p> : null}
      {error ? <p className="error-text">{error}</p> : null}

      <section className="panel-card admin-course-hero">
        <div className="admin-course-hero-copy">
          <p className="eyebrow">Quản trị khóa học</p>
          <h3>Tạo, chỉnh sửa, xóa khóa học và duyệt học viên trong cùng một nơi</h3>
          <p>
            Admin có thể quản lý toàn bộ thư viện khóa học theo danh mục, cập nhật bài học YouTube bất cứ lúc nào
            và duyệt quyền xem cho học viên ngay trên cùng một giao diện.
          </p>
        </div>

        <div className="admin-course-hero-stats">
          <div className="admin-course-stat">
            <span>Khóa học đã phát hành</span>
            <strong>{courses.length}</strong>
          </div>
          <div className="admin-course-stat">
            <span>Yêu cầu chờ duyệt</span>
            <strong>{pendingCount}</strong>
          </div>
          <div className="admin-course-stat">
            <span>Đã cấp quyền học</span>
            <strong>{approvedCount}</strong>
          </div>
        </div>
      </section>

      <section className="course-category-strip admin-course-categories">
        {(Object.keys(categoryMeta) as CourseCategory[]).map((key) => {
          const Icon = categoryMeta[key].icon;
          return (
            <article key={key} className={`course-category-card theme-${key} active`}>
              <div className="course-category-icon">
                <Icon size={18} />
              </div>
              <div>
                <strong>{categoryMeta[key].label}</strong>
                <p>{categoryMeta[key].helper}</p>
              </div>
              <span>{categoryCounts[key]}</span>
            </article>
          );
        })}
      </section>

      <section className="course-admin-grid">
        <article className="panel-card course-admin-builder-card">
          <div className="section-heading compact-heading">
            <div>
              <p className="eyebrow">{editingCourseId ? 'Chỉnh sửa khóa học' : 'Tạo khóa học'}</p>
              <h3>{editingCourseId ? 'Cập nhật nội dung khóa học hiện có' : 'Phát hành khóa học mới'}</h3>
            </div>
            <div className="course-admin-head-actions">
              <span className="badge-soft">
                <LayoutPanelTop size={14} />
                Quản trị nội dung trực tiếp
              </span>
              {editingCourseId ? (
                <button type="button" className="ghost-button small-button-inline" onClick={resetForm}>
                  <RotateCcw size={14} />
                  Hủy chỉnh sửa
                </button>
              ) : null}
            </div>
          </div>

          <form className="course-admin-form" onSubmit={handleSubmitCourse}>
            <div className="input-group">
              <label htmlFor="course-title">Tên khóa học</label>
              <input
                id="course-title"
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="Ví dụ: Trình bày dự án nổi bật trước hội đồng"
              />
            </div>

            <div className="course-form-category-grid">
              {(Object.keys(categoryMeta) as CourseCategory[]).map((key) => {
                const Icon = categoryMeta[key].icon;
                return (
                  <button
                    key={key}
                    type="button"
                    className={`course-category-card theme-${key}${form.category === key ? ' active' : ''}`}
                    onClick={() => setForm((current) => ({ ...current, category: key }))}
                  >
                    <div className="course-category-icon">
                      <Icon size={18} />
                    </div>
                    <div>
                      <strong>{categoryMeta[key].label}</strong>
                      <p>{categoryMeta[key].helper}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="input-group">
              <label htmlFor="course-summary">Mô tả ngắn</label>
              <input
                id="course-summary"
                value={form.summary}
                onChange={(event) => setForm((current) => ({ ...current, summary: event.target.value }))}
                placeholder="Dòng mô tả hiển thị ngay ở thẻ khóa học"
              />
            </div>

            <div className="dashboard-grid two-up">
              <div className="input-group">
                <label htmlFor="course-level">Cấp độ</label>
                <input
                  id="course-level"
                  value={form.level}
                  onChange={(event) => setForm((current) => ({ ...current, level: event.target.value }))}
                  placeholder="Cơ bản / Trung bình / Nâng cao"
                />
              </div>

              <div className="input-group">
                <label htmlFor="course-duration">Thời lượng ước tính</label>
                <input
                  id="course-duration"
                  value={form.estimatedDuration}
                  onChange={(event) => setForm((current) => ({ ...current, estimatedDuration: event.target.value }))}
                  placeholder="Ví dụ: 2 giờ 30 phút"
                />
              </div>
            </div>

            <div className="input-group">
              <label htmlFor="course-thumbnail">Thumbnail URL</label>
              <input
                id="course-thumbnail"
                value={form.thumbnailUrl}
                onChange={(event) => setForm((current) => ({ ...current, thumbnailUrl: event.target.value }))}
                placeholder="https://..."
              />
            </div>

            <div className="input-group">
              <label htmlFor="course-description">Mô tả chi tiết</label>
              <textarea
                id="course-description"
                rows={4}
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="Nêu rõ khóa học phù hợp với ai, đầu ra là gì và nên học theo thứ tự nào."
              />
            </div>

            <div className="course-admin-lessons">
              <div className="section-heading compact-heading">
                <div>
                  <p className="eyebrow">Danh sách bài học</p>
                  <h3>Nhập link YouTube cho từng bài</h3>
                </div>
                <button type="button" className="ghost-button" onClick={addLesson}>
                  <Plus size={16} />
                  Thêm bài học
                </button>
              </div>

              {form.lessons.map((lesson, index) => (
                <div key={`lesson-${index}`} className="course-admin-lesson-card">
                  <div className="course-admin-lesson-head">
                    <strong>Bài {index + 1}</strong>
                    {form.lessons.length > 1 ? (
                      <button type="button" className="ghost-button" onClick={() => removeLesson(index)}>
                        Xóa
                      </button>
                    ) : null}
                  </div>

                  <div className="input-group">
                    <label>Tên bài học</label>
                    <input
                      value={lesson.title}
                      onChange={(event) => updateLesson(index, 'title', event.target.value)}
                      placeholder="Ví dụ: Cách mở đầu bài thuyết trình tự tin"
                    />
                  </div>

                  <div className="dashboard-grid two-up">
                    <div className="input-group">
                      <label>Link YouTube</label>
                      <input
                        value={lesson.youtubeUrl}
                        onChange={(event) => updateLesson(index, 'youtubeUrl', event.target.value)}
                        placeholder="https://www.youtube.com/watch?v=..."
                      />
                    </div>

                    <div className="input-group">
                      <label>Thời lượng hiển thị</label>
                      <input
                        value={lesson.durationLabel}
                        onChange={(event) => updateLesson(index, 'durationLabel', event.target.value)}
                        placeholder="Ví dụ: 12 phút"
                      />
                    </div>
                  </div>

                  <div className="input-group">
                    <label>Mô tả bài học</label>
                    <textarea
                      rows={3}
                      value={lesson.description}
                      onChange={(event) => updateLesson(index, 'description', event.target.value)}
                      placeholder="Mô tả ngắn gọn nội dung trọng tâm của bài học này."
                    />
                  </div>
                </div>
              ))}
            </div>

            <button type="submit" className="primary-button" disabled={submitting}>
              <BookOpen size={16} />
              {submitting
                ? editingCourseId
                  ? 'Đang cập nhật...'
                  : 'Đang tạo...'
                : editingCourseId
                  ? 'Lưu thay đổi khóa học'
                  : 'Hoàn tất và phát hành khóa học'}
            </button>
          </form>
        </article>

        <article className="panel-card course-admin-review-card">
          <div className="section-heading compact-heading">
            <div>
              <p className="eyebrow">Yêu cầu học viên</p>
              <h3>Duyệt quyền truy cập</h3>
            </div>
            <span className="badge-soft">
              <Clock3 size={14} />
              {pendingCount} chờ duyệt / {rejectedCount} đã từ chối
            </span>
          </div>

          <div className="course-request-list">
            {requests.length ? (
              requests.map((request) => (
                <article key={request.id} className={`course-request-card theme-${request.course?.category ?? 'presentation'}`}>
                  <div className="course-request-body">
                    <div className="course-request-header">
                      <strong>{request.user?.name || 'Học viên'}</strong>
                      {request.course?.category ? (
                        <span className={`course-category-badge theme-${request.course.category}`}>
                          {categoryMeta[request.course.category].label}
                        </span>
                      ) : null}
                    </div>
                    <p>{request.user?.email}</p>
                    <span className="muted-text">Khóa học: {request.course?.title || 'Không xác định'}</span>
                  </div>

                  <div className="course-request-meta">
                    <span
                      className={`status-badge ${
                        request.status === 'approved' ? 'success' : request.status === 'rejected' ? 'danger' : 'dark'
                      }`}
                    >
                      {requestStatusLabel[request.status]}
                    </span>
                    <span className="muted-text">Gửi lúc {formatDate(request.requestedAt)}</span>
                    {request.adminNote ? (
                      <span className="muted-text">
                        <StickyNote size={14} />
                        Ghi chú: {request.adminNote}
                      </span>
                    ) : null}
                  </div>

                  <div className="course-request-actions">
                    <button
                      type="button"
                      className="primary-button"
                      disabled={processingRequestId === request.id}
                      onClick={() => handleReviewRequest(request, 'approved')}
                    >
                      <CheckCircle2 size={16} />
                      Duyệt
                    </button>
                    <button
                      type="button"
                      className="danger-button"
                      disabled={processingRequestId === request.id}
                      onClick={() => handleReviewRequest(request, 'rejected')}
                    >
                      <XCircle size={16} />
                      Từ chối
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <p className="muted-text">Chưa có yêu cầu học nào được gửi lên.</p>
            )}
          </div>
        </article>
      </section>

      <section className="panel-card">
        <div className="section-heading compact-heading">
          <div>
            <p className="eyebrow">Khóa học đã phát hành</p>
            <h3>Danh sách quản lý</h3>
          </div>
          <span className="badge-soft">
            <ShieldCheck size={14} />
            Hiển thị ngay cho học viên
          </span>
        </div>

        <div className="course-admin-published-list upgraded">
          {courses.length ? (
            courses.map((course) => (
              <article key={course.id} className={`course-admin-published-card theme-${course.category}`}>
                <div className="course-admin-published-main">
                  <div className="course-request-header">
                    <strong>{course.title}</strong>
                    <span className={`course-category-badge theme-${course.category}`}>
                      {categoryMeta[course.category].label}
                    </span>
                  </div>
                  <p>{course.summary}</p>
                  <div className="course-list-meta">
                    <span>{course.level}</span>
                    <span>{course.lessonsCount} bài học</span>
                    <span>{course.estimatedDuration || 'Chưa ghi thời lượng'}</span>
                  </div>
                  <span className="muted-text">Tạo lúc {formatDate(course.createdAt)}</span>
                </div>

                <div className="course-admin-card-actions">
                  <button type="button" className="ghost-button" onClick={() => startEditCourse(course)}>
                    <Pencil size={16} />
                    Chỉnh sửa
                  </button>
                  <button
                    type="button"
                    className="danger-button"
                    disabled={deletingCourseId === course.id}
                    onClick={() => handleDeleteCourse(course)}
                  >
                    <Trash2 size={16} />
                    {deletingCourseId === course.id ? 'Đang xóa...' : 'Xóa khóa học'}
                  </button>
                </div>
              </article>
            ))
          ) : (
            <p className="muted-text">Chưa có khóa học nào được tạo.</p>
          )}
        </div>
      </section>
    </div>
  );
}
