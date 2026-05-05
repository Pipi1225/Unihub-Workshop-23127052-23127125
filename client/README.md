# Workshop Management System - Frontend

Frontend web application cho hệ thống quản lý workshop. Xây dựng bằng React + Vite + Tailwind CSS.

## ✨ Tính Năng

### Sinh Viên
- **Xem danh sách workshop** - Lọc, tìm kiếm workshop
- **Chi tiết workshop** - Xem thông tin chi tiết, mô tả AI
- **Đăng ký workshop** - Hoàn thành luồng đăng ký, thanh toán
- **Quản lý đăng ký** - Xem trạng thái đơn đăng ký

### Quản Trị Viên
- **Dashboard** - Thống kê tổng quan (workshop, đăng ký, doanh thu)
- **Quản lý workshop** - Tạo, chỉnh sửa, xóa workshop
- **Tải PDF** - Tải tài liệu PDF cho workshop (tự động phân tích AI)
- **Thống kê chi tiết** - Phân tích từng workshop

### Chung
- **Đăng nhập Google OAuth** - Xác thực an toàn với Google
- **RBAC** - Kiểm soát quyền dựa trên vai trò

## 🚀 Cài Đặt

### Yêu Cầu
- Node.js 16+
- npm hoặc yarn
- Backend API chạy trên http://localhost:4000

### Bước 1: Cài Đặt Dependencies

```bash
cd client
npm install
```

### Bước 2: Cấu Hình Environment

Tạo file `.env.local`:

```bash
cp .env.example .env.local
```

Chỉnh sửa `.env.local`:

```
VITE_API_URL=http://localhost:4000
VITE_GOOGLE_CLIENT_ID=your_google_oauth_client_id
```

#### Lấy Google OAuth Client ID:
1. Vào [Google Cloud Console](https://console.cloud.google.com/)
2. Tạo project mới hoặc chọn existing
3. Kích hoạt Google+ API
4. Tạo OAuth 2.0 Client ID (Web application)
5. Thêm redirect URIs:
   - `http://localhost:5173/login`
   - `https://yourdomain.com/login`

### Bước 3: Chạy Development Server

```bash
npm run dev
```

Server sẽ chạy tại `http://localhost:5173`

## 📦 Build Production

```bash
npm run build
npm run preview
```

## 🏗️ Cấu Trúc Dự Án

```
src/
├── pages/              # Các trang chính
│   ├── LoginPage.jsx
│   ├── WorkshopListPage.jsx
│   ├── WorkshopDetailPage.jsx
│   ├── RegistrationPage.jsx
│   ├── AdminDashboardPage.jsx
│   └── AdminWorkshopManagementPage.jsx
├── components/         # Tái sử dụng components
│   └── ProtectedRoute.jsx
├── layouts/           # Layout components
│   └── MainLayout.jsx
├── services/          # API calls
│   ├── api.js        # Axios config + interceptors
│   └── index.js      # API endpoints
├── contexts/          # React Context
│   └── AuthContext.jsx
├── utils/            # Utility functions
│   └── helpers.js
└── App.jsx           # Main router
```

## 🔄 Luồng Ứng Dụng

### Đăng Nhập
1. User vào `/login`
2. Click "Đăng nhập với Google"
3. Google OAuth callback với code
4. Frontend gửi code đến backend
5. Backend trả về token + user info
6. Redirect đến `/workshops`

### Xem Workshop
1. GET `/api/workshops` - Lấy danh sách
2. GET `/api/workshops/:id` - Chi tiết
3. Admin có button Edit/Delete

### Đăng Ký Workshop
1. User click "Đăng ký tham gia"
2. Điền form registration info
3. POST `/api/registrations` - Tạo đơn
4. Redirect đến trang thanh toán

### Quản Lý Workshop (Admin)
1. `/admin` - Xem thống kê
2. `/admin/workshops/new` - Tạo mới
3. `/admin/workshops/:id/edit` - Chỉnh sửa
4. POST/PUT/DELETE `/api/workshops`

## 🔐 Authentication

### JWT Token
- Lưu trong `localStorage` dưới key `token`
- Tự động thêm vào header: `Authorization: Bearer <token>`
- Auto-refresh khi 401 response

### Roles
- `ADMIN` - Quản trị viên (full access)
- `STUDENT` - Sinh viên (read workshops, register)
- `CHECKIN_STAFF` - Nhân viên check-in (sync only)

### Protected Routes
```jsx
<ProtectedRoute requireAdmin>
  <AdminDashboardPage />
</ProtectedRoute>
```

## 🛠️ API Integration

Tất cả API calls thông qua `axios`:

```javascript
import { workshopService, registrationService } from '../services'

// Get workshops
const data = await workshopService.getWorkshops()

// Register
const result = await registrationService.register(workshopId, studentInfo)
```

## 📱 Responsive Design

- Mobile-first approach
- Grid layouts (Tailwind)
- Responsive navigation
- Touch-friendly buttons

## 🎨 Styling

- **Tailwind CSS v4** - Utility-first CSS
- **Flowbite** - UI components
- **Custom CSS** - App.css cho styling riêng

## 🐛 Debugging

```bash
# Dev tools
npm run lint

# Check for unused imports
npm run lint -- --fix

# Build analysis
npm run build -- --profile
```

## 📝 Notes

- Backend API phải chạy trước khi frontend
- CORS đã được cấu hình trên backend
- Flowbite components có thể import từ react package
- Auth state persist qua localStorage

## 🤝 Contribut

Vui lòng follow code style hiện tại (Prettier config).

## 📄 License

MIT
