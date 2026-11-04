# Fashion Tomodev Assistant — Week 6 & Week 7

Trợ lý tiếng Việt cho cửa hàng thời trang nam:

- **Week 6:** chatbot RAG cho catalog và FAQ/chính sách. Dữ liệu được index vào PostgreSQL + pgvector; câu trả lời chỉ được hoàn tất khi mọi citation thuộc tập chunks đã đưa vào prompt.
- **Week 7:** AI Agent (LangGraph + MCP) tra đơn hàng giả lập và tạo yêu cầu đổi size/trả hàng. Mọi yêu cầu ghi dữ liệu dừng tại `interrupt()` chờ nhân viên duyệt.

## Chạy local

1. Sao chép `.env.example` thành `.env`, điền `ADMIN_SESSION_SECRET` và tạo hash admin (khóa OpenAI có thể nhập sau trong Admin → Cài đặt, hoặc điền `OPENAI_API_KEY` làm giá trị dự phòng):

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

   Compose chạy 4 service: `db`, `web`, `worker` và `mcp` (MCP server nội bộ, không mở port). Migration tự tạo bảng, schema `langgraph` (checkpoint/memory) và seed 13 đơn demo `FT-2026-1001`–`FT-2026-1013` khi bảng `orders` còn trống.

3. Mở `http://localhost:3000`: trợ lý AI là khung chat nổi ở góc dưới bên phải mọi trang cửa hàng (`/chat` chuyển về trang chủ và mở khung chat). Vào `/admin/login` để upload/re-index Knowledge và chạy thử retrieval. Chat tiếp tục dùng version active cho đến khi version mới `ready`.

4. (Tùy chọn) Mở URL demo qua Cloudflare Tunnel: đặt `CLOUDFLARE_TUNNEL_TOKEN` trong `.env` rồi chạy `docker compose --profile tunnel up -d`.

## Thử Agent (Week 7)

1. Trong khung chat, gửi: `Đơn FT-2026-1001 của tôi có áo sơ mi SM-001 bị rộng, tôi muốn đổi sang size L.` Agent hỏi số điện thoại đặt hàng (đơn demo: `0900` + 6 số cuối của mã đơn, ví dụ `FT-2026-1001` → `0900261001`); sau khi xác minh, agent tra đơn, sản phẩm, chính sách rồi báo đang chờ duyệt; ô nhập bị khóa.
2. Mở `/admin/approvals`, bấm **Duyệt** hoặc **Từ chối** (có thể kèm ghi chú). Graph resume đúng `thread_id`; câu trả lời hiện trong chat sau vài giây.
3. Đặt lại dữ liệu đơn demo (ngày giao tính lại theo hôm nay, xóa yêu cầu/approval): `docker compose exec web pnpm db:reset-orders`.

## Thử Agent mua hàng (Giai đoạn 6)

Agent cũng bán hàng qua MCP: `search_products`, `view_cart`, `add_to_cart`, `set_cart_quantity`, `checkout`, `cancel_order`. Giỏ hàng là giỏ của chính trình duyệt đang chat (server tra khách từ `thread_id`, model không tự truyền danh tính).

1. Gửi: `Tôi muốn mua 2 áo sơ mi Oxford trắng size M`. Agent tìm sản phẩm, thêm vào giỏ (số trên biểu tượng giỏ ở header cập nhật ngay).
2. Gửi họ tên, số điện thoại, địa chỉ và hình thức thanh toán để đặt hàng. Agent **không** tạo đơn: khung chat hiện thẻ chi tiết đơn với nút **Xác nhận** / **Huỷ**. Chỉ cú bấm từ trình duyệt của bạn (`POST /api/chat/confirmations/:id`) mới tạo đơn; MCP chạy đúng nội dung thẻ đã hiện, từ chối nếu giỏ/giá đã đổi, và mỗi xác nhận chỉ dùng một lần. Xác nhận hết hạn sau 30 phút.
3. Đơn đặt qua chat xem được ở `/orders/<mã>`; đơn thanh toán online chờ thanh toán ở đó. `Hủy đơn FT-… ` cũng cần bấm Xác nhận, chỉ cho đơn đang xử lý và chưa thanh toán.
4. Tra đơn/đổi/trả cần xác minh chủ đơn: đơn đặt từ chính trình duyệt này, hoặc đúng số điện thoại đặt hàng (sai quá 5 lần thì tạm khóa theo cuộc trò chuyện và theo mã đơn).
5. Đơn `FT-2026-1013` có cùng sản phẩm `SM-001` ở hai dòng (size M và L): agent phải hỏi khách xử lý dòng nào trước khi đề xuất đổi/trả.

