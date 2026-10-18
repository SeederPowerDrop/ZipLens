# ZipLens: giới thiệu, tính năng và hướng dẫn

[Tất cả ngôn ngữ](README.md) · Cập nhật: 18/10/2026

ZipLens là ứng dụng nén tệp miễn phí, không quảng cáo dành cho macOS, do SeederPowerDrop phát triển. Bạn có thể xem nội dung trước khi giải nén và chỉ lấy những tệp cần thiết. Hình thấu kính hội tụ biểu thị việc nén; ánh sáng phân kỳ biểu thị việc giải nén.

## Cài đặt

Tải `ZipLens_2.1.3_arm64-preview.dmg` từ [bản phát hành 2.1.3](https://github.com/SeederPowerDrop/ZipLens/releases/tag/v2.1.3). Hoàn tất công việc và thoát bản cũ bằng ⌘Q. Mở DMG rồi kéo `ZipLens.app` vào lối tắt **Applications** trong cửa sổ hiện ra. Sao lưu bản cũ trước khi thay thế. Tháo ổ đĩa DMG khỏi Finder, mở ZipLens từ Applications và kiểm tra phiên bản **2.1.3** tại **ⓘ**.

Ứng dụng đi kèm là bản xem trước cho Apple Silicon, chỉ có chữ ký ad-hoc, chưa được ký bằng Apple Developer ID hoặc công chứng; macOS có thể chặn mở. Chưa xác minh trên Intel Mac. Bản tải về là **2.1.3**; nhánh `main` có thể chứa thay đổi **Unreleased (chưa phát hành)**. Cập nhật mã nguồn không cập nhật ứng dụng đã cài.

## Tính năng

- Tạo **ZIP, 7Z, TAR, TAR.GZ, TAR.ZST**. Giao diện ZIP/7Z hỗ trợ mật khẩu và chia phần. ZIP mặc định dùng AES-256; 7Z có mật khẩu còn mã hóa danh sách tên. TAR chỉ gom tệp; các định dạng TAR không có mật khẩu hoặc chia phần. Mật khẩu tạo ZIP cần ASCII in được; dùng 7Z cho chữ có dấu hoặc Unicode khác.
- Duyệt thư mục, tìm tên, chọn tệp, hủy và xem kết quả. Ảnh/văn bản được hỗ trợ, nhỏ hơn **20 MiB**, có thể xem trong ứng dụng; tệp khác được giải nén tạm để mở bằng ứng dụng mặc định. Phần xem trước văn bản chỉ đọc UTF-8; nếu nội dung dùng mã hóa cũ bị lỗi hiển thị, hãy giải nén rồi mở bằng trình soạn thảo hỗ trợ mã hóa đó—lỗi hiển thị này không đồng nghĩa với việc các byte gốc bị thay đổi khi giải nén.
- ALZ, EGG và các định dạng khác có thể được mở để giải nén. Không phải mọi biến thể đều được hỗ trợ; xem [giới hạn định dạng](../../README.md#지원-범위).
- Có JSON CLI cho tự động hóa; xem [tài liệu CLI](../AI_CLI.md). CLI chưa có tùy chọn tạo tệp chia phần.

## Mở và giải nén

1. Thả tệp nén vào cửa sổ hoặc dùng nút mở tệp. Nếu chỉ chọn nhiều tệp nén, ứng dụng mở tệp đầu và thông báo.
2. Duyệt, tìm kiếm, chọn tất cả hoặc đánh dấu từng tệp. Nhấp đúp để xem hoặc mở.
3. Chọn giải nén, thư mục đích và nhập mật khẩu khi được hỏi. Giải nén tự động lưu cạnh tệp gốc, tạo thư mục mang tên tệp nén nếu có nhiều mục cấp cao nhất được chọn.
4. Chọn cách xử lý tên trùng rồi kiểm tra đường dẫn thực tế và lỗi. Tệp đã hoàn tất có thể còn lại sau khi hủy hoặc lỗi. Giữ các phần của tệp nén cùng thư mục và mở phần đầu.

## Tạo tệp nén

Thả hoặc chọn tệp/thư mục, đặt định dạng và tùy chọn, nén các mục đã chọn rồi chỉ định tên và nơi lưu. Chọn lẫn tệp nén và tệp thường cũng tạo một tệp nén mới. Bạn cũng có thể bắt đầu bằng nút tạo tệp nén. Dùng mức cân bằng trước; mức nhanh ưu tiên thời gian, mức tối đa có thể lâu hơn. Ảnh/video đã nén có thể giảm rất ít.

## Ngôn ngữ và thông tin

Đổi ngôn ngữ ở phía trên; tiếng Ả Rập đọc từ phải sang trái. Hộp thoại macOS theo ngôn ngữ hệ thống; lỗi chi tiết có thể dùng ngôn ngữ khác. Cài đặt ứng dụng nén mặc định đổi ứng dụng mở tệp trong Finder, không đổi lệnh nén của Finder.

**ⓘ** chứa phiên bản, tác giả, hướng dẫn sử dụng và hỗ trợ tự nguyện. Liên kết hướng dẫn trên màn hình chính và trong **ⓘ** mở trang GitHub theo ngôn ngữ đang chọn bằng trình duyệt mặc định. Nếu không thể mở trình duyệt, ứng dụng hiển thị hướng dẫn tích hợp kèm thông báo. Nút giấy phép mã nguồn mở mở thư mục giấy phép trong Finder. Địa chỉ Bitcoin và mã QR cũng ở đây.

## Tên tệp và hiệu năng

Ngôn ngữ giao diện khác với mã hóa tên tệp. Hỗ trợ UTF-8 và thông tin đường dẫn Unicode hợp lệ của ZIP. ZIP cũ không ghi mã hóa dùng cách đọc tương thích CP949 tiếng Hàn; không thể luôn đoán đúng Shift-JIS/CP932, GBK hoặc CP437 thiếu nhãn. Khi cần, nhờ người tạo dùng ZIP UTF-8 hoặc 7Z. Đổi ngôn ngữ không sửa tên lỗi; giải nén không dịch nội dung hoặc đổi mã hóa văn bản.

Tốc độ phụ thuộc định dạng, số tệp, mức nén và ổ đĩa. [Hồ sơ kiểm thử](../VALIDATION.md) nêu điều kiện và giới hạn, không bảo đảm mọi tệp đều không lỗi.

## Quyền phần mềm, đóng góp và hỗ trợ

“**Quyền cơ bản về phần mềm**” là giá trị phát triển: mọi người, bất kể thu nhập hay ngôn ngữ, nên được dùng công cụ số cơ bản, học, sửa, chia sẻ mã và đóng góp. Con người và AI cùng chia sẻ kiến thức, học hỏi và sáng tạo.

Mã của ZipLens dùng [GPL-3.0-only](../../LICENSE); thành phần bên thứ ba giữ giấy phép riêng. Hoan nghênh đóng góp. [Buy Me a Coffee](https://buymeacoffee.com/master_chief) và [Ko-fi](https://ko-fi.com/seederpower) là tự nguyện. Mong bản sửa đổi giữ liên kết dự án gốc và hỗ trợ tác giả; đây không phải điều kiện bổ sung của GPL.
