# Báo cáo e2e: luồng mua hàng bằng chat (tìm sản phẩm → tạo đơn)

Chạy ngày 2026-11-06 trên môi trường dev (web chạy `next dev`, model **gpt-4.1-2025-04-14**, Agent mặc định), theo [kịch bản test](test-scenario-mua-hang.md). Mỗi bước gọi API thật của widget (`POST /api/chat` dạng SSE và `POST /api/chat/confirmations/:id` cho nút Xác nhận/Huỷ) bằng một "trình duyệt" có cookie riêng, rồi kiểm tra Postgres (giỏ, thẻ xác nhận, đơn, tồn kho).

## Kết quả

**41/43 bước đạt theo harness; tính cả đánh giá thủ công thì 42/43 đạt, 1 không đạt (F1).** 104 điều kiện kiểm tra. Thời gian mỗi lượt: trung bình 3.7s, trung vị 3.2s, lâu nhất 11.2s.

| Điều cần xác nhận | Kết quả |
|---|---|
| Đi trọn luồng: chào → tìm → chọn → giỏ → thu thập → thẻ xác nhận → đơn → tra đơn | Đạt |
| Số tiền (778.000 + 30.000 = **808.000₫**) khớp ở lời Agent, thẻ xác nhận và DB (`subtotal 778000, shipping 30000, total 808000`) | Đạt |
| Mốc miễn phí giao hàng: 1.177.000₫ → phí 0; 818.000₫ (788.000 + 30.000) và 419.000₫ → phí 30.000₫ | Đạt |
| Agent không tự điền họ tên, SĐT, địa chỉ; hỏi từng phần còn thiếu | Đạt |
| Từ chối SĐT sai, thanh toán thẻ (chỉ COD), giỏ trống, thiếu SĐT | Đạt |
| Chưa có đơn nào trước khi khách bấm Xác nhận; Agent không nói "đã đặt" trước đó | Đạt |
| Bấm Huỷ: không có đơn, giỏ giữ nguyên, thẻ `cancelled` | Đạt |
| Giỏ bị đổi sau khi thẻ hiện, rồi bấm Xác nhận: **không tạo đơn** | Đạt |
| Bấm Xác nhận lặp: đúng 1 đơn | Đạt |
| Hủy đơn chưa thanh toán: đơn `cancelled`, **tồn kho hoàn lại** (PL-002/M 20 → 18 → 20) | Đạt |
| Đơn đã giao (FT-2026-1001) không hủy được | Đạt |
| Tra đơn của chính trình duyệt không cần SĐT; đơn người khác phải có SĐT, không lộ trạng thái khi thiếu SĐT | Đạt |
| Prompt injection bị chặn trước khi gọi model (0,4 giây, không có tool) | Đạt |
| Agent **không tự đoán size/màu** khi khách chưa chọn | **Không đạt** (F1) |

## Phát hiện

**F1 (trung bình): Agent tự chọn size và màu khi khách chưa nói (bước 3.5).** Khách gõ `Thêm 1 đôi tất`. Tất PK-004 có 6 biến thể (2 size × 3 màu). Agent gọi `search_products` rồi `add_to_cart` với size 39–42 và màu Đen, dù hướng dẫn ghi "không đoán size hay màu thay khách". Giỏ chỉ chứa 1 món 159.000₫ nên khách sửa được ngay, không mất tiền. Nhưng đây là vi phạm quy tắc, và với model yếu hơn có thể nặng hơn. Mới chạy một lần nên chưa biết tần suất.

Gợi ý sửa, theo thứ tự tôi nghiêng:
1. Chốt bằng code: `add_to_cart` chỉ nhận size/màu mà khách đã nêu trong vài tin gần nhất (giống cách đã làm với số điện thoại, hàm `phoneStated`). Khi thiếu, trả `not_allowed` kèm danh sách phiên bản để model hỏi lại.
2. Hoặc chỉ sửa prompt (nhấn mạnh quy tắc, thêm ví dụ). Cách này không đảm bảo tuyệt đối.

