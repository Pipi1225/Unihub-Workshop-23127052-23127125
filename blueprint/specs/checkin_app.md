# Đặc tả: Ứng dụng Check-in Offline (Offline-first Check-in App)

## Mô tả

Tính năng này dành riêng cho nhân sự vận hành tại cửa sự kiện (Role: CHECKIN_STAFF), sử dụng Mobile App (Expo React Native). Ứng dụng cho phép nhân sự quét mã QR của sinh viên để điểm danh.

Điểm mấu chốt của tính năng là kiến trúc Offline-first: Mọi thao tác kiểm tra vé và điểm danh đều giao tiếp trực tiếp với cơ sở dữ liệu cục bộ (Expo SQLite) trên điện thoại. Điều này đảm bảo tốc độ quét cực nhanh (< 2 giây) và hệ thống vẫn hoạt động trơn tru 100% ngay cả khi khu vực tổ chức bị rớt mạng Internet hoàn toàn, sau đó tự động đồng bộ (sync) lên server khi có mạng.

**Trạng thái triển khai hiện tại (local)**:
- App đã triển khai đầy đủ luồng offline-first, pull/push sync, retry và background sync.
- App đã có màn hình login staff (email/mật khẩu) và **đã** đính kèm `Authorization: Bearer <token>` khi gọi API sync.

## Luồng chính

Kiến trúc Offline-first chia luồng hoạt động thành 3 giai đoạn tách biệt:

### 2.0: Đăng nhập staff (Email/Password)

**Bối cảnh**: Nhân sự check-in mở app lần đầu trong ngày.

**Các bước:**

- **B1. Nhập thông tin**: Nhân sự nhập email và mật khẩu được cấp.
- **B2. Gọi API**: App gọi POST /api/auth/login.
- **B3. Xác thực**: Backend kiểm tra email/mật khẩu và role `CHECKIN_STAFF`.
- **B4. Lưu token**: App lưu Access Token (AsyncStorage) để dùng cho các API sync tiếp theo.

### 2.1: Tải dữ liệu đầu ngày (Pre-fetch / Pull Sync)

**Bối cảnh**: Đầu ngày sự kiện, nhân sự check-in kết nối WiFi ổn định, mở app và chuẩn bị đón sinh viên.

**Các bước:**

- **B1. Trigger**: Nhân sự chọn Workshop (nhập mã) mình phụ trách và chọn "Đồng bộ dữ liệu".

- **B2. Fetch Data**: Mobile App gọi API GET /api/sync-data?workshop_id=XYZ.

  - Theo thiết kế bảo mật backend, endpoint này yêu cầu role `CHECKIN_STAFF` (JWT).
  - App tự đính kèm Header `Authorization: Bearer <Access_Token>` từ bước 2.0.

- **B3. Xử lý Server**: Backend truy vấn PostgreSQL, trả về danh sách toàn bộ các vé hợp lệ của workshop đó (bao gồm: registration_id, qr_code_hash, workshop_id, checkin_status, checkin_time, full_name).

- **B4. Lưu Cục bộ (Local Storage)**: Mobile App lưu (Upsert) toàn bộ danh sách này vào Local Database (Expo SQLite). Giao diện báo: "Sync complete".

### 2.2: Quét mã QR tại cửa (Offline Processing)

**Bối cảnh**: Mạng Internet chập chờn hoặc rớt hẳn. Sinh viên đưa mã QR ra để quét.

**Các bước:**

- **B1. Quét mã**: Camera điện thoại đọc mã QR, giải mã ra chuỗi qr_code_hash.

- **B2. Truy vấn Local DB**: Mobile App KHÔNG gọi API. Nó truy vấn trực tiếp vào bảng Expo SQLite cục bộ: `SELECT * FROM local_registrations WHERE qr_code_hash = <chuỗi vừa quét> AND workshop_id = <mã workshop nhập ở 2.1>`.

