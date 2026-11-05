# Week 7 — AI Agents: từ khái niệm đến vận hành

> Nguồn: `week_7.pptx` (47 slide). ShopBot trong slide là ví dụ giảng dạy; không thay thế thiết kế hay quyền thực tế của Fashion Tomodev.

## Phân biệt LLM, RAG và Agent

- **LLM:** bộ máy text-to-text; kiến thức đóng băng tại thời điểm huấn luyện, stateless và không tự gọi API.
- **RAG:** LLM + thư viện tri thức; phù hợp trả lời có căn cứ từ tài liệu tương đối tĩnh.
- **Agent:** LLM trong một vòng lặp có state, có thể chọn bước tiếp theo, gọi tool, nhận quan sát và hoàn thành mục tiêu nhiều bước.

Không cần dùng Agent chỉ vì có AI. Dùng LLM cho tác vụ ngôn ngữ đơn giản; RAG cho tri thức nội bộ; Agent khi cần dữ liệu sống, quyết định nhiều bước hoặc hành động. Agent đáng dùng khi việc có nhiều bước/lặp lại, cần tra cứu và có tiêu chí hoàn thành rõ.

## Vòng lặp Agent

1. Tin nhắn người dùng được thêm vào lịch sử.
2. LLM đọc lịch sử cùng danh sách tool, trả lời hoặc yêu cầu gọi tool.
3. **Ứng dụng**, không phải LLM, thực thi hàm/API thật.
4. Kết quả được đưa lại thành tool message đúng cặp với tool call.
5. LLM quan sát kết quả và quyết định bước tiếp hoặc câu trả lời cuối.
6. Dừng khi không còn tool call hoặc chạm giới hạn đã đặt.

Mỗi vòng tăng cost và latency; mọi tool call phải có kết quả tương ứng; cần giới hạn bước/call để một tool lỗi không gây vòng lặp vô tận.

## Sáu khối xây dựng

| Khối | Ý nghĩa thực hành |
| --- | --- |
| Vai trò | System prompt xác định role, goal và bối cảnh/tiêu chuẩn |
| Tập trung | Một node/agent có trách nhiệm hẹp, ít chỉ dẫn và ít tool |
| Công cụ | Cung cấp dữ liệu sống, dữ liệu cấu trúc, tính toán hay hành động |
| Phối hợp | Luồng tuần tự, phân cấp hoặc song song; bàn giao bằng structured data |
| Rào chắn | Lọc input, giới hạn tool, checkpoint đầu ra và fallback |
| Bộ nhớ | Ngắn hạn trong hội thoại; dài hạn/entity có phạm vi và chính sách lưu rõ ràng |

Mô tả tool phải nêu: làm gì, dùng khi nào, không dùng khi nào, input/output và điều kiện an toàn. Thêm tool chỉ khi thật sự cần, agent hiểu lúc nào nên gọi và quyền của tool đã bị giới hạn.

## Năm mẫu thiết kế

- **Reflection:** tạo bản nháp → phản biện theo tiêu chí → sửa, tối đa 2–3 vòng.
- **Tool use:** LLM quyết định tên tool/tham số; app chạy tool thật rồi trả observation.
- **ReAct:** thought → action → observation lặp đến khi giải được việc; trace từng bước để debug.
- **Planning:** lập kế hoạch trước rồi chạy, hoặc vừa chạy vừa replan khi môi trường thay đổi.
- **Multi-agent:** chia theo chuyên môn thật sự khác nhau; sub-agent giữ context riêng và bàn giao bản tóm tắt.

Bắt đầu với mẫu đơn giản và chỉ tăng độ phức tạp khi eval chỉ ra điểm yếu. Multi-agent tăng token, latency và khó debug nên không phải lựa chọn mặc định.

## Năm cấp tự chủ

