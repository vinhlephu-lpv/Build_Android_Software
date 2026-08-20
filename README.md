# 🚀 Build Android Software (RN Android Device Runner & Builder)

> **Công cụ Desktop quản lý Build và Giả lập/Tương tác ứng dụng React Native CLI trên giao diện thiết bị Android**

---

## 📌 1. Giới thiệu tổng quan & Mục tiêu dự án

### 🎯 Mục tiêu cốt lõi
Dự án **Build Android Software** được phát triển nhằm phục vụ nhu cầu cá nhân: tạo ra một công cụ/phần mềm desktop mạnh mẽ, gọn nhẹ và trực quan giúp lập trình viên:
1. **Build trực tiếp** các ứng dụng React Native được khởi tạo bằng React Native CLI (dự án tham khảo điển hình: `ExampleApp`).
2. **Hiển thị giao diện (UI)** của ứng dụng React Native ngay trên phần mềm thông qua một khung thiết bị Android (Device Frame / Simulator).
3. **Tương tác trực tiếp** như trên một thiết bị Android thật (chạm, vuốt, cuộn, nhập liệu bàn phím, điều hướng Back/Home/Recent).
4. **Tối ưu hóa quy trình phát triển**: Tự động hóa việc kích hoạt Metro Bundler, biên dịch Gradle, cài đặt APK, stream màn hình và giám sát logs/console trong một không gian làm việc duy nhất.

---

## 💡 2. Ý tưởng thiết kế & Kiến trúc kỹ thuật

### 🏗️ 2.1. Hướng tiếp cận kỹ thuật (Architecture Approaches)
Để đạt được hiệu năng cao, độ mượt mà và hiển thị chính xác 100% UI/Native Modules của React Native CLI, giải pháp được thiết kế xoay quanh mô hình **Desktop App + ADB/Scrcpy Engine + Metro Controller**:

```
+-----------------------------------------------------------------------+
|                    BUILD ANDROID SOFTWARE (DESKTOP UI)                |
|                                                                       |
|  +---------------------------+  +----------------------------------+  |
|  |    BẢNG ĐIỀU KHIỂN CHÍNH  |  |    MÀN HÌNH THIẾT BỊ ANDROID     |  |
|  |  - Chọn dự án RN          |  |                                  |  |
|  |  - Nút: Build Debug/Release|  |   +--------------------------+   |  |
|  |  - Nút: Start/Stop Metro  |  |   | [Status Bar]             |   |  |
|  |  - Reload JS / Open Menu  |  |   |                          |   |  |
|  |  - Đổi cấu hình thiết bị  |  |   |   UI REACT NATIVE APP    |   |  |
|  +---------------------------+  |   |   (ExampleApp rendered)  |   |  |
|                                 |   |                          |   |  |
|  +---------------------------+  |   |   Hỗ trợ Touch/Swipe/    |   |  |
|  |  CONSOLE & LOGCAT VIEWER  |  |   |   Drag & Text Input      |   |  |
|  |  - Metro Bundler Logs     |  |   |                          |   |  |
|  |  - Gradle Build Output    |  |   +--------------------------+   |  |
|  |  - Android Logcat Filter  |  |   | [Android Nav: ◀  ●  ■ ]  |   |  |
|  +---------------------------+  +----------------------------------+  |
+-----------------------------------------------------------------------+
```

### 🧩 2.2. Các thành phần chính của hệ thống
1. **Core Build Engine (Bộ điều khiển Build)**:
   - Tự động phát hiện cấu hình dự án React Native (`package.json`, `android/gradlew`, `android/app/build.gradle`).
   - Thực thi các lệnh biên dịch Android (`./gradlew assembleDebug`, `react-native run-android`) ngầm và stream tiến trình chi tiết ra console.
2. **Metro Bundler Manager**:
   - Quản lý vòng đời Metro Server (Khởi động, Khởi động lại, Dừng, Xoá cache `--reset-cache`).
   - Tích hợp phím tắt Hot Reload / Fast Refresh.
3. **Android Device Runtime & Screen Streamer**:
   - Kết nối với Virtual Device (AVD / Headless Android / WSA / Thiết bị thật / Micro-runtime) qua giao thức ADB.
   - Nhận luồng video hiển thị thời gian thực (H.264/H.265 stream) với độ trễ siêu thấp (< 30ms).
   - Truyền ngược sự kiện người dùng (Mouse Click $\rightarrow$ Touch Event, Mouse Drag $\rightarrow$ Swipe Event, Keydown $\rightarrow$ Keycode/Text Input).
4. **Workspace & Project Selector**:
   - Quản lý danh sách các dự án React Native, mở nhanh dự án như `ExampleApp`.

---

## 📋 3. Phân chia phạm vi & Kế hoạch triển khai

### ✅ GIAI ĐOẠN 1: TẬP TRUNG HIỆN TẠI (Phase 1 - MVP Core)
*Mục tiêu tối thượng: Build thành công app và tương tác được UI trên phần mềm.*

- [ ] **Khởi tạo dự án phần mềm `Build_Android_Software`**:
  - Lựa chọn công nghệ Desktop GUI hiện đại (Electron / Tauri / Webview Engine) với giao diện Dark Mode cao cấp.
- [ ] **Mô-đun Quản lý Dự án & Build**:
  - Giao diện chọn đường dẫn thư mục dự án React Native (ví dụ: `d:\My_Software\ExampleApp`).
  - Kiểm tra môi trường: Node.js, JDK, Android SDK Path (`ANDROID_HOME`), ADB.
  - Chức năng kích hoạt Build APK Debug & tự động theo dõi lỗi build nếu có.