- **B3. Xác thực & Trích xuất**: Tìm thấy bản ghi vé, kiểm tra thấy checkin_status == false. App trích xuất thông tin full_name (đã được tải về từ bước 2.1) từ bản ghi này.

- **B4. Cập nhật Local**: App cập nhật trạng thái vé vào bảng SQLite cục bộ: `UPDATE local_registrations SET checkin_status = true, checkin_time = <thời gian hiện tại>, sync_status = 'PENDING'`.

- **B5. Phản hồi**: Màn hình điện thoại chớp xanh, rung, kết hợp hiển thị full_name lấy từ B3: "Check-in success - [Tên sinh viên]". Thời gian từ lúc đưa QR vào camera đến lúc báo thành công < 1 giây.

### 2.3: Đồng bộ lên Server (Push Sync)

**Bối cảnh**: Điện thoại của nhân sự nhận lại được sóng 4G/WiFi.

**Các bước:**

- **B1. Lắng nghe trạng thái mạng**:
  - **Khi App đang mở (Foreground)**: Sử dụng thư viện @react-native-community/netinfo để lắng nghe thay đổi trạng thái mạng. Ngay khi sự kiện isConnected chuyển sang true, app tự động kích hoạt hàm gom dữ liệu đẩy lên server.
  - **Khi App được mở lại (từ Background sang Foreground)**: Sử dụng AppState để tự động kích hoạt push dữ liệu pending ngay khi app hoạt động trở lại.
  - **Khi App chạy ngầm (Background) hoặc bị đóng**: Sử dụng expo-background-fetch kết hợp expo-task-manager. Hệ điều hành sẽ quyết định thời điểm đánh thức tác vụ (khoảng 15 phút/lần trên iOS và tùy trạng thái Doze trên Android). Phải chấp nhận và ghi rõ trong tài liệu là đồng bộ ngầm sẽ có độ trễ, không thể "ngay lập tức".

- **B2. Gom dữ liệu**: App quét trong Local SQLite những bản ghi có sync_status = 'PENDING' và gom thành một mảng JSON (Batch payload).

- **B3. Đẩy dữ liệu**: App gọi API PUT /api/registrations/sync đính kèm mảng JSON lên Backend.

  - Theo thiết kế bảo mật backend, endpoint này yêu cầu role `CHECKIN_STAFF` (JWT).
  - App tự đính kèm Header `Authorization: Bearer <Access_Token>` từ bước 2.0.

- **B4. Hợp nhất (Merge)**: Backend nhận dữ liệu, cập nhật bảng Registrations trên PostgreSQL.

- **B5. Xác nhận**: Backend trả về 200 OK. Mobile App nhận phản hồi và cập nhật lại sync_status = 'SYNCED' dưới SQLite.

## Kịch bản lỗi

### 3.1. Quét mã QR giả mạo (Invalid QR Hash)

**Trigger**: Sinh viên tự tạo một mã QR chứa bừa một đoạn text hoặc ID giả và đưa cho nhân sự quét.

**Xử lý**: Truy vấn qr_code_hash không tồn tại trong Local SQLite. App báo lỗi "QR code not found for this workshop.". Không có dòng dữ liệu nào được ghi nhận.

### 3.2. Quét mã QR đã check-in (Double Check-in)

**Trigger**: Sinh viên mượn mã QR của bạn bè (người đã vào cửa trước đó) chụp màn hình lại để xin vào theo.

**Xử lý**: Truy vấn Local SQLite thấy bản ghi có checkin_status == true. App hiển thị cảnh báo: "Already checked in [Tên sinh viên] at [checkin_time]". Nhân sự từ chối cho qua cửa.

### 3.3. Xung đột dữ liệu Check-in Offline (Distributed Conflict)

**Trigger**: Sự kiện có 2 cửa ra vào (Cửa A và Cửa B) cùng bị rớt mạng. Sinh viên chụp màn hình vé gửi cho staff. Sinh viên cầm máy thật đi vào Cửa A (quét ok). Người bạn cầm ảnh chụp đi vào Cửa B (quét ok do Cửa B offline chưa kịp cập nhật trạng thái từ Cửa A).