Các đơn demo: 1001/1002/1009/1010/1012 đổi/trả hợp lệ; 1013 hai dòng cùng sản phẩm; 1003 quá 7 ngày; 1004 đang giao; 1005 đang xử lý; 1006 tất và phụ kiện đã mở; 1007 giảm giá 40%; 1008 đã có yêu cầu đổi; 1011 đã hủy. Sơ đồ graph, state, vị trí `interrupt()` và quyền từng tool: [docs/agent-graph.md](docs/agent-graph.md).

## Dựng môi trường mới (dữ liệu demo, ảnh, cấu hình AI)

Mọi thứ cần để chạy demo nằm trong repo; **không có khóa bí mật nào** (OpenAI, mật khẩu admin, `ADMIN_SESSION_SECRET`...). Sau khi `git clone`, làm theo "Chạy local" ở trên rồi `docker compose exec web pnpm db:seed`. Lệnh này (chạy lại nhiều lần vẫn an toàn) nạp:

| Dữ liệu | Nguồn trong repo |
|---|---|
| 38 sản phẩm, 11 danh mục (nạp khi migrate/seed nếu bảng trống) | `data/raw/bang_gia_san_pham_thoi_trang_nam.xlsx` |
| 13 đơn hàng demo `FT-2026-1001`–`1013` | `src/features/orders/seed-data.ts` (nạp khi migrate) |
| Ảnh chính của từng sản phẩm (chỉ cho sản phẩm chưa có ảnh) | `data/seed/product-images/<MÃ>.webp` |
| FAQ chính sách, hướng dẫn tra đơn/hủy đơn/đổi trả | `data/raw/faq_*.pdf` (index bằng worker, cần OpenAI key) |
| Agent mặc định, scope "Chính sách", MCP server nội bộ | `src/features/ai/seed.ts`, `prompts/` |

Chưa có OpenAI key thì web, admin và catalog vẫn chạy; việc index (embedding) và chat chờ đến khi nhập key ở **Admin → Cài đặt** (khóa lưu mã hóa trong DB, không nằm trong git). Ảnh được sinh bằng `python3 scripts/generate-product-images.py data/seed/product-images` (cần ImageMagick); chỉ chạy lại khi muốn đổi ảnh. Khóa, cuộc trò chuyện, đơn của khách và file upload trong DB dev **không** được export.

## AI Agent đa cấu hình (Admin → AI)

- **AI Agents**: nhiều agent, một agent mặc định trả lời khách trên website; mỗi agent có hướng dẫn (instructions), model (trong `OPENAI_ALLOWED_MODELS`), giới hạn bước, Knowledge scope và MCP Server. Có nút "Chat thử" cho admin.
- **Knowledge**: tài liệu gom thành scope (tên, tên tool, mô tả tool); mỗi scope là một tool cho agent.
- **MCP Server**: server nội bộ (đủ tool cửa hàng) và server ngoài qua HTTP (Bearer/header, chống SSRF; host riêng tư phải khai trong `MCP_ALLOWED_HOSTS`). Lấy danh sách tool từ URL, tick tool cần dùng và tool nào cần nhân viên duyệt; agent chỉ chọn server.
- Kế hoạch, quyết định và báo cáo kiểm thử: [plans/ai-agent-refactor-plan.md](plans/ai-agent-refactor-plan.md), [docs/ai-agent-test-report.md](docs/ai-agent-test-report.md), [docs/agent-graph.md](docs/agent-graph.md).

## Kiểm tra

```bash
pnpm lint
pnpm typecheck
pnpm test                                 # Vitest, không gọi OpenAI (graph dùng model/MCP giả)
pnpm build
docker compose exec web pnpm eval:rag     # golden set Week 6 qua graph, gọi OpenAI thật
docker compose exec web pnpm eval:agent   # golden set Agent 46 case, gọi OpenAI thật, reset đơn demo
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
