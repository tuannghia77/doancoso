# SpeakAI

SpeakAI là đồ án full-stack gồm:
- `frontend/`: React + TypeScript + Vite
- `backend/`: Node.js + Express + MongoDB

## Tính năng chính
- Đăng ký, đăng nhập, quên mật khẩu bằng OTP 6 số
- 2 vai trò tài khoản: `admin`, `user`
- Cập nhật hồ sơ cá nhân
- Lưu lịch sử luyện tập thuyết trình / phỏng vấn
- Streak, XP, năng lượng, mục tiêu ngày, leaderboard theo tuần
- Theo dõi tiến độ học tập theo tuần
- AI phân tích CV
- AI đánh giá bài nói từ ghi âm / transcript
- AI đặt câu hỏi phỏng vấn nối tiếp
- Phòng hội thoại AI realtime bằng giọng nói
- Dashboard quản trị người dùng và phiên luyện

## Chạy local
Tại thư mục gốc:

```bash
npm.cmd install
npm.cmd run dev
```

Nếu PowerShell chặn `npm.ps1`, hãy dùng `npm.cmd` thay cho `npm`.

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:5000`
- Health check: `http://localhost:5000/api/health`

## Build

```bash
npm.cmd run build
```

## Start production local

```bash
npm.cmd run build
npm.cmd run start
```

Backend sẽ serve luôn frontend bản build, nên sau khi start production bạn chỉ cần mở:

```txt
http://localhost:5000
```

## Tài khoản admin mặc định
- Email: `admin@speakai.local`
- Password: `Admin@123`

Tài khoản này được tạo khi backend kết nối MongoDB thành công và chạy bootstrap.

## Biến môi trường

### Backend
Tạo file `backend/.env` từ `backend/.env.example`.

Các biến quan trọng:
- `HOST`
- `PORT`
- `MONGO_URI`
- `JWT_SECRET`
- `OPENAI_API_KEY`
- `OPENAI_TEXT_MODEL`
- `OPENAI_TRANSCRIBE_MODEL`
- `OPENAI_REALTIME_MODEL`
- `OPENAI_REALTIME_VOICE`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `MAIL_FROM`
- `APP_URL`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

### Frontend
Tạo file `frontend/.env` từ `frontend/.env.example` nếu cần override.

Mặc định:

```txt
VITE_API_BASE_URL=/api
```

## Bảo mật khi đẩy GitHub
- `backend/.env` và `frontend/.env` đã được ignore trong `.gitignore`
- Đã thêm `backend/.env.example` và `frontend/.env.example` để bạn push code an toàn
- Không đưa API key, mật khẩu SMTP, chuỗi MongoDB thật vào source code

## Deploy Render
Project đã được chuẩn bị để deploy bằng `render.yaml`.

Mô hình deploy hiện tại:
- 1 web service Node.js trên Render
- Render tự build cả frontend + backend
- Backend serve luôn frontend bản build

### Bước deploy
1. Push code lên GitHub
2. Vào Render
3. Chọn `New +` -> `Blueprint`
4. Chọn repo GitHub của bạn
5. Render sẽ đọc `render.yaml` và tạo service `speakai`
6. Điền các biến môi trường bí mật trên Render

### Các biến cần nhập trên Render
- `MONGO_URI`
- `OPENAI_API_KEY`
- `SMTP_USER`
- `SMTP_PASS`
- `MAIL_FROM`
- `APP_URL`
- `ADMIN_PASSWORD`

### Các biến đã có sẵn mặc định trong `render.yaml`
- `NODE_ENV=production`
- `HOST=0.0.0.0`
- `OPENAI_TEXT_MODEL=gpt-4o-mini`
- `OPENAI_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe`
- `OPENAI_REALTIME_MODEL=gpt-realtime`
- `OPENAI_REALTIME_VOICE=marin`
- `SMTP_HOST=smtp.gmail.com`
- `SMTP_PORT=465`
- `SMTP_SECURE=true`
- `ADMIN_EMAIL=admin@speakai.local`

### Lưu ý quan trọng cho Render
- `APP_URL` phải là domain Render thật của web, ví dụ: `https://your-app.onrender.com`
- `PORT` không cần nhập tay, Render tự cấp
- Khi deploy production, frontend gọi API qua đường dẫn tương đối `/api`, nên không cần tách frontend/backend thành 2 service riêng

## Ghi chú
- Nếu chưa có `OPENAI_API_KEY` hoặc quota API gặp lỗi, hệ thống vẫn có fallback để demo
- Nếu chưa cấu hình SMTP, OTP sẽ không gửi mail thật
- Nếu MongoDB Atlas lỗi mạng hoặc IP whitelist, backend sẽ không lên được
