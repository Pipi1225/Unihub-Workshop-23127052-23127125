# Payment (Mock Gateway + Idempotency) - Hướng dẫn sử dụng

## Tổng quan

Payment là tính năng xử lý thanh toán cho workshop có phí. Hệ thống dùng **mock gateway** để mô phỏng thanh toán và **idempotency key** để chống double charge. Luồng chính:

- Kiểm tra đăng ký hợp lệ và workshop yêu cầu thanh toán
- Tạo bản ghi `payments` với trạng thái `PENDING`
- Gọi mock gateway để xử lý
- Cập nhật trạng thái `payments` và `registrations`
- Cache kết quả theo idempotency key (Redis)

### Kiến trúc

```
client
    │
    ▼
POST /api/payments/charge
    │  authorize (JWT + role STUDENT)
    │  idempotency check (Redis + DB)
    ▼
Mock Payment Gateway
    │
    ▼
Update payments + registrations (transaction)
```

## Cách hoạt động

1. **Client** gửi yêu cầu thanh toán kèm header `X-Idempotency-Key`.
2. **Server** kiểm tra cache theo idempotency key trong Redis.
3. **Tìm đăng ký**: `registration_id` phải thuộc về user hiện tại.
4. **Kiểm tra workshop**: chỉ xử lý khi `is_paid = true` và có `price`.
5. **Tạo payment** với trạng thái `PENDING` nếu chưa có bản ghi.
6. **Mock gateway**:
   - `success`: cập nhật `payments.status = SUCCESS` và `registrations.payment_status = PAID`.
   - `failure`: cập nhật `payments.status = FAILED` và `registrations.payment_status = FAILED`.
7. **Cache kết quả** theo idempotency key trong Redis (TTL 24h).

## Cấu hình biến môi trường

File: `server/.env`

```env
# Redis (idempotency cache)
REDIS_URL=redis://localhost:6379

# Mock payment mode: success | failure
PAYMENT_MOCK_MODE=success
```

## Endpoint

### 1. Tạo giao dịch thanh toán

```
POST /api/payments/charge
Authorization: Bearer <access_token>
X-Idempotency-Key: <uuid>
Content-Type: application/json

{
  "registration_id": "<uuid>"
}
```

**Response (thành công)**

```
200 OK
{
  "ok": true,
  "payment_status": "SUCCESS",
  "payment_id": "<uuid>",
  "registration_id": "<uuid>"
}
```

**Response (thất bại)**

```
503 Service Unavailable
{
  "ok": false,
  "payment_status": "FAILED",
  "payment_id": "<uuid>",
  "registration_id": "<uuid>",
  "message": "Payment failed. Please try again later."
}
```

### 2. Xem trạng thái mock gateway

```
GET /api/payments/mock-status
Authorization: Bearer <access_token>
```

**Response**

```
200 OK
{
  "ok": true,
  "mode": "success"
}
```

### 3. Cập nhật trạng thái mock gateway

```
PUT /api/payments/mock-status
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "mode": "failure"
}
```

**Response**

```
200 OK
{
  "ok": true,
  "mode": "failure"
}
```

## Middleware bảo vệ route

- `authorize(["STUDENT"])` cho `/charge`.
- `authorize(["ORGANIZER"])` cho `/mock-status`.

## Các bảng liên quan (Prisma)

- `payments`: lưu giao dịch, `idempotency_key` là unique.
- `registrations`: lưu trạng thái thanh toán của đăng ký.

## Idempotency

- Header bắt buộc: `X-Idempotency-Key`.
- Nếu key đã có trong Redis hoặc DB, server trả về kết quả đã lưu.
- TTL cache: 24 giờ.

## Lỗi thường gặp

- **400 Missing X-Idempotency-Key header**: thiếu header idempotency.
- **400 Missing registration_id**: body không có `registration_id`.
- **400 Workshop does not require payment**: workshop không thu phí.
- **404 Registration not found**: đăng ký không tồn tại hoặc không thuộc user.
- **409 Registration already paid**: đăng ký đã thanh toán.
- **503 Payment failed**: mock gateway thất bại.
- **401 Missing access token**: thiếu JWT.
- **403 Forbidden**: không đúng role.

## Ghi chú quan trọng

- Endpoint `/mock-status` chỉ dành cho role `ORGANIZER`.
- Trạng thái thanh toán cập nhật theo transaction Prisma.
- Kết quả thanh toán được cache để tránh double charge.

---

**Phiên bản**: 1.0  
**Cập nhật**: 02/05/2026