- [ ] **Mô-đun Khung hiển thị & Tương tác thiết bị (Device Simulator Frame)**:
  - Khung viền mô phỏng điện thoại Android thời thượng (khung viền bezel, camera notch, status bar).
  - Tích hợp engine hiển thị màn hình trực tiếp từ thiết bị/giả lập Android qua ADB stream.
  - Hỗ trợ thao tác cảm ứng chuột: Click (Chạm), Giữ chuột & Kéo (Vuốt/Cuộn), Gõ phím (Nhập text vào TextInput).
  - Thanh điều hướng ảo: Nút Back (Quay lại), Home (Màn hình chính), Recents (Đa nhiệm).
- [ ] **Mô-đun Metro & Dev Tools Controller**:
  - Bật/Tắt Metro Bundler tự động.
  - Nút bấm nhanh "Reload App" (R + R) và "Open Dev Menu" (Ctrl + M / Shake).
  - Tab hiển thị Logcat & Metro console output.

---

### ⏳ GIAI ĐOẠN 2: TÍNH NĂNG TẠM HOÃN / ĐỂ DÀNH CHO TƯƠNG LAI (Phase 2 - Deferred Features)
*Lưu ý: Các tính năng dưới đây được ghi nhận đầy đủ để phát triển sau khi Phase 1 hoàn tất ổn định, tránh phân tán tài nguyên.*

- [ ] 🔔 **Hệ thống Quản lý Thông báo (Push & Local Notifications)**:
  - Trình giả lập bắn thông báo thử nghiệm (Mock FCM / Local Notification injector).
  - Giao diện soạn payload JSON thông báo để gửi trực tiếp vào app đang chạy.
  - Giả lập tương tác khi bấm vào Notification Banner / Notification Center.
- [ ] 📍 **Bộ giả lập Vị trí & Cảm biến (GPS & Sensors Mock)**:
  - Giả lập toạ độ GPS (Mock Location Provider) với bản đồ trực quan.
  - Giả lập xoay màn hình (Orientation / Accelerometer / Gyroscope).
  - Giả lập trạng thái Pin (Battery level, Charging state).
- [ ] 📷 **Giả lập Camera & Microphone**:
  - Mock camera feed (sử dụng webcam máy tính hoặc hình ảnh/video tĩnh để test tính năng chụp ảnh/quét QR trong app).
- [ ] 🗄️ **Trình quản lý & Xem dữ liệu ứng dụng (Storage & Database Viewer)**:
  - Xem và chỉnh sửa trực tiếp `AsyncStorage`, `MMKV`, `SQLite / Realm` data của ứng dụng đang chạy.
- [ ] 🌐 **Network Inspector & API Mocking**:
  - Bắt gói tin HTTP/HTTPS, kiểm tra request/response của React Native tương tự Flipper/Charles Proxy.
- [ ] 🎨 **Quản lý đa thiết bị & Tùy biến Màn hình (Device Profiles)**:
  - Lựa chọn nhiều kích cỡ màn hình khác nhau (Điện thoại Flagship, Tablet, Màn hình gập Fold).
  - Điều chỉnh DPI, tỷ lệ hiển thị, theme Sáng/Tối hệ thống (Dark/Light mode toggle).

---

## 🛠️ 4. Hướng dẫn quy trình hoạt động dự kiến

1. **Khởi chạy phần mềm `Build_Android_Software`**.
2. **Chọn thư mục dự án React Native**: Chọn thư mục `ExampleApp`.
3. **Nhấn "Build & Run"**:
   - Phần mềm kiểm tra thiết bị Android (ảo hoặc thật).
   - Tự động chạy Metro Server trên cổng `8081`.
   - Thực thi biên dịch Gradle và cài đặt APK lên thiết bị.
4. **Trải nghiệm & Thao tác**:
   - Màn hình app xuất hiện trên giao diện phần mềm.
   - Thao tác tương tác bằng chuột/bàn phím như trên điện thoại thật.
   - Chỉnh sửa code trong `ExampleApp/App.tsx` $\rightarrow$ Thấy kết quả cập nhật tức thì trên màn hình.

---

## 📂 5. Cấu trúc thư mục dự kiến (`Build_Android_Software`)

```
Build_Android_Software/
├── README.md                  # Tài liệu mục tiêu, kiến trúc & lộ trình dự án (File này)
├── package.json               # Cấu hình dự án desktop app
├── src/
│   ├── main/                  # Tiến trình chính (Main Process: Quản lý Build, ADB, Metro, Window)
│   │   ├── services/
│   │   │   ├── adbService.js        # Giao tiếp ADB, quản lý thiết bị & truyền lệnh
│   │   │   ├── buildService.js      # Thực thi lệnh build Gradle / React Native CLI
│   │   │   ├── metroService.js      # Điều khiển Metro Bundler server
│   │   │   └── streamerService.js   # Xử lý video stream và touch/input events
│   ├── renderer/              # Giao diện người dùng (Renderer Process UI)
│   │   ├── components/
│   │   │   ├── DeviceFrame/         # Khung mô phỏng điện thoại & Canvas hiển thị màn hình
│   │   │   ├── ControlToolbar/      # Thanh công cụ (Build, Reload, Dev Menu, Settings)
│   │   │   ├── ConsoleViewer/       # Màn hình xem logs (Metro + Gradle + Logcat)
│   │   │   └── ProjectPicker/       # Bộ chọn và kiểm tra dự án RN
│   │   ├── styles/
│   │   └── index.html
└── assets/                    # Biểu tượng, skin thiết bị, âm thanh tương tác
```

---

*Tài liệu này là kim chỉ nam cho quá trình nghiên cứu, thiết kế và phát triển phần mềm. Mọi tính năng mới sẽ được đối chiếu với lộ trình tại đây.*
