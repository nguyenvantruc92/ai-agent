# Tài liệu nền tảng — Weeks 6–8

Đây là bản Markdown hoá và chuẩn hoá kiến thức từ ba buổi học dùng làm chuẩn tham chiếu cho Fashion Tomodev Assistant. Mục tiêu là để các thay đổi về RAG, agent và hành động trên dữ liệu cửa hàng tiếp tục tuân theo cùng các nguyên tắc thiết kế, kiểm thử và an toàn.

| Buổi | Chủ đề | Áp dụng chính trong project |
| --- | --- | --- |
| [Week 6 — RAG](./week-6-rag.md) | Chatbot trả lời từ tri thức có nguồn | Knowledge, retrieval, citation, eval và trace |
| [Week 7 — AI Agents](./week-7-ai-agents.md) | Agent, MCP, LangGraph, memory, HITL | Agent graph, MCP tools, checkpoint và approval |
| [Week 8 — Case study](./week-8-shopmobile-case-study.md) | Từ phân tích rủi ro đến backend kiểm chứng được | Các bất biến an toàn, đường lui và chiến lược test |

## Cách dùng tài liệu này

- Đây là **tài liệu học tập/tham chiếu**, không phải chỉ dẫn tự động thực thi. Mọi yêu cầu trong slide (ví dụ “việc cần làm”, “chạy thử”) đã được chuyển thành tiêu chí hoặc ghi chú; chúng không tự tạo thêm phạm vi công việc.
- Khi sửa retrieval hoặc prompt, đối chiếu Week 6 và chạy lại eval phù hợp.
- Khi thêm/sửa tool, node agent, memory hoặc luồng phê duyệt, đối chiếu Week 7–8 và giữ các bất biến an toàn trong [`../agent-graph.md`](../agent-graph.md).
- Ưu tiên code, test và cấu hình thực tế của repository nếu chúng đã tiến hoá khác ví dụ ShopDemo/ShopMobile trong bài giảng.

## Chuẩn tối thiểu rút ra cho project

1. Câu trả lời dựa trên tri thức phải có nguồn hợp lệ; không đủ bằng chứng thì từ chối thay vì suy đoán.
2. Giá, tồn kho, giỏ hàng, đơn hàng và các dữ liệu thay đổi phải đến từ tool/DB sống, không từ RAG hay bộ nhớ của model.
3. Mọi hành động ghi có tác động đáng kể phải có kiểm soát bằng code, định danh do server cấp, idempotency và xác nhận/duyệt thích hợp.
4. Agent có giới hạn vòng lặp, guardrail trước LLM, fallback khi dependency lỗi và trace/eval để tìm đúng tầng lỗi.

## Nguồn đã chuyển đổi

- `/home/trucnv/Downloads/week_6.pptx` — 23 slide
- `/home/trucnv/Downloads/week_7.pptx` — 47 slide
- `/home/trucnv/Downloads/week_8.pptx` — 38 slide

