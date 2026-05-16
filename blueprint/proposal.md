# UniHub Workshop — Project Proposal

## Bối cảnh hiện tại & Vấn đề phát sinh

Hiện tại, sự kiện “Tuần lễ kỹ năng và nghề nghiệp” đang được ban tổ chức quản lý bằng cách sử dụng Google Form để thu thập đăng ký và xử lý thông báo qua email thủ công. Và khi quy mô được mở rộng lên 8 - 12 workshop song song mỗi ngày thì quy trình này đang trở nên không phù hợp để vận hành với nhiều vấn đề phát sinh, cụ thể như sau:

- Luồng đăng ký workshop thời gian thực không được kiểm soát chặt chẽ: Google Form có thể giới hạn số lượng phản hồi, nhưng cơ chế này không đảm bảo tính đồng bộ khi nhiều người dùng gửi đăng ký gần như cùng lúc. Ví dụ, khi chỉ còn 1 slot nhưng có nhiều sinh viên submit đồng thời, hệ thống vẫn có thể ghi nhận vượt quá số lượng cho phép, dẫn đến tình trạng overbooking.
- Quy trình gửi email thủ công tiềm ẩn nhiều sai sót và thiếu tính tức thời: Việc gửi email xác nhận thủ công dễ dẫn đến các lỗi như nhập sai địa chỉ người nhận hoặc thiếu, sai lệch thông tin quan trọng (ví dụ: thời gian, địa điểm workshop). Bên cạnh đó, quy trình này tiêu tốn nhiều thời gian và không đảm bảo phản hồi kịp thời, khiến người đăng ký không có xác nhận rõ ràng về trạng thái đăng ký của mình.
- Thiếu luồng kiểm soát check-in tại sự kiện: Hiện tại bài toán không đề cập đến cách thức điểm danh người tham gia sự kiện. Trong thực tế, việc check-in thường được thực hiện thủ công (ví dụ: danh sách giấy hoặc file Excel), dẫn đến thời gian xử lý chậm khi phải tra cứu thông tin người tham dự tại lối vào. Ngoài ra, phương pháp này không đảm bảo tính xác thực danh tính người tham gia, do đó khó kiểm soát các trường hợp sử dụng thông tin của người khác để tham dự.
- Dữ liệu phân tán, thiếu nhất quán: Do các quy trình hiện tại được thực hiện thủ công và sử dụng nhiều công cụ rời rạc (ví dụ: Google Form, file Excel, Email) và số lượng tham gia lớn (hơn 12000 người), dữ liệu liên quan đến đăng ký và tham gia workshop không được đồng bộ trong một hệ thống tập trung. Điều này làm tăng nguy cơ sai lệch dữ liệu, gây khó khăn trong việc đối soát thông tin người tham gia, xác thực danh tính, cũng như thực hiện thống kê và báo cáo sau sự kiện.

## Mục tiêu cần đạt được

Xây dựng hệ thống UniHub Workshop nhằm số hóa toàn bộ quy trình quản lý và tham gia workshop. Các mục tiêu cần đáp ứng bao gồm:

- Yêu cầu tính năng:
  - Đối với sinh viên: Xem lịch workshop; đăng ký tham gia workshop; tạo QR để xác nhận tham dự workshop; nhận được thông báo khi đăng ký workshop thành công.
  - Đối với ban quản lý: Tạo và quản lý workshop; theo dõi số lượng đăng ký workshop; tự động tóm tắt nội dung giới thiệu workshop từ file PDF bằng AI.
  - Đối với nhân viên hỗ trợ check-in: Quét mã QR bằng thiết bị di động để điểm danh người tham dự tại cửa phòng.
- Yêu cầu phi tính năng:
  - Khả năng chịu tải: Đảm bảo hệ thống backend API hoạt động ổn định, không bị sập (crash) khi đón nhận 12.000 lượt truy cập trong 10 phút đầu mở đăng ký, xử lý mượt mà mức đỉnh (peak load) 7.200 lượt truy cập dồn vào 3 phút đầu tiên.
  - Tính toàn vẹn dữ liệu: Đảm bảo không xảy ra overbooking tại các workshop có giới hạn chỗ ngồi thông qua cơ chế kiểm soát đồng thời.
  - Trải nghiệm xuyên suốt: Đảm bảo luồng check-in thông qua mã QR tại cửa phòng diễn ra dưới 2 giây/lượt, hoạt động bình thường ngay cả khi mất kết nối mạng.
  - Tính chịu lỗi: Đảm bảo tính khả dụng của hệ thống cốt lõi. Khi cổng thanh toán (Mock Payment) gặp sự cố kéo dài, các tính năng không liên quan như xem lịch, xem chi tiết workshop và đăng ký workshop miễn phí vẫn phải hoạt động 100% bình thường.

## Đối tượng sử dụng & Nhu cầu cụ thể

Hệ thống phục vụ 3 nhóm người dùng cốt lõi:

- Sinh viên (Người tham dự):
  - Nhu cầu: Tải danh sách workshop nhanh chóng, thao tác đăng ký “giành chỗ” công bằng, nhận vé QR ngay lập tức.
  - Ưu tiên hàng đầu: Tốc độ phản hồi của hệ thống và tính minh bạch khi đăng ký.
