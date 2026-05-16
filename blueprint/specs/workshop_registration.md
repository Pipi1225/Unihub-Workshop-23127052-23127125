# Đặc tả: Đăng ký Workshop (Workshop Registration)

## Mô tả

Tính năng cho phép sinh viên chọn một workshop từ danh sách và thực hiện đăng ký "giữ chỗ" (hold slot). Đối với workshop miễn phí, đăng ký sẽ thành công ngay lập tức và sinh ra mã QR. Đối với workshop có phí, hệ thống sẽ giữ chỗ tạm thời và chuyển sinh viên sang luồng thanh toán.

Tính năng này phải giải quyết bài toán "tranh chấp chỗ ngồi" (Concurrency) khi có hàng ngàn sinh viên thao tác cùng lúc.

## Luồng chính

**Bối cảnh (Context)**: Sinh viên đã đăng nhập thành công vào hệ thống, đang ở trang chi tiết của một workshop và quyết định bấm nút đăng ký. Lượng truy cập lúc này có thể đang ở mức đỉnh điểm (Peak load).

Hệ thống áp dụng cơ chế **Luồng Đăng ký Lai (Hybrid Flow)**. Khi số lượng vé trống còn dồi dào, hệ thống dùng luồng Nhanh (Fast Path - Async). Khi lượng vé chạm ngưỡng rủi ro (Ví dụ: ≤ 5 vé cuối cùng), hệ thống chuyển sang luồng Chậm (Pessimistic Path - Sync) để kiểm soát tuyệt đối bằng Database.

**Các bước xử lý chi tiết (Flow):**

- **B1. Giao diện (Frontend Trigger)**: Sinh viên nhấn nút "Tham gia". Frontend gửi request POST đến endpoint `/api/registrations`.
- **B2. Trích xuất định danh (Authentication)**: Backend giải mã JWT Token, lấy `user_id` để ngăn chặn giả mạo request.
- **B3. Kiểm soát tải (Rate Limiting)**: Đi qua bộ lọc Token Bucket trên Redis (Per-User và Global Limit). Trả về 429 nếu vi phạm.
- **B4. Đánh giá chiến lược (Strategy Decision)**: Backend kiểm tra số lượng `available_slots` của workshop.

**Luồng Nhanh (Optimistic / Async Path) - Kích hoạt khi slots > EDGE_CASE_THRESHOLD:**

- **B5a. Trừ chỗ trên RAM (Atomic Update)**: API gọi lệnh `DECR` nguyên tử để trừ số lượng chỗ trống lưu trữ trên Redis. Nếu kết quả sau khi trừ `< 0`, lập tức cộng trả lại (revert) và báo lỗi 409 (Hết vé).
- **B6a. Đẩy hàng đợi (Enqueue)**: Nếu giành chỗ trên Redis thành công, API khởi tạo mã QR Hash và đẩy thông điệp gồm (`user_id`, `workshop_id`, `qr_code_hash`) vào hàng đợi `REGISTRATION_PROCESSING_QUEUE`.
- **B7a. Phản hồi nhanh (Fast Response)**: API trả về HTTP `201 Created` ngay lập tức để giải phóng kết nối cho user.
- **B8a. Xử lý ngầm (Background Worker)**: Node.js Worker tuần tự lấy job từ queue, thực hiện giao dịch (Transaction) ghi vào PostgreSQL và kiểm tra trùng lặp (Idempotent Retry Protection). Nếu user được ghi thành công, Worker tiếp tục đưa tác vụ gửi email hoặc đếm ngược giữ chỗ thanh toán (Hold Expiry) vào các hàng đợi tương ứng.

**Luồng Chặn (Pessimistic / Sync Path) - Kích hoạt khi slots <= EDGE_CASE_THRESHOLD hoặc Redis sự cố:**