1. **Basic responder:** chỉ sinh câu trả lời.
2. **Router:** code định luồng, LLM phân loại/chọn nhánh.
3. **Tool calling:** LLM chọn tool và tham số trong workflow đã kiểm soát.
4. **Manager/multi-agent:** điều phối sub-agent theo vòng lặp.
5. **Autonomous:** tự tạo/chạy giải pháp mới, cần sandbox, quyền tối thiểu và phê duyệt với thao tác phá huỷ.

Phần lớn bài toán doanh nghiệp nên dừng ở cấp 2–3. Leo cấp chỉ khi cấp hiện tại không đủ và có observability/eval tương ứng.

## MCP và tool boundary

MCP chuẩn hoá cách một client/agent khám phá và gọi công cụ/tài nguyên/prompt từ server. Lợi ích chính là đóng gói một capability một lần, tái sử dụng qua client; nó không tự làm tool an toàn.

Nguyên tắc an toàn:

- Server xác thực/xác quyền độc lập; không tin tham số hay mô tả do model tạo.
- Giữ tool nhỏ, schema chặt, validate server-side và phản hồi lỗi có cấu trúc.
- Tách read khỏi write; hạn chế scope và quyền tối thiểu.
- Định danh/bối cảnh nhạy cảm (như `session_id`, user/tenant) phải do server inject, không để model tự điền.
- Ghi log tool call, sử dụng idempotency cho write và đặt timeout/retry hợp lý.

## LangGraph: workflow có state

LangGraph mô hình hoá agent bằng **state**, **node**, **edge** và **conditional edge**. State là hợp đồng dữ liệu; reducer xác định field nào nối/thay thế. Mỗi node làm một việc hẹp và trả về phần state cập nhật.

Đồ thị làm workflow tường minh hơn một prompt dài: định tuyến, vòng tool, giới hạn, fallback và điểm phê duyệt trở thành code có thể test. Nên render/kiểm tra graph, ghi trace node transitions và test từng nhánh.

## Checkpoint, memory và context

- **Checkpoint:** snapshot state sau mỗi bước, gắn `thread_id`; cho phép hội thoại nhiều lượt, resume và kiểm tra lịch sử.
- **Long-term memory/store:** thông tin bền vững cần namespace, phạm vi, TTL và chính sách privacy rõ ràng.
- **Context engineering:** chọn đúng lịch sử, summary, dữ liệu tool và retrieval thay vì nhồi toàn bộ vào prompt.

Khi cắt lịch sử, luôn bảo toàn tính hợp lệ của cặp AI tool call ↔ ToolMessage. Hội thoại dài có thể window + summary; history chỉ là context, không phải nguồn sự thật cho dữ liệu sống.

## Human-in-the-loop và vận hành

Hành động có hậu quả thật (tiền, hủy/xóa, gửi ra ngoài, đổi dữ liệu quan trọng) cần cổng người duyệt hoặc xác nhận rõ ràng. `interrupt()`/resume cho phép graph dừng, lưu checkpoint, chờ quyết định rồi tiếp tục bằng cùng thread.

Node có thể chạy lại khi resume, vì vậy mọi side effect trước interrupt phải idempotent hoặc tách thành bước chuẩn bị/chờ/thực thi. Prompt chỉ là hướng dẫn mềm; bất biến quan trọng phải được ép bằng code/server policy.

Cần observability theo trace/thread: route, node, model/tool call, token/cost, latency, input/output đã được redaction, outcome và error. Eval cần test nhánh thành công, tool lỗi, router parse lỗi, injection, lặp vô hạn, quyền truy cập và resume.

## Áp dụng cho Fashion Tomodev

[`docs/agent-graph.md`](../agent-graph.md) là tài liệu nguồn sự thật cho graph hiện có: tool read/write, định danh server-side, checkpoint Postgres, `interrupt()` cho approval/xác nhận, giới hạn call và response validation. Khi mở rộng agent, giữ đúng các boundary đó thay vì đưa quyền quyết định an toàn vào prompt.