- Ban tổ chức (Quản trị viên):
  - Nhu cầu: Tạo/Sửa/Xóa thông tin workshop, xem thống kê số lượng đăng ký theo thời gian thực. Tự động hóa việc tóm tắt nội dung giới thiệu (file PDF) bằng AI để tiết kiệm thời gian viết content.
  - Ưu tiên hàng đầu: Dữ liệu chính xác và công cụ quản trị dễ sử dụng.
- Nhân sự check-in (Vận hành tại chỗ):
  - Nhu cầu: Sử dụng thiết bị di động quét mã QR để xác nhận sinh viên hợp lệ tại cửa.
  - Ưu tiên hàng đầu: Ứng dụng phải ổn định, tốc độ quét mã nhanh và phải ghi nhận được lượt check-in kể cả khi khu vực tổ chức bị rớt mạng.

## Phạm vi của ứng dụng

### Những gì thuộc phạm vi

- Web App (ReactJS): Giao diện tập trung phân quyền theo Role. Sinh viên dùng để xem lịch, đăng ký và tải mã QR. Ban tổ chức dùng để quản lý workshop và xem thống kê.
- Mobile App (Expo React Native): Dành riêng cho nhân sự check-in. Thiết kế theo kiến trúc Offline-first sử dụng expo-sqlite để lưu mã QR và ghi nhận điểm danh khi mất mạng, tự động đồng bộ lên server khi có mạng.
- Backend API & Worker (Node.js): Cung cấp RESTful API, xử lý chịu tải (Rate Limiting), chống tranh chấp (Concurrency) và các worker chạy ngầm cho notification, payment retry, workshop AI summary; riêng CSV Sync được lập lịch tự động bằng cron (`CSV_SYNC_CRON`).
- Cơ sở dữ liệu: PostgreSQL làm cơ sở dữ liệu chính (ACID) và Redis để xử lý Caching, Distributed Lock, Message Queue.
- Tích hợp AI: Kết nối API LLM Gemini để xử lý tóm tắt file PDF giới thiệu workshop.

### Những gì không thuộc phạm vi

- Cổng thanh toán thật: Xây dựng Mock Payment Service nội bộ, cố tình cài cắm lỗi (timeout, delay) để giả lập sự thiếu ổn định và kiểm thử cơ chế Idempotency Key (chống trừ tiền 2 lần).
- Hạ tầng Production: Sản phẩm nộp bao gồm Source Code và file Docker Compose. Hệ thống được đóng gói bằng Docker để chạy và demo hoàn chỉnh trên môi trường Local.
- Hệ thống gửi SMS thật: Chưa nằm trong phạm vi. Kênh thông báo hiện tại dùng Email qua SMTP (Gmail) cho môi trường development/demo.

## Các rủi ro có thể xảy ra & Ràng buộc hệ thống

Hệ thống được thiết kế dưới giả định phải đối mặt với các tình huống sau:

- Tranh chấp tài nguyên (Concurrency): Rủi ro hàng trăm request cùng ghi đè lên một bản ghi giới hạn chỗ ngồi.
  - Ràng buộc: Áp dụng cơ chế trừ chỗ bằng Atomic Counter trên bộ nhớ đệm (In-memory Database) kết hợp hàng đợi xử lý bất đồng bộ để đảm bảo tốc độ và tính toàn vẹn dữ liệu, thay vì dùng Database Lock truyền thống dễ gây nghẽn cổ chai.
- Tấn công hoặc quá tải lưu lượng: Rủi ro backend sập do 12000 request.
  - Ràng buộc: Phải giới hạn tần suất request (Rate Limiting) ở gateway và phân luồng xử lý bất đồng bộ (Queue) cho các tác vụ nặng.
- Hệ thống bên thứ 3 bất ổn: Cổng thanh toán có thể timeout, không trả về kết quả.
  - Ràng buộc: Giao diện xem lịch không được chết theo cổng thanh toán; giao dịch phải có Idempotency Key để an toàn khi retry.
- Kiểm soát truy cập người dùng: Login Google có thể phát sinh tài khoản ngoài đối tượng tham gia.
  - Ràng buộc: Bắt buộc áp dụng chính sách allowlist theo domain/email (`ALLOWED_EMAIL_DOMAINS`, `ALLOWED_ADMIN_EMAILS`, `ALLOWED_STAFF_EMAILS`, `ALLOWED_USER_EMAILS`) trước khi cấp quyền truy cập hệ thống.
- Phân mảnh dữ liệu (Data Inconsistency): Rớt mạng khi đang check-in dẫn đến sai lệch số liệu điểm danh.
  - Ràng buộc: Mobile app phải là Single Source of Truth tạm thời khi offline và giải quyết xung đột (conflict resolution) an toàn cho đến khi online trở lại.
- Dữ liệu “bẩn” từ hệ thống cũ: File CSV import định kỳ có thể sai định dạng, có dữ liệu rác, trùng lặp hoặc thiếu trường.
  - Ràng buộc: Phải có cơ chế validate chặt chẽ, upsert an toàn và không làm gián đoạn luồng người dùng đang hoạt động.
