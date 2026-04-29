# CSV Sync Scheduler - Hướng dẫn sử dụng

## Tổng quan

CSV Sync Scheduler là một tính năng tự động đồng bộ dữ liệu học sinh từ file CSV vào cơ sở dữ liệu Postgres thông qua `server.js`. Sử dụng **cron jobs** kết hợp với **Redis distributed lock** để đảm bảo chỉ một instance chạy cùng một lúc.

### Kiến trúc

```
server.js (Express API + CSV Scheduler)
    ├── Cron Job (node-cron)
    │   └── Chạy theo lịch trình (ví dụ: 2:00 AM mỗi ngày)
    │
    └── Redis Lock (ioredis)
        └── Đảm bảo chỉ một instance xử lý CSV sync
```

## Cách hoạt động

1. **Khởi tạo**: Khi `server.js` chạy, CSV Scheduler được tự động khởi tạo
2. **Cron Job**: Theo đó tại thời gian được định cấu hình (mặc định: `0 2 * * *` = 2:00 AM)
3. **Lấy Lock**: Trước khi chạy, scheduler thử lấy khóa Redis
4. **Xử lý**: Nếu lấy được lock, thực hiện `runCsvSync()` để đọc file CSV, chuẩn hóa dữ liệu, batch upsert
4.1 **Domain check**: Hệ thống chấp nhận email kết thúc bằng bất kỳ domain nào được cấu hình trong `CSV_STUDENT_EMAIL_DOMAIN` (comma-separated list).
5. **Release Lock**: Sau hoàn thành, giải phóng lock để instance khác có thể chạy

**Nếu không lấy được lock** → Skip (instance khác đang chạy) → Log và chờ lần tiếp theo

## Lợi ích của Phương án B (Redis Lock + Cron)

| Khía cạnh | BullMQ Worker (Phương án A) | Redis Lock + Cron (Phương án B) |
|-----------|-------|------|
| **Khởi động** | `npm run dev` + `npm run worker:csv` (2 lệnh) | `npm run dev` (1 lệnh) |
| **Quản lý Process** | Cần supervisor/PM2 cho worker riêng | Tích hợp sẵn trong server |
| **Độ phức tạp** | JobScheduler + repeatable job (BullMQ API) | Cron đơn giản + Redis lock |
| **Retry & Backoff** | Tự động retry, backoff, job history | Thủ công (hoặc thêm sau) |
| **Lock Distribution** | BullMQ JobScheduler nội tại | Redis lock rõ ràng, dễ debug |
| **Learning Curve** | Cần hiểu BullMQ, Queue, Worker | Cron syntax + lock concept |
| **Production-ready** | ✅ Cao (enterprise) | ✅ Cao (đơn giản, hiệu quả) |
| **Chi phí vận hành** | Cao (worker + scheduler) | Thấp (1 process) |
| **Scalability** | Tuyệt vời (nhiều worker) | Tốt (nhiều instance, 1 lock) |
| **Dev Experience** | Phức tạp | Đơn giản |

**Tóm lại**: Phương án B phù hợp cho **development** hoặc **small-to-medium** projects vì đơn giản, 1 lệnh khởi động. BullMQ tốt hơn cho **enterprise** cần retry/backoff/history.

## Cài đặt & Chạy

### 1. Cài dependencies

```bash
cd server
npm install node-cron
```

(Các package khác như `ioredis`, `dotenv`, `csv-parser` đã có)

### 2. Cấu hình biến môi trường (server/.env)

```env
# Server
PORT=4000
CLIENT_ORIGIN=http://localhost:5173

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Postgres (cho Prisma)
DATABASE_URL=postgresql://user:pass@localhost:5432/db?schema=public

# Redis (cho lock)
REDIS_URL=redis://localhost:6379

# Google Auth (hoặc admin)
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
JWT_SECRET=your-jwt-secret

# CSV Sync Configuration
CSV_SYNC_CRON=0 2 * * *
CSV_IMPORT_DIR=data/import
CSV_ARCHIVE_DIR=data/archive
CSV_ERROR_DIR=data/error
CSV_SYNC_BATCH_SIZE=1000
CSV_STUDENT_EMAIL_DOMAIN=fitus.edu.vn,student.fitus.edu.vn,clc.fitus.edu.vn  # Comma-separated list supported
```