- **B5b. Khóa phân tán (Distributed Lock)**: Backend yêu cầu Redis cấp một khóa độc quyền (`lock:workshop:id`). Các request đến cùng lúc phải chờ (sleep).
- **B6b. Giao dịch đồng bộ (Database Transaction)**: Request giữ Lock sẽ kiểm tra trùng lặp và trừ số chỗ trực tiếp trên PostgreSQL bằng truy vấn cập nhật có điều kiện (`UPDATE ... WHERE available_slots > 0`).
- **B7b. Cập nhật Bộ đệm**: Nếu thành công, ghi đè lại giá trị slot bằng 0 lên Redis.
- **B8b. Phản hồi**: Trả về kết quả cho Frontend sau khi dữ liệu đã ghi xong xuống Database.

- **B9. Khởi tạo bộ đếm thời gian giữ chỗ (Hold Timeout - Dành cho vé có phí)**: Nếu là workshop có phí, một Delayed Job sẽ kích hoạt đếm ngược (Mặc định: 10 phút). Nếu thanh toán thất bại, hệ thống tự động hủy vé và hoàn trả slot vào Database.

## Kịch bản lỗi

### 3.1. Sinh viên bấm nút quá nhanh hoặc dùng Tool Spam (Tải đột biến)

**Trigger**: Hệ thống ghi nhận số lượng request từ một user vượt mức cấu hình của thuật toán Token Bucket trên Redis (vd: > 30 req/phút).

**Xử lý**: Chặn request ngay ở Gateway, không thực hiện truy vấn DB. Trả về mã lỗi 429 Too Many Requests. Frontend hiển thị thông báo toast: "Hệ thống đang quá tải, vui lòng thao tác chậm lại."

### 3.2. Đăng ký trùng lặp (Duplicate Registration)

**Trigger**: Mạng chậm khiến sinh viên nhấn nút đăng ký 2 lần, hoặc cố tình gửi API bằng Postman trong khi đã có vé của sự kiện này.

**Xử lý**: Bước Validation ở tầng Database (hoặc ràng buộc Unique Constraint giữa user_id và workshop_id) sẽ phát hiện trùng lặp. Giao dịch bị hủy (Rollback), nhả Lock Redis. Trả về mã lỗi 409 Conflict. Frontend báo lỗi: "Bạn đã đăng ký tham gia sự kiện này rồi."

### 3.3. Hết chỗ ngay khoảnh khắc đăng ký (Overbooking Attempt / Race Condition)

**Trigger**: Chỉ còn 1 slot, nhưng Sinh viên A và B bấm cùng lúc. A lấy được Redis Lock trước. B đứng chờ. Khi A xử lý xong, số slot về 0. Lúc này B mới lấy được Lock và đi vào truy vấn DB.

**Xử lý**: Khi thực hiện lệnh DECR trên Redis Counter, kết quả trả về < 0. Giao dịch của B bị hủy (Rollback). Nhả Lock. Trả về mã lỗi 400 Bad Request hoặc 409 Conflict. Frontend báo: "Rất tiếc, sự kiện vừa hết chỗ. Vui lòng chọn sự kiện khác."

### 3.4. Quá thời gian chờ Khóa (Lock Timeout)

**Trigger**: Có quá nhiều người (ví dụ 1.000 người) cùng tranh 1 workshop. Hàng đợi chờ lấy Redis Lock quá dài, request của sinh viên phải đợi quá 3 giây mà chưa tới lượt.

**Xử lý**: Để tránh việc kết nối HTTP bị treo (timeout vòng đời request), hàm lấy Lock sẽ tự động bỏ cuộc (Fail-fast) sau 3 giây chờ đợi. Trả về mã lỗi 503 Service Unavailable. Frontend thông báo: "Hệ thống đang bận do lượng người truy cập lớn, vui lòng thử lại."

### 3.5. Sự cố đứt gãy Redis (Redis Crash)

**Trigger**: Máy chủ chứa Redis bị sập. Hệ thống không thể dùng Redis để đếm Rate Limit hay phân phát Distributed Lock.

**Xử lý**: Áp dụng Graceful Degradation. Backend bắt được lỗi kết nối Redis, tự động bỏ qua bước lấy Distributed Lock và tiếp tục xử lý đăng ký qua transaction PostgreSQL. Cơ chế cập nhật có điều kiện `available_slots > 0` vẫn đảm bảo không overbooking. Hiệu năng có thể giảm, nhưng tính toàn vẹn dữ liệu vẫn được giữ.