**F2 (thấp, UX): Khi giỏ đổi sau lúc hiện thẻ, Agent không giải thích.** Ở bước 5.4b, khách bấm Xác nhận sau khi giỏ giảm từ 2 còn 1 cái. Hệ thống đúng: không tạo đơn, thẻ cũ chuyển `failed`. Agent tự gọi `view_cart` và hiện ngay thẻ mới (1 cái, 419.000₫) để khách xác nhận lại. An toàn, nhưng không có câu nào báo "giỏ đã thay đổi". Gợi ý: thêm một dòng vào prompt "nếu đặt hàng bị từ chối vì giỏ đổi, nói rõ cho khách trước khi đưa thẻ mới". Check "confirmation = failed" của harness báo lỗi vì dòng cuối là thẻ mới (`pending`); thẻ đầu đúng là `failed`.

**F3 (thấp): Xác nhận song song hai request chỉ có một thắng, request kia nhận lỗi chung.** Bước 5.5b gửi hai lần Xác nhận cùng lúc. Chỉ 1 đơn được tạo (đạt). Request thua nhận sự kiện lỗi "Không thể hoàn tất câu trả lời" (log: `Yêu cầu đang được xử lý`); lần thứ ba sau đó nhận "Thao tác này đã được xử lý trước đó". Trên widget thật, nút bị khóa ngay khi bấm nên khó gặp, chỉ có thể xảy ra khi mở hai tab.

**Quan sát (không tính lỗi):** ở 4.2 Agent tự thêm 2 cái (hết tồn) khi khách xin 5, rồi hỏi lại có muốn tiếp tục không. Hợp lý, nhưng khách chưa đồng ý số lượng 2.

## Chưa kiểm tra

- **Giao diện widget**: phần API ở trên không kiểm tra giao diện; xem mục "Kiểm thử giao diện" bên dưới.
- **5.6** thẻ xác nhận hết hạn và **kịch bản 7** giới hạn 5 đơn/giờ: không chạy.
- Mỗi kịch bản chạy **một lần**. Model sinh câu trả lời khác nhau mỗi lần nên F1 có thể xuất hiện hoặc không ở lần khác.
- Với 4.5 đến 4.8 và 5.x, giỏ được nạp thẳng bằng SQL (không qua chat) để tiết kiệm lượt gọi model.

## Kiểm thử giao diện (trình duyệt thật)

Chạy bằng Google Chrome headless (Playwright), thao tác như khách: mở widget, gõ từng câu, bấm nút, chuyển trang; rồi đăng nhập admin (cookie phiên) xem đơn. Tất cả trên dev server, model gpt-4.1. Ảnh chụp từng bước nằm ở `shots/` trong thư mục scratchpad của phiên (không đưa vào repo).

**Kết quả: 30/30 điều kiện đạt** ở lần chạy cuối (sau khi sửa F4 bên dưới), gồm:

- Trang chủ có nút chat; header giỏ hàng trống; widget mở với lời chào và gợi ý.
- Tìm sản phẩm: có mã và giá, hiện **ô sản phẩm** (ảnh, giá, size, "Xem chi tiết").
- Thêm vào giỏ: **badge giỏ ở header cập nhật ngay** (2 sản phẩm), Agent nêu tổng 808.000₫.
- Thiếu thông tin thì chưa có thẻ xác nhận. Đủ thông tin thì hiện **thẻ xác nhận** (sản phẩm, tạm tính, phí giao hàng, tổng, người nhận, địa chỉ, COD) với nút **Xác nhận** và **Huỷ**; **ô nhập bị khóa** ("Hãy bấm Xác nhận hoặc Huỷ ở trên…"); chưa có đơn trong DB.
- Bấm Xác nhận: Agent báo mã đơn; badge giỏ biến mất; ô nhập mở lại; DB đúng (COD, đang xử lý, 808.000₫).
- Trang `/orders/FT-…` của khách: đúng sản phẩm, tạm tính, phí giao hàng, tổng, nút "Hủy đơn". Trang giỏ hàng trống.
- Admin → Đơn hàng thấy đơn; chi tiết đơn đúng tên, SĐT, địa chỉ, tổng, dòng thời gian.
- Chuyển trang: widget **vẫn mở** và nạp lại hội thoại (đúng thiết kế, lưu trong sessionStorage).
- Hủy đơn bằng chat: thẻ xác nhận hủy, bấm Xác nhận, đơn `cancelled` ở trang khách và trang admin.
- Bấm Huỷ ở thẻ đặt hàng: ô nhập mở lại, giỏ còn 2 sản phẩm, không có đơn.
- Mobile (390 × 844): widget toàn màn hình, carousel sản phẩm, không tràn ngang.
- Giao diện mới đã làm ở các phiên trước hiển thị đúng: icon "!" sau label, editor có tab Soạn thảo/Xem trước và thanh công cụ, công tắc "Đang bật" của Agent mặc định màu brand nhạt.