### 3. Tạo thư mục dữ liệu

```bash
mkdir -p data/import data/archive data/error
```

### 4. Khởi động server

```bash
npm run dev
```

**Output mong đợi:**

```
Server listening at http://localhost:4000
🟢 Đã kết nối thành công tới Redis!
[csvSyncScheduler] Bootstrapping with cron: 0 2 * * *
[csvSyncScheduler] CSV sync scheduler initialized
```

### 5. (Tùy chọn) Chạy CSV sync thủ công ngay lập tức

```bash
npm run csv:sync
```

Điều này sẽ đọc file CSV mới nhất trong `data/import` và xử lý ngay, không cần chờ cron trigger.

## Cấu trúc file

```
server/
├── src/
│   ├── server.js                    # ← Integrate CSV scheduler ở đây
│   ├── config/
│   │   ├── csvSyncScheduler.js      # ← Cron + lock logic
│   │   ├── redis.js
│   │   ├── prisma.js
│   │   └── ...
│   ├── utils/
│   │   └── redisLock.js             # ← Redis lock acquire/release
│   ├── services/
│   │   └── csvSyncService.js        # Streaming CSV parser + upsert
│   ├── scripts/
│   │   └── runCsvSyncOnce.js        # One-off runner
│   └── ...
├── data/
│   ├── import/                      # CSV files tới đây
│   ├── archive/                     # CSV xử lý xong → đây
│   └── error/                       # Error logs → đây
├── .env                             # Cấu hình
└── package.json
```

## Cách sử dụng CSV file

### Format

Tên file: `students_[YYYYMMDD].csv` hoặc bất kỳ `*.csv`

Cột bắt buộc (header):
- `Email` — email sinh viên
- `Họ Tên` hoặc `Full Name` — tên đầy đủ
- (Các cột khác sẽ bị bỏ qua)

**Ví dụ:**

```csv
Email,Họ Tên,Lớp
nguyenvana@student.fitus.edu.vn,Nguyễn Văn A,K20-1
tranthib@student.fitus.edu.vn,Trần Thị B,K20-2
```
```csv
# Additional examples demonstrating supported domains
lethinh@fitus.edu.vn,Lê Thịnh C,K21-3
ngan@clc.fitus.edu.vn,Nguyễn Ngân D,K21-4
```

### Quy trình

1. **Đặt file** → `data/import/students_20260429.csv`
2. **Chờ cron** → 2:00 AM hoặc chạy thủ công `npm run csv:sync`
3. **Kết quả**:
   - ✅ File → `data/archive/students_20260429_DONE.csv`
   - ❌ Lỗi → `data/error/error_20260429.log`
   - 📊 DB → `users` table upsert bằng email

### Lỗi & Xử lý

- **Dòng lỗi** (email/dữ liệu không hợp lệ) → **skip + log** tới `error_*.log`
- **File không tìm thấy** → Log "No CSV found", continue
- **Lock fail** → Log "Could not acquire lock", skip, chờ lần sau
- **DB error** → Log chi tiết lỗi, release lock, thử lại lần tiếp theo

## Debugging & Logs

### Xem logs từ scheduler

```bash
npm run dev
# Logs từ [csvSyncScheduler], [redisLock]
```

### Kiểm tra Redis lock trong Redisu CLI

```bash
# Kết nối Redis (nếu dùng local)
redis-cli

# Xem khóa
GET csv-sync-lock

# Xóa khóa (nếu stuck)
DEL csv-sync-lock
```

### Error log file

```bash
cat data/error/error_20260429.log
```

## Tùy chỉnh

### Thay đổi cron expression

Trong `.env`:

