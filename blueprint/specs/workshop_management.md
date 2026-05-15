# Đặc tả: Quản lý Workshop & Tóm tắt AI (Workshop Management & AI Summary)

## Mô tả

Tính năng này phục vụ hai nhóm người dùng chính với các quyền hạn khác biệt:

- **Sinh viên**: Truy cập để xem danh sách lịch trình và thông tin chi tiết của tất cả các workshop đang mở. Luồng này đòi hỏi tốc độ cao vì phải gánh tải 12.000 lượt truy cập đồng thời.

- **Ban tổ chức (Admin)**: Thực hiện các thao tác CRUD (Tạo mới, Cập nhật, Xóa) workshop. Đặc biệt, tính năng hỗ trợ Ban tổ chức tải lên file PDF giới thiệu sự kiện; hệ thống sẽ đưa vào hàng đợi để xử lý ngầm và gọi AI (Gemini/OpenAI) trích xuất thành đoạn văn tóm tắt.

## Luồng chính

### Luồng 2.1: Sinh viên tải danh sách Workshop (High-Traffic Flow)

**Bối cảnh**: 10 phút trước giờ mở đăng ký, hàng ngàn sinh viên liên tục F5 (làm mới) trang chủ để xem danh sách sự kiện.

**Các bước:**

- **B1. Giao diện (Frontend Trigger)**: Web App gọi API GET /api/workshops.

- **B2. Cache Hit (Redis)**: Backend KHÔNG chọc xuống PostgreSQL ngay. Thay vào đó, API truy vấn dữ liệu từ bộ nhớ đệm Redis (đã được làm phẳng định dạng JSON). Do dữ liệu đọc từ RAM, thao tác này diễn ra chỉ trong vài mili-giây, bảo vệ Primary Database khỏi nguy cơ sập.

- **B3. Phản hồi**: Backend trả danh sách về cho Frontend hiển thị.

### Luồng 2.2: Ban tổ chức Tạo Workshop & Gọi AI tóm tắt (Async Flow)

**Bối cảnh**: Admin muốn tạo một workshop mới và có sẵn 1 file PDF Brochure giới thiệu sự kiện.

**Các bước:**

- **B1. Giao diện (Frontend Trigger)**: Admin điền các thông tin cơ bản (Tên, thời gian, phòng, tổng số slot, giá vé) và chọn file PDF. Nhấn "Tạo mới". API POST /api/workshops được gọi.

- **B2. Xác thực & Phân quyền**: Middleware giải mã JWT Token, trích xuất role. Xác nhận role === 'ORGANIZER', nếu sai thì chặn ngay.

- **B3. Khởi tạo dữ liệu (Database Transaction)**: Backend lưu file PDF vào thư mục cục bộ của server (được mount thông qua Docker Volume để dữ liệu không bị mất khi restart container).
  - Insert bản ghi mới vào bảng Workshops trên PostgreSQL với ai_summary_status = 'PROCESSING'.

- **B4. Đẩy tác vụ nền (Queue)**: Backend tạo một thông điệp (chứa workshop_id và đường dẫn file PDF), đẩy vào Redis Message Queue (sử dụng BullMQ). API trả về ngay HTTP Status 201 Created cho Frontend để không làm admin phải chờ đợi.

- **B5. Xử lý AI (Background Worker)**: Node.js Worker chạy ngầm bốc thông điệp từ Redis Queue.
  - Đọc file PDF, làm sạch text (xóa ký tự rác).
  - Gửi text này đến External API của AI Provider (Gemini) với prompt kiểu: "Hãy tóm tắt nội dung sự kiện này trong 150 chữ".

- **B6. Cập nhật kết quả**: Nhận kết quả từ AI, Worker thực hiện lệnh UPDATE Workshops SET description = <kết quả>, ai_summary_status = 'COMPLETED' WHERE id = workshop_id.

- **B7. Xóa Cache**: Worker ra lệnh xóa (Invalidate) cache danh sách workshop trên Redis, ép hệ thống nạp lại danh sách mới nhất ở lần truy cập tiếp theo của sinh viên.

**Lưu ý về Cache Invalidation**: Không chỉ khi tạo mới, mà ở BẤT KỲ thao tác Cập nhật (Update) giờ giấc/số slot hay Hủy (Delete) workshop nào từ Admin, Backend cũng phải lập tức thực hiện lệnh xóa Cache (Invalidate) danh sách workshop trên Redis, đảm bảo 12.000 sinh viên luôn nhìn thấy dữ liệu realtime.