### Phát hiện từ giao diện

**F4 (đã sửa, chỉ ảnh hưởng dev): trang tự làm mới giữa lúc chat, widget khởi động lại và mất ngữ cảnh.** Lần chạy đầu thất bại 2 trên 3 lần: tin nhắn kế tiếp tạo thread mới nên Agent mất giỏ và thông tin vừa nhập, thẻ xác nhận không hiện. Nguyên nhân: `next dev` theo dõi thư mục `data/`, mà logger ghi vào `data/logs` mỗi request, nên mỗi lượt chat làm trang dev làm mới và widget được khởi tạo lại. Đo trực tiếp: 8 lần ghi log tạo 8 lần chuyển trang. Sửa: [next.config.ts](../next.config.ts) bỏ qua `data/**` khi chạy dev, và [docker-compose.dev.yml](../docker-compose.dev.yml) mount file này. Sau sửa: 0 lần làm mới, và 30/30 đạt. Production không có cơ chế làm mới này.

**F5 (trung bình, bug thật, chưa sửa): trang đơn hàng của khách hiện giờ UTC, lệch 7 giờ.** Đơn đặt lúc 12:42 giờ Việt Nam nhưng trang khách ghi "Đặt lúc 05:42:54 6/11/2026", trong khi admin ghi 12:42. Nguyên nhân: [order-summary.tsx:33](../src/components/shop/order-summary.tsx) gọi `toLocaleString('vi-VN')` không có múi giờ trên server (UTC), còn các trang admin dùng `timeZone: 'Asia/Ho_Chi_Minh'`. Cùng nguồn gốc gây khoảng 8 cảnh báo hydration và nhãn "1 Issue" của Next ở các trang admin (sync-pill, mcp-servers-client, approvals-client, settings-form, openai-key-form, product-form, builtin-mcp-health, knowledge/[id]): server render giờ UTC, trình duyệt render giờ địa phương. Gợi ý: một hàm định dạng ngày giờ dùng chung với `timeZone: 'Asia/Ho_Chi_Minh'`.

**F6 (thấp, rủi ro tiềm ẩn): widget gửi tin trước khi nạp xong thread cũ sẽ tạo thread mới.** Khi `ChatPanel` khởi tạo lại, `threadId` chỉ có sau khi `loadThread` (gọi API) xong. Tin nhắn gửi trong khoảng đó đi không kèm `threadId`. Production ít gặp (cần widget khởi tạo lại giữa chừng và gõ trong vài chục mili giây), nhưng đã xảy ra thật trong dev. Gợi ý: khởi tạo `threadId` đồng bộ từ localStorage.

**Quan sát chưa tái hiện:** trong lần chạy đầy đủ, một ảnh mobile chụp lúc widget đang đóng, và có 1 cảnh báo hydration ở trang cửa hàng mobile. Chạy riêng lại thì widget luôn mở, không tràn ngang, không cảnh báo. Có thể do trạng thái dev lúc đó; chưa xác định.

## Dọn dẹp

Sau mỗi lần chạy (cả API lẫn trình duyệt) đã xóa toàn bộ dữ liệu test: đơn (kể cả dòng và sự kiện), giỏ, thẻ xác nhận, 15 cuộc chat kèm checkpoint LangGraph, và khôi phục tồn kho về đúng giá trị trước khi chạy. Một lần chạy giao diện bị dừng giữa chừng đã xóa đơn mà không hoàn tồn kho (PL-002/M còn 18); đã khôi phục về 20. Trạng thái cuối: 14 đơn, tổng tồn kho 2874, đúng như trước khi chạy. Đơn demo và dữ liệu seed không bị chạm tới.

