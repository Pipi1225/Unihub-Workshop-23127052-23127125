# Auth (Google + JWT) - Hướng dẫn sử dụng

## Tổng quan

Auth là tính năng đăng nhập bằng Google (ID Token) kết hợp JWT access token và refresh token lưu trong database. Hệ thống:

- Xác thực ID token từ Google
- Kiểm tra email có nằm trong danh sách domain được phép
- Phát hành access token (JWT) và refresh token (lưu DB + cookie httpOnly)

### Kiến trúc

```
client (Google Sign-In)
    │
    ▼
POST /api/auth/google (server)
    │  verify ID token
    │  kiểm tra domain
    ▼
Create access token (JWT)
Create refresh token (DB + cookie)
```

## Cách hoạt động

1. **Client** lấy `credential` (Google ID Token) và gửi lên server.
2. **Server** verify token với `GOOGLE_CLIENT_ID`.
3. **Domain check**: Email chỉ được phép nếu nằm trong `ALLOWED_EMAIL_DOMAINS` (comma-separated). Nếu biến này rỗng, tất cả domain đều được chấp nhận.
4. **Kiểm tra user**: Email phải tồn tại trong bảng `users` và `is_active = true`.
5. **Phát hành token**:

- **Access token** (JWT) trả về trong JSON.
- **Refresh token** lưu vào bảng `refresh_tokens` và set cookie `refresh_token` (httpOnly).

6. **Refresh**: `/api/auth/refresh-token` tạo access token mới từ refresh token trong cookie.
7. **Logout**: `/api/auth/logout` xóa refresh token trong DB và clear cookie.

## Cấu hình biến môi trường

File: `server/.env`

```env
# Google Auth
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret

# JWT
JWT_SECRET=your-jwt-secret
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL_DAYS=7

# Allowed email domains (comma-separated)
ALLOWED_EMAIL_DOMAINS=fitus.edu.vn,student.fitus.edu.vn,clc.fitus.edu.vn
```

## Endpoint

### 1. Đăng nhập bằng Google

```
POST /api/auth/google
Content-Type: application/json

{
  "credential": "<google_id_token>"
}
```

**Response**

```
200 OK
{
  "ok": true,
  "access_token": "<jwt>",
  "user": {
    "id": "uuid",
    "email": "user@fitus.edu.vn",
    "full_name": "Nguyen Van A",
    "role": "STUDENT"
  }
}
```

**Cookie set**

- `refresh_token` (httpOnly, sameSite=strict, secure=production)

### 2. Refresh access token

```
POST /api/auth/refresh-token
```

**Response**

```
200 OK
{
  "ok": true,
  "access_token": "<jwt>"
}
```

### 3. Logout

```
POST /api/auth/logout
```

**Response**

```
200 OK
{
  "ok": true,
  "message": "Logged out"
}
```

## Middleware bảo vệ route

- `authenticateJwt`: Đọc JWT từ header `Authorization: Bearer <token>`.
- `authorize(roles[])`: Kết hợp `authenticateJwt` + `requireRole`.

**Ví dụ**

```js
const authorize = require("../middlewares/authorize");

router.get("/admin", authorize(["ORGANIZER"]), handler);
```

## Các bảng liên quan (Prisma)

- `users`: lưu thông tin người dùng, `email` là unique, `role` và `is_active`.
- `refresh_tokens`: lưu refresh token và hạn sử dụng.

## Lỗi thường gặp

- **401 Missing access token**: không có header `Authorization`.
- **401 Invalid or expired access token**: JWT hết hạn hoặc sai `JWT_SECRET`.
- **401 Missing refresh token**: cookie `refresh_token` không tồn tại.
- **401 Invalid refresh token**: token không tồn tại trong DB.
- **401 Refresh token expired**: token hết hạn (`expires_at`).
- **403 Email domain is not allowed**: email không thuộc `ALLOWED_EMAIL_DOMAINS`.
- **403 Account is not synced in the system**: email chưa được sync vào bảng `users`.
- **403 Account is inactive**: user bị khóa.

## Ghi chú quan trọng

- Nếu `ALLOWED_EMAIL_DOMAINS` rỗng hoặc không set, tất cả domain đều được chấp nhận.
- Access token chỉ chứa `sub` (user id) và `role`.
- Refresh token được lưu DB để có thể revoke khi logout.

---

**Phiên bản**: 1.0  
**Cập nhật**: 02/05/2026
