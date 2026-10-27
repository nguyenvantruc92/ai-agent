# Fashion Tomodev Assistant — Week 6 & Week 7

Trợ lý tiếng Việt cho cửa hàng thời trang nam:

- **Week 6:** chatbot RAG cho catalog và FAQ/chính sách. Dữ liệu được index vào PostgreSQL + pgvector; câu trả lời chỉ được hoàn tất khi mọi citation thuộc tập chunks đã đưa vào prompt.
- **Week 7:** AI Agent (LangGraph + MCP) tra đơn hàng giả lập và tạo yêu cầu đổi size/trả hàng. Mọi yêu cầu ghi dữ liệu dừng tại `interrupt()` chờ nhân viên duyệt.

## Chạy local

1. Sao chép `.env.example` thành `.env`, điền `OPENAI_API_KEY`, `ADMIN_SESSION_SECRET`, và tạo hash admin:

   ```bash
   pnpm install
   pnpm admin:password "mat-khau-cua-ban"
   ```

   Đặt output của lệnh cuối vào `ADMIN_PASSWORD_HASH`.

2. Khởi động services (migration tự chạy khi `web`/`worker` khởi động) và queue dữ liệu demo:

   ```bash
   docker compose up --build -d
   docker compose exec web pnpm db:seed
   ```

   Compose chạy 4 service: `db`, `web`, `worker` và `mcp` (MCP server nội bộ, không mở port). Migration tự tạo bảng, schema `langgraph` (checkpoint/memory) và seed 12 đơn demo `FT-2026-1001`–`FT-2026-1012` khi bảng `orders` còn trống.

3. Mở `http://localhost:3000/chat`. Vào `/admin/login` để upload/re-index Knowledge và chạy thử retrieval. Chat tiếp tục dùng version active cho đến khi version mới `ready`.

4. (Tùy chọn) Mở URL demo qua Cloudflare Tunnel: đặt `CLOUDFLARE_TUNNEL_TOKEN` trong `.env` rồi chạy `docker compose --profile tunnel up -d`.

## Thử Agent (Week 7)

1. Trong `/chat`, gửi: `Đơn FT-2026-1001 của tôi có áo sơ mi SM-001 bị rộng, tôi muốn đổi sang size L.` Agent tra đơn, sản phẩm, chính sách rồi báo đang chờ duyệt; ô nhập bị khóa.
2. Mở `/admin/approvals`, bấm **Duyệt** hoặc **Từ chối** (có thể kèm ghi chú). Graph resume đúng `thread_id`; câu trả lời hiện trong chat sau vài giây.
3. Đặt lại dữ liệu đơn demo (ngày giao tính lại theo hôm nay, xóa yêu cầu/approval): `docker compose exec web pnpm db:reset-orders`.

Các đơn demo: 1001/1002/1009/1010/1012 đổi/trả hợp lệ; 1003 quá 7 ngày; 1004 đang giao; 1005 đang xử lý; 1006 tất và phụ kiện đã mở; 1007 giảm giá 40%; 1008 đã có yêu cầu đổi; 1011 đã hủy. Sơ đồ graph, state, vị trí `interrupt()` và quyền từng tool: [docs/agent-graph.md](docs/agent-graph.md).

## Kiểm tra

```bash
pnpm lint
pnpm typecheck
pnpm test                                 # Vitest, không gọi OpenAI (graph dùng model/MCP giả)
pnpm build
docker compose exec web pnpm eval:rag     # golden set Week 6 qua graph, gọi OpenAI thật
docker compose exec web pnpm eval:agent   # golden set Agent 34 case, gọi OpenAI thật, reset đơn demo
```

Hai lệnh eval chạy trong container vì cần database `db` và MCP server. Kết quả ghi vào `data/eval-results/<timestamp>.json`; bản dùng để nộp nằm ở [evals/results/](evals/results/) (baseline Week 6, Week 6 qua graph, Agent Week 7); dùng `traceId` của từng case để tra `data/logs/web.ndjson`. Sau khi đổi model, prompt, chunking hoặc tham số retrieval phải chạy lại eval.

## Hành vi chính

- XLSX: chỉ đọc sheet `Catalog sản phẩm`, mỗi sản phẩm một chunk (`product:<id>`).
- PDF: mỗi cặp hỏi–đáp trong bảng FAQ là một chunk (`policy:<mục>:<số thứ tự>`); PDF không có bảng được tách theo heading.
- Re-index dùng lại embedding của chunk có `content_hash` không đổi.
- Câu hỏi ngắn/tham chiếu ("còn size L không?") được ghép với nguồn đã trích dẫn ở lượt trước khi retrieval.
- Không có chunk đạt `RETRIEVAL_MIN_SIMILARITY` thì không gọi model và trả thiếu thông tin. Citation ngoài prompt, câu trả lời thiếu citation hoặc chứa con số không có trong nguồn bị thay bằng phản hồi thiếu thông tin.
- Prompt injection cơ bản (bỏ qua hướng dẫn, xin system prompt/API key) bị chặn bằng luật trước khi gọi model.
- Câu hỏi "sản phẩm nào sắp hết / hết hàng" được lọc theo `stock_status`.
- Trace ở `data/logs/web.ndjson`, `worker.ndjson` và `mcp.ndjson` (xoay vòng 10 MiB × 5 file). Mỗi node graph, tool call MCP, interrupt và resume ghi một dòng có `trace_id`, latency và số bước.

Không commit `.env`, uploads hoặc logs. Các điểm triển khai khác plan gốc được ghi ở mục 32–33 của [plan](plans/fashion-assistant-implementation-plan.md).