## Kịch bản lỗi

### 3.1. Truy cập trái phép (Authorization Failure)

**Trigger**: Sinh viên (Role STUDENT) dùng Postman hoặc sửa code Frontend để gọi API POST /api/workshops hoặc DELETE /api/workshops/:id.

**Xử lý**: Middleware RBAC phát hiện role không hợp lệ. Chặn ngay lập tức, trả về mã lỗi 403 Forbidden. Không có dữ liệu nào bị thay đổi.

### 3.2. Sửa/Xóa Workshop đã có người đăng ký (Data Integrity Conflict)

**Trigger**: Ban tổ chức cố tình xóa một workshop đã có sinh viên mua vé, hoặc cố tình sửa total_slots (từ 60 xuống 40) trong khi đã có 50 sinh viên đăng ký.

**Xử lý**: Backend kiểm tra mối quan hệ (Foreign Key) trong DB.

- **Trường hợp Xóa**: Báo lỗi 409 Conflict - "Không thể xóa workshop đã có sinh viên đăng ký. Vui lòng hủy vé trước."
- **Trường hợp Sửa Slot**: Nếu total_slots mới < số vé đã bán, trả về 400 Bad Request - "Số lượng chỗ ngồi không thể nhỏ hơn số vé đã xuất."

### 3.3. Dịch vụ AI bị sập hoặc Timeout (AI Provider Down)

**Trigger**: API của Gemini bị lỗi trả về 5xx hoặc quá 30 giây không phản hồi.

**Xử lý**: Job trong BullMQ sẽ tự động thử lại (Retry) với cơ chế Exponential Backoff (sau 1p, 2p, 4p). Nếu sau 3 lần vẫn thất bại, Worker cập nhật ai_summary_status = 'FAILED'. Frontend hiển thị thông báo để Ban tổ chức biết và tự nhập tay nội dung mô tả. Đồng thời phía sinh viên khi xem nội dung mô tả sẽ trở thành "Đang cập nhật mô tả."

### 3.4. Cache Miss cục bộ (Redis Crash lúc đọc dữ liệu)

**Trigger**: Khi 12.000 sinh viên truy cập, Redis gặp sự cố không thể trả về cache.

**Xử lý**: Backend áp dụng Try-Catch, rẽ nhánh luồng đọc dữ liệu thẳng xuống PostgreSQL. Tuy nhiên, để tránh sập DB, API Gateway sẽ bóp Rate Limit chặt hơn (Fall-back Mode) để giới hạn tải cho đến khi Redis được phục hồi.

## Ràng buộc

### Bảo mật File

API tải lên PDF phải chặn mọi định dạng file khác (.exe, .sh, .zip) và giới hạn dung lượng tối đa (Ví dụ: 5MB) để chống tấn công cạn kiệt tài nguyên (DDoS/Storage Exhaustion).

### Hiệu năng Đọc (Read Performance)

API GET /api/workshops bắt buộc phải trả về dưới 100ms. Luôn ưu tiên đọc từ Redis Cache.

### Tính Bất đồng bộ (Asynchrony)

Tuyệt đối không gọi API Gemini trực tiếp trong luồng chính của HTTP Request do thời gian chờ AI sinh text có thể lên đến 10-20 giây, gây lỗi HTTP Timeout và treo giao diện của Ban tổ chức.

## Tiêu chí chấp nhận

### Test Case 1 (Security)

Gửi request PUT /api/workshops/1 với header chứa JWT Token của một tài khoản sinh viên. Hệ thống phải trả về 403 Forbidden.

### Test Case 2 (Performance)

Gửi 5.000 request GET /api/workshops đồng thời trong 1 giây. Backend lấy dữ liệu từ Redis và trả về 200 OK với Response Time P95 < 150ms mà không làm quá tải CPU của PostgreSQL.

### Test Case 3 (AI Workflow)

User Admin tạo workshop và đính kèm file PDF hợp lệ. API trả về 201 Created ngay lập tức (< 500ms). Khoảng 10 giây sau, load lại trang chi tiết workshop sẽ thấy phần "Mô tả" được điền tự động bằng đoạn text tóm tắt.

### Test Case 4 (Validation)

Cố ý gọi API cập nhật giảm total_slots xuống 10 đối với một workshop đang có 15 vé tồn tại. Hệ thống trả về 400 Bad Request và giữ nguyên trạng thái cũ.