**Xử lý (First Write Wins)**: Khi có mạng, cả máy A và máy B cùng đẩy dữ liệu lên Backend.

- Backend kiểm tra: Cả 2 payload đều yêu cầu check-in cho cùng 1 registration_id, nhưng checkin_time ở máy A là 08:00:05, ở máy B là 08:05:10.
- Backend áp dụng luật "First Write Wins": Chỉ ghi nhận lượt check-in của Cửa A (do thời gian sớm hơn), từ chối bản ghi của Cửa B và log lại sự cố "Có dấu hiệu gian lận vé" để Admin nắm thông tin. Đây là trường hợp bất khả kháng, tuy nhiên dẫu B đã có thể trót lọt vào cổng thì ban tổ chức vẫn có thể truy ra được và xử lý sau.

### 3.4. Lỗi mạng chập chờn khi đang Push Sync

**Trigger**: Đang gọi API đẩy batch data lên server thì rớt mạng, API trả về timeout hoặc lỗi 5xx.

**Xử lý**: Mobile App catch lỗi HTTP. Giữ nguyên trạng thái sync_status = 'PENDING' trong SQLite để không làm mất dữ liệu. App thiết lập cơ chế thử lại (Retry) áp dụng chiến thuật Exponential Backoff (thử lại sau 15p, 30p, 1h...). Để đảm bảo tiến trình này không bị mất trạng thái, thông tin backoff (số lần đã thử, thời gian thử lại kế tiếp) sẽ được lưu kiên định (persisted) vào AsyncStorage. Nếu app bị hệ điều hành tắt ngầm (kill), quá trình retry sẽ tự động tiếp tục khi app được mở lại (thông qua AppState) hoặc khi BackgroundFetch được hệ điều hành đánh thức.

## Ràng buộc

### Tốc độ phản hồi (Performance)

Quá trình quét và xác thực QR ngoại tuyến phải hoàn thành dưới 2 giây/lượt để tránh ùn tắc ở cửa ra vào.

### Bảo mật mã QR

Dữ liệu chứa trong mã QR KHÔNG ĐƯỢC là user_id hay thông tin dễ đoán. Nó phải là chuỗi qr_code_hash (VD: sha256) được server tạo ra ngẫu nhiên khi đăng ký, chỉ có ý nghĩa khi dùng để đối chiếu.

### Single Source of Truth (SSOT)

Khi đang ở trạng thái Offline, Local SQLite trên thiết bị là Nguồn chân lý duy nhất (SSOT). Khi kết nối Online trở lại, PostgreSQL trên Server sẽ tiếp quản lại vai trò SSOT.

## Tiêu chí chấp nhận

### Test Case 1 (Offline Mode)

Mở app, tải dữ liệu sự kiện (sau khi đã có dữ liệu local hợp lệ). Sau đó TẮT hoàn toàn WiFi/4G (chuyển sang Airplane mode). Thực hiện quét 1 mã QR hợp lệ. Giao diện báo thành công. Đóng app, mở lại, số liệu điểm danh cục bộ vẫn được giữ nguyên.

### Test Case 2 (Sync Behavior)

Bật WiFi trở lại cho thiết bị ở Test Case 1. Nếu ứng dụng đang được mở (Foreground), trong vòng 1 phút kiểm tra Database PostgreSQL trên Server, trạng thái vé của sinh viên đó phải chuyển thành checkin_status = true.

_(Lưu ý: Nếu ứng dụng đang chạy ngầm hoặc bị đóng, thời gian đồng bộ có thể trễ hơn 1 phút do phụ thuộc hoàn toàn vào chu kỳ cấp phát tài nguyên Background Fetch của hệ điều hành)._

### Test Case 3 (Security Test)

Tự dùng công cụ tạo một mã QR chứa chữ "123456" rồi dùng app quét. Hệ thống từ chối truy cập.