```env
CSV_SYNC_CRON=0 3 * * *    # 3:00 AM
CSV_SYNC_CRON=0 */6 * * *  # Mỗi 6 giờ
CSV_SYNC_CRON=*/30 * * * * # Mỗi 30 phút
```

[Cron expression reference](https://crontab.guru/)

### Thay đổi lock TTL

Trong `server.js`, nếu job chạy lâu hơn 1 giờ:

```javascript
await bootstrapCsvSyncScheduler(redisClient, {
  lockTtl: 7200, // 2 giờ
});
```

### Thêm retry logic (tùy chọn)

Hiện tại scheduler không retry nếu fail. Để thêm retry, chỉnh sửa `csvSyncScheduler.js`:

```javascript
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    const result = await runCsvSync({...});
    break;
  } catch (err) {
    if (attempt === 3) throw err;
    console.log(`Retry ${attempt}...`);
    await new Promise(r => setTimeout(r, 5000));
  }
}
```

## Production Deployment

Nếu deploy trên multiple instances:

1. **Đảm bảo Redis chạy** (Upstash, local, Docker)
2. **Lock sẽ tự động** đảm bảo chỉ 1 instance chạy CSV sync
3. **Nếu instance crash** → Lock timeout 1h, instance khác có thể chạy
4. **Logs** → Gửi tới centralized logging (CloudWatch, Datadog, etc.)

### Docker Compose (tùy chọn)

```yaml
version: '3'
services:
  api:
    build: ./server
    ports:
      - "4000:4000"
    environment:
      REDIS_URL: redis://redis:6379
      DATABASE_URL: postgresql://...
      CSV_SYNC_CRON: "0 2 * * *"
    depends_on:
      - redis
    
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
```

## Câu hỏi thường gặp

**Q: Làm sao tôi biết scheduler đang chạy?**
A: Nhìn logs `[csvSyncScheduler]` khi `npm run dev`

**Q: Nếu 2 instance chạy cùng lúc sao?**
A: Lock đảm bảo chỉ 1 instance thực thi; instance khác sẽ skip

**Q: Nếu instance 1 bị crash khi đang lock?**
A: Lock có TTL (1h), tự động hết hạn → instance 2 có thể lấy lock

**Q: Tôi muốn chạy CSV sync mỗi giờ?**
A: Đổi `CSV_SYNC_CRON=0 * * * *` (top of every hour)

**Q: Có thể xem history job không?**
A: Không (khác BullMQ). Nếu cần, thêm logging database hoặc Datadog

**Q: Tôi muốn chạy thủ công lúc nào cũng được?**
A: `npm run csv:sync` chạy bất kỳ lúc, không phải chờ cron

## Hình vẽ Flow

```
┌─────────────────────────────────────────────────┐
│         npm run dev (Start Server)              │
└──────────────┬──────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────┐
│    Express Server + CSV Scheduler Initialized   │
└──────────────┬──────────────────────────────────┘
               │
               ▼
       ┌───────────────────┐
       │  Every 2:00 AM    │
       │  (Cron trigger)   │
       └─────────┬─────────┘
                 │
                 ▼
       ┌──────────────────────────┐
       │  Try: acquireLock(Redis) │
       └──────┬─────────┬──────────┘
              │         │
        ✅ Yes│         │❌ No
              │         │
              ▼         ▼
       ┌─────────┐   ┌──────────────┐
       │runCsvSync   Skip this round
       │         │   └──────────────┘
       └────┬────┘
            │
            ▼
    ┌────────────────────────┐
    │ Read CSV + Batch Upsert│
    └────┬──────────────┬────┘
         │              │
    ✅ Success    ❌ Error
         │              │
         ▼              ▼
    ┌─────────┐   ┌──────────────┐
    │ Archive │   │ Error Logs   │
    │ CSV_DONE│   │ error_*.log  │
    └─────────┘   └──────────────┘
         │              │
         └──────┬───────┘
                │
                ▼
       ┌─────────────────────┐
       │ releaseLock(Redis)  │
       └─────────────────────┘
```

---

**Phiên bản**: 1.0  
**Cập nhật**: 29/04/2026