### 3.6. Lỗi kẹt giao dịch Database (Deadlock / DB Timeout)

**Trigger**: PostgreSQL bị nghẽn CPU do tải quá nặng, dẫn đến các Transaction kéo dài quá giới hạn thời gian cho phép.

**Xử lý**: Database tự động ném ra lỗi Deadlock/Timeout. Backend Catch lỗi này, thực hiện thao tác Rollback để đảm bảo dữ liệu không bị rác. Trả về 500 Internal Server Error. Hệ thống giám sát (Monitoring) tự động gửi cảnh báo cho Admin.

### 3.7. Vé bị hủy do quá hạn thanh toán (Payment Timeout)

**Trigger**: Sau `PAID_HOLD_MINUTES` (mặc định local hiện tại: 10 phút) kể từ lúc giữ chỗ thành công, hệ thống không nhận được xác nhận thanh toán thành công từ Mock Payment Gateway.

**Xử lý**: Delayed Job kích hoạt. Chuyển payment_status của bản ghi Registrations thành CANCELLED. Trả lại 1 available_slots cho Workshop.

## Ràng buộc

### Tính nhất quán (Consistency)

Bắt buộc phải áp dụng tính chất ACID của hệ quản trị cơ sở dữ liệu quan hệ. Tuyệt đối không cho phép 2 sinh viên cùng nhận được thông báo đăng ký thành công khi chỉ còn 1 slot cuối cùng.

### Hiệu năng (Performance)

Thời gian phản hồi của API đăng ký không được vượt quá 500ms ở điều kiện bình thường và 1500ms ở điều kiện tải đỉnh (peak load 7.200 req/3 phút).

### Bảo mật

Backend tuyệt đối không lấy user_id từ req.body do client gửi lên (để ngăn chặn giả mạo/đăng ký hộ). user_id bắt buộc phải được giải mã (decode) trực tiếp từ JWT Token ở tầng Middleware.

## Tiêu chí chấp nhận

### Test Case 1 (Duplicate Registration - Single User)

Gửi 100 HTTP request đồng thời từ **cùng 1 tài khoản user** (1 JWT) vào một workshop. Hệ thống phải đảm bảo request đầu tiên: status `201 Created` (đăng ký thành công). 99 request còn lại: status `409 Conflict` với message "Bạn đã đăng ký sự kiện này rồi" (duplicate detection)

### Test Case 2 (Race Condition - Multiple Users)

Gửi 100 HTTP request đồng thời từ **100 user khác nhau** (100 JWT khác nhau) vào một workshop chỉ còn **1 slot duy nhất**. Hệ thống phải đảm bảo:

- Chỉ **1 user** được đăng ký thành công → status `201 Created`
- **99 user còn lại** nhận `409 Conflict` vì **hết chỗ** (workshop full), **không phải** duplicate
- **0 duplicate error** (mỗi user là unique)

### Test Case 3 (Sequential Duplicate Detection)

Sinh viên cố tình gửi 2 request đăng ký cùng một `workshop_id` cho chính mình (hoặc qua manual Postman call). Request thứ 2 phải bị từ chối với thông báo "Bạn đã đăng ký sự kiện này" và status `409 Conflict`.

### Test Case 4 (RBAC - Organizer Cannot Register)

User đăng nhập với tài khoản có role `ORGANIZER` gọi API đăng ký. Hệ thống trả về `403 Forbidden`. Test bằng PostMan trước lúc hoàn thiện.

### Test Case 5

Sinh viên A đăng ký thành công workshop có phí (còn đúng 1 slot cuối), nhưng không thanh toán. Sinh viên B vào sau thấy báo "Hết chỗ". Sau `PAID_HOLD_MINUTES` (mặc định local: 10 phút), hệ thống hủy vé của A. Sinh viên B f5 lại trang, thấy còn 1 slot trống và có thể đăng ký thành công.