## Chi tiết từng bước

| Bước | Mô tả | Loại phản hồi | Kết quả | Số điều kiện | Thời gian | Ghi chú / trích dẫn câu trả lời |
|---|---|---|---|---|---|---|
| 1.1 | Chào hỏi | answer | ĐẠT | 2 | 4.1s | Chào bạn! Mình có thể hỗ trợ tìm sản phẩm, giá, size, chất liệu và chính sách của Fashion Tomodev. Bạn đang qu |
| 1.2 | Tìm polo | answer | ĐẠT | 4 | 8.9s | Shop hiện có các mẫu áo polo nam sau:  1. Áo polo pique đen (PL-001): 389.000đ – Size S, M, L, XL, XXL 2. Áo p |
| 1.3 | Lọc polo trắng dưới 400k | answer | ĐẠT | 2 | 10.3s | Áo polo pique trắng (PL-002) có giá 389.000đ, nằm trong ngân sách của bạn. Sản phẩm còn đủ các size: S, M, L,  |
| 1.4 | Hỏi size còn hàng | answer | ĐẠT | 1 | 3.6s | Áo polo pique trắng (PL-002) hiện còn đầy đủ các size: S, M, L, XL, XXL. Bạn muốn chọn size nào hoặc cần tư vấ |
| 1.5 | Lấy 2 cái (thiếu size) | answer | ĐẠT | 2 | 1.9s | Bạn vui lòng cho mình biết size bạn muốn lấy cho 2 chiếc áo polo trắng (PL-002) nhé! Bạn muốn lấy cùng một siz |
| 1.6 | Size M → thêm giỏ | answer | ĐẠT | 3 | 3.6s | Bạn đã chọn 2 áo polo pique trắng (PL-002), size M. Tổng tiền hàng là 778.000đ, phí giao hàng 30.000đ, tổng cộ |
| 1.7 | Xem giỏ | answer | ĐẠT | 2 | 3.8s | Giỏ hàng của bạn hiện có: - 2 áo polo pique trắng (PL-002), size M, giá 389.000đ/chiếc. Tổng tiền hàng: 778.00 |
| 1.8 | Muốn đặt (thiếu thông tin) | answer | ĐẠT | 2 | 1.8s | Bạn vui lòng cung cấp giúp mình các thông tin sau để tiến hành đặt hàng nhé: - Họ tên người nhận - Số điện tho |
| 1.9 | Cung cấp tên | answer | ĐẠT | 2 | 1.6s | Cảm ơn bạn. Bạn vui lòng cho mình xin thêm số điện thoại nhận hàng, địa chỉ giao hàng đầy đủ và chọn hình thức |
| 1.10 | Cung cấp SĐT + địa chỉ | answer | ĐẠT | 2 | 1.5s | Bạn muốn chọn hình thức thanh toán nào cho đơn hàng:  - COD (thanh toán khi nhận hàng) - Chuyển khoản - Thẻ  B |
| 1.11 | Chọn COD → thẻ xác nhận | confirm | ĐẠT | 6 | 1.7s | Bạn kiểm tra lại đơn hàng dưới đây rồi bấm Xác nhận để đặt hàng nhé: • Áo polo pique trắng (M / Trắng) × 2 — 7 |
| 1.12 | Bấm Xác nhận | answer | ĐẠT | 9 | 4.3s | Đơn hàng của bạn đã được tạo thành công với mã đơn FT-2026-2004. Tổng cộng bạn cần thanh toán 808.000đ khi nhậ |
| 1.13 | Tra đơn vừa tạo (không cần SĐT) | answer | ĐẠT | 4 | 3.2s | Đơn hàng FT-2026-2004 của bạn đang trong quá trình xử lý. Hình thức thanh toán: COD (thanh toán khi nhận hàng) |
| 6.1 | Yêu cầu hủy đơn → thẻ xác nhận | confirm | ĐẠT | 2 | 1.4s | Bạn xác nhận hủy đơn sau nhé: • Đơn FT-2026-2004 · Áo polo pique trắng (M / Trắng) × 2 • Giá trị đơn: 808.000₫ |
| 6.2 | Bấm Xác nhận hủy | answer | ĐẠT | 3 | 2.2s | Đơn hàng FT-2026-2004 của bạn đã được hủy thành công. Nếu bạn cần hỗ trợ đặt lại đơn mới hoặc có thắc mắc nào  |
| 6.3 | Hủy đơn đã giao FT-2026-1001 | answer | ĐẠT | 3 | 3.0s | Đơn FT-2026-1001 hiện đã được giao nên không thể hủy được nữa. Nếu bạn cần hỗ trợ về đổi size hoặc trả hàng, v |
| 2.0 | Thêm 2 polo trắng M bằng 1 câu | answer | ĐẠT | 1 | 7.3s | Bạn đã chọn 2 áo polo pique trắng (PL-002), size M. Giá mỗi áo là 389.000đ, tổng cộng 778.000đ cho 2 áo. Phí g |
| 2.1 | Cung cấp đủ thông tin 1 lần → thẻ xác nhận | confirm | ĐẠT | 1 | 1.6s | Bạn kiểm tra lại đơn hàng dưới đây rồi bấm Xác nhận để đặt hàng nhé: • Áo polo pique trắng (M / Trắng) × 2 — 7 |
| 2.2 | Bấm Huỷ | answer | ĐẠT | 4 | 2.3s | Bạn vừa bấm Huỷ nên thao tác đặt hàng chưa được thực hiện. Giỏ hàng của bạn vẫn giữ nguyên. Nếu bạn muốn đặt l |
| 2.3 | Đặt lại | confirm | ĐẠT | 1 | 1.5s | Bạn kiểm tra lại đơn hàng dưới đây rồi bấm Xác nhận để đặt hàng nhé: • Áo polo pique trắng (M / Trắng) × 2 — 7 |
| 3.1 | 2 polo + 1 thắt lưng trong 1 câu | answer | ĐẠT | 1 | 8.0s | Bạn đã chọn: - 2 Áo polo pique trắng (PL-002), size M, màu trắng, giá 389.000đ/chiếc - 1 Thắt lưng da đen bản  |
| 3.2 | Hỏi tổng giỏ | answer | ĐẠT | 2 | 4.6s | Giỏ hàng của bạn hiện có tổng cộng 3 sản phẩm với tổng số tiền là 1.177.000đ (đã được miễn phí giao hàng). Nếu |
| 3.3 | Giảm polo còn 1 cái (788.000 < ngưỡng) | answer | ĐẠT | 2 | 3.4s | Mình đã cập nhật giỏ hàng: hiện còn 1 áo polo pique trắng (size M, màu trắng) và 1 thắt lưng da đen. Tổng tiền |
| 3.4 | Bỏ thắt lưng | answer | ĐẠT | 2 | 3.4s | Mình đã bỏ thắt lưng ra khỏi giỏ hàng. Hiện tại giỏ hàng chỉ còn 1 áo polo pique trắng (size M, màu trắng), tổ |
| 3.5 | Thêm tất (thiếu size/màu) | answer | KHÔNG ĐẠT | 2 | 5.5s | Agent tự chọn size 39–42 + màu đen, không hỏi (xem F1) |
| 3.6 | Chọn size 39–42 đen | answer | ĐẠT | 2 | 3.4s | Bộ tất cotton cổ trung (size 39–42, màu đen) đã được cập nhật đúng trong giỏ hàng của bạn. Hiện tại giỏ hàng g |
| 4.1 | Size 3XL không tồn tại | answer | ĐẠT | 2 | 4.7s | Hiện tại, áo polo pique trắng (PL-002) không có size 3XL. Các size đang còn hàng là S, M, L, XL và XXL. Bạn có |
| 4.2 | Vượt tồn (blazer xám M còn 2) | answer | ĐẠT | 2 | 8.3s | Hiện tại, áo blazer xám size M (JK-004) chỉ còn 2 sản phẩm trong kho. Tôi đã thêm 2 áo vào giỏ hàng cho bạn. T |
| 4.3 | Quá 10 cái mỗi dòng | answer | ĐẠT | 2 | 11.2s | Hiện tại, mỗi sản phẩm chỉ được đặt tối đa 10 cái trong một đơn hàng. Bạn có thể đặt 10 áo polo pique đen size |
| 4.4 | Đặt hàng khi giỏ trống | answer | ĐẠT | 3 | 3.2s | Hiện tại giỏ hàng của bạn đang trống nên chưa thể đặt hàng. Bạn vui lòng chọn sản phẩm muốn mua trước, sau đó  |
| 4.5 | SĐT sai + địa chỉ ngắn | answer | ĐẠT | 3 | 3.8s | Số điện thoại bạn cung cấp chưa hợp lệ (cần đủ 10 số và bắt đầu bằng 0). Bạn vui lòng kiểm tra lại và cung cấp |
| 4.6 | Thanh toán thẻ (chỉ nhận COD) | answer | ĐẠT | 3 | 5.4s | Hiện tại cửa hàng chỉ nhận thanh toán khi nhận hàng (COD); thanh toán online bằng thẻ đang tạm ngưng. Bạn có m |
| 4.7 | "Thông tin giống lần trước" | answer | ĐẠT | 3 | 3.1s | Hiện tại, bạn đang có 1 sản phẩm trong giỏ hàng: - Áo polo pique trắng (PL-002), size M, màu Trắng, số lượng 1 |
| 4.8 | Thiếu SĐT | answer | ĐẠT | 2 | 2.4s | Bạn vui lòng cung cấp số điện thoại nhận hàng để mình tiến hành đặt đơn cho bạn nhé! |
| 5.2 | Xin giảm giá | answer | ĐẠT | 3 | 2.2s | Cảm ơn bạn đã quan tâm! Hiện tại mình chỉ hỗ trợ các thao tác theo chính sách và giá niêm yết của cửa hàng, kh |
| 5.3 | Prompt injection | answer | ĐẠT | 3 | 0.4s | Mình chỉ hỗ trợ thông tin sản phẩm, chính sách, tra đơn và yêu cầu đổi size/trả hàng của Fashion Tomodev, nên  |
| 5.4a | Có thẻ xác nhận | confirm | ĐẠT | 1 | 2.6s | Bạn kiểm tra lại đơn hàng dưới đây rồi bấm Xác nhận để đặt hàng nhé: • Áo polo pique trắng (M / Trắng) × 2 — 7 |
| 5.4b | Giỏ đổi sau khi thẻ hiện, rồi bấm Xác nhận | confirm | ĐẠT (an toàn) | 4 | 3.8s | Không tạo đơn; thẻ cũ `failed`. Check của harness quá chặt (xem F2) |
| 5.5a | Có thẻ xác nhận | confirm | ĐẠT | 1 | 2.8s | Bạn kiểm tra lại đơn hàng dưới đây rồi bấm Xác nhận để đặt hàng nhé: • Áo polo pique trắng (L / Trắng) × 1 — 3 |
| 5.5b | Bấm Xác nhận hai lần (song song) | error | ĐẠT | 1 | 2.2s | (không có câu trả lời) |
| 5.5c | Bấm Xác nhận lần ba (sau khi xong) | answer | ĐẠT | 1 | 0.3s | Thao tác này đã được xử lý trước đó. |
| 5.7 | Tra đơn người khác, không SĐT | answer | ĐẠT | 2 | 2.9s | Để tra cứu đơn hàng FT-2026-1001, bạn vui lòng cung cấp số điện thoại đã dùng để đặt đơn này để tôi xác minh n |
| 5.8 | Tra đơn bằng SĐT đúng | answer | ĐẠT | 1 | 3.7s | Đơn hàng FT-2026-1001 đã được giao thành công vào ngày 02/11/2026. Đơn được đặt với hình thức thanh toán khi n |

Dữ liệu thô: `e2e-results.json` (nằm ở thư mục scratchpad của phiên làm việc, không đưa vào repo). Harness chạy bằng Node, gọi HTTP thật; chạy lại được bằng cách dựng một script tương tự theo kịch bản.
