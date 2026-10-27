# Fashion Tomodev Assistant — Week 6 & Week 7

Trợ lý tiếng Việt cho cửa hàng thời trang nam:

- **Week 6:** chatbot RAG cho catalog và FAQ/chính sách. Dữ liệu được index vào PostgreSQL + pgvector; câu trả lời chỉ được hoàn tất khi mọi citation thuộc tập chunks đã đưa vào prompt.
- **Week 7:** AI Agent (LangGraph + MCP) tra đơn hàng giả lập và tạo yêu cầu đổi size/trả hàng. Mọi yêu cầu ghi dữ liệu dừng tại `interrupt()` chờ nhân viên duyệt.

Tài liệu khác: [kịch bản test/demo](docs/demo-script.md) · [sơ đồ agent graph](docs/agent-graph.md) · [ghi chú MCP](docs/mcp-notes.md) · [tech stack và tham số provider](docs/tech-stack.md).

---

## 1. Chạy nhanh trên máy mới

### 1.1. Cần có

| Công cụ | Ghi chú |
|---|---|
| Git | để clone repo |
| Docker + Docker Compose v2 | lệnh `docker compose version` phải chạy được |
| `OPENAI_API_KEY` | bắt buộc để chat/eval trả lời; không có key vẫn mở được admin và chạy unit test |
| Node 24 + pnpm 10 *(tuỳ chọn)* | chỉ cần nếu muốn chạy `pnpm lint/test` ngoài Docker |

Port `3000` trên máy phải còn trống.

### 1.2. Cách A: một lệnh (Linux, macOS, WSL, Git Bash)

```bash
git clone <repo-url> fashion-tomodev
cd fashion-tomodev
./scripts/setup.sh
```

Script sẽ:

1. Build Docker image.
2. Tạo `.env` từ `.env.example` nếu chưa có: hỏi `OPENAI_API_KEY` và mật khẩu admin (nhập ẩn), tự tạo `ADMIN_PASSWORD_HASH` và `ADMIN_SESSION_SECRET`. Key chỉ được ghi vào `.env` (đã nằm trong `.gitignore`).
3. `docker compose up -d`: migration tự chạy, seed 12 đơn demo và import Knowledge từ `data/seed/` (xem [mục 2](#2-dữ-liệu-có-sẵn-trong-repo)).
4. Chờ web sẵn sàng, in số tài liệu/chunk và số đơn trong database.

Chạy không hỏi gì (CI hoặc copy-paste):

```bash
OPENAI_API_KEY=sk-... ADMIN_PASSWORD='mat-khau-admin' ./scripts/setup.sh
```

Chạy lại script nhiều lần vẫn an toàn: `.env` và database đang có được giữ nguyên.

### 1.3. Cách B: từng bước thủ công (mọi hệ điều hành)

1. **Clone repo**

   ```bash
   git clone <repo-url> fashion-tomodev
   cd fashion-tomodev
   ```

2. **Tạo `.env`**

   ```bash
   cp .env.example .env
   ```

   Mở `.env` và điền:

   | Biến | Giá trị |
   |---|---|
   | `OPENAI_API_KEY` | key OpenAI của bạn |
   | `ADMIN_SESSION_SECRET` | chuỗi ngẫu nhiên ≥ 24 ký tự, ví dụ output của `openssl rand -hex 32` |
   | `ADMIN_PASSWORD_HASH` | tạo ở bước 3 |

   Các biến còn lại giữ mặc định.

3. **Build image và tạo hash mật khẩu admin** (không cần Node trên máy)

   ```bash
   docker compose build
   docker compose run --rm --no-deps -T web pnpm -s admin:password "mat-khau-admin"
   ```

   Copy dòng output (dạng `uuid:hex...`) vào `ADMIN_PASSWORD_HASH` trong `.env`.

4. **Khởi động**

   ```bash
   docker compose up -d
   docker compose logs -f web worker   # đợi thấy "Imported 2 knowledge documents" (web hoặc worker) và "Ready", rồi Ctrl+C
   ```

   Compose chạy 4 service: `db` (Postgres + pgvector), `web` (Next.js, port 3000), `worker` (index tài liệu, hết hạn approval) và `mcp` (MCP server nội bộ, không mở port).

5. **Kiểm tra dữ liệu đã có**

   ```bash
   docker compose exec db psql -U fashion -d fashion -c "SELECT original_filename, status FROM knowledge_documents" -c "SELECT count(*) FROM orders"
   ```

   Mong đợi: 2 tài liệu `ready` và 12 đơn.

### 1.4. Thử nhanh trong 2 phút

| Bước | Làm | Mong đợi |
|---|---|---|
| 1 | Mở http://localhost:3000/chat, gửi `Có áo sơ mi trắng nào dưới 500.000đ không?` | SM-001, giá 499.000 VNĐ, nguồn `product:SM-001` (RAG) |
| 2 | Gửi `Kiểm tra giúp tôi đơn FT-2026-1001` | Đơn đã giao, có SM-001 size M (Agent + MCP) |
| 3 | Bấm **Cuộc trò chuyện mới**, gửi `Đơn FT-2026-1001 của tôi có áo sơ mi SM-001 bị rộng, tôi muốn đổi sang size L.` | Bubble vàng "chờ nhân viên duyệt", ô nhập bị khóa |
| 4 | Mở http://localhost:3000/admin/login (mật khẩu đã đặt) → **Approvals** → **Duyệt** | Vài giây sau chat báo đã tạo yêu cầu đổi size L |

Kịch bản đầy đủ (A1–B20, ảnh cần chụp, trace): [docs/demo-script.md](docs/demo-script.md).

### 1.5. Lệnh hay dùng

```bash
docker compose exec web pnpm db:reset-orders   # đơn demo về trạng thái ban đầu, ngày giao tính lại theo hôm nay
docker compose logs -f web worker mcp          # xem log container
docker compose restart web                     # khởi động lại một service
docker compose down                            # dừng, GIỮ database
docker compose down -v                         # dừng và XÓA database (lần up sau import lại từ data/seed)
docker compose up -d --build                   # sau khi pull code mới
```

Nên chạy `db:reset-orders` trước mỗi buổi demo. Ngày giao của đơn tính theo thời điểm seed, nên để qua vài ngày thì kết quả "quá 7 ngày" sẽ thay đổi.

---

## 2. Dữ liệu có sẵn trong repo

| Dữ liệu | Nằm ở | Vào database thế nào |
|---|---|---|
| Schema (bảng, index, pgvector) | `src/db/migrations/*.sql` | `pnpm db:migrate`, tự chạy khi `web`/`worker` khởi động |
| Knowledge: catalog XLSX + FAQ PDF, **đã chunk và có embedding** | `data/seed/knowledge-snapshot.json` + `data/seed/uploads/` | Migration tự import khi bảng `knowledge_documents` còn trống; **không gọi OpenAI** |
| File gốc của Knowledge | `data/raw/` | Dùng khi muốn index lại từ đầu (`pnpm db:seed`) |
| 12 đơn demo `FT-2026-1001`–`1012` | `src/features/orders/seed-data.ts` | Migration tự seed khi bảng `orders` trống; `db:reset-orders` để làm mới |
| Golden set và kết quả eval đã nộp | `evals/` | Không cần import |

Snapshot chỉ chứa **version active** của mỗi tài liệu (catalog v4 có 38 chunk, FAQ v3 có 23 chunk). Snapshot **không** chứa lịch sử chat, approval, yêu cầu đổi/trả, checkpoint LangGraph hay audit log, vì đó là dữ liệu sinh ra khi test và máy mới sẽ bắt đầu sạch.

Snapshot chỉ được import khi `OPENAI_EMBEDDING_MODEL` và `EMBEDDING_DIMENSIONS` trùng với lúc export (`text-embedding-3-small`/1536). Nếu khác, migration in cảnh báo và bỏ qua; lúc đó chạy `docker compose exec web pnpm db:seed` để worker index lại bằng OpenAI.

### Cập nhật snapshot sau khi đổi Knowledge

Sau khi upload hoặc re-index tài liệu trong admin và muốn commit trạng thái mới:

```bash
docker compose exec worker pnpm db:export-knowledge   # ghi đè data/seed/
git add data/seed && git commit -m "Update knowledge snapshot"
```

Lệnh chạy trong `worker` vì chỉ container này mount cả thư mục `data/`. File tạo ra thuộc user root; nếu cần sửa tay thì chạy `sudo chown -R $USER data/seed`.

### Index lại từ đầu (bỏ qua snapshot)

```bash
docker compose down -v
mv data/seed data/seed.bak            # tạm ẩn snapshot
docker compose up -d
docker compose exec web pnpm db:seed  # queue 2 file trong data/raw, worker gọi OpenAI để embed
mv data/seed.bak data/seed
```

---

## 3. Bí mật và những gì KHÔNG commit

| Không commit | Lý do | Đã chặn bởi |
|---|---|---|
| `.env` | chứa `OPENAI_API_KEY`, `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET`, `CLOUDFLARE_TUNNEL_TOKEN` | `.gitignore`, `.dockerignore` (không lọt vào image) |
| `data/uploads/`, `data/trash/` | file admin upload lúc chạy | `.gitignore` |
| `data/logs/`, `data/eval-results/` | log và kết quả eval cục bộ (bản nộp nằm ở `evals/results/`) | `.gitignore` |
| `slides/` | tài liệu khóa học | `.gitignore` |

Trước khi push nên kiểm tra:

```bash
git check-ignore -v .env                         # phải in ra dòng .gitignore
git status --short                               # không được có .env
git grep -nE 'sk-[A-Za-z0-9_-]{20,}' || echo "OK: không có OpenAI key trong repo"
```

Nếu lỡ commit key: thu hồi key trên OpenAI ngay. Xóa khỏi git history thôi là chưa đủ.

---

## 4. Thử Agent (Week 7)

1. Trong `/chat`, gửi: `Đơn FT-2026-1001 của tôi có áo sơ mi SM-001 bị rộng, tôi muốn đổi sang size L.` Agent tra đơn, sản phẩm, chính sách rồi báo đang chờ duyệt; ô nhập bị khóa.
2. Mở `/admin/approvals`, bấm **Duyệt** hoặc **Từ chối** (có thể kèm ghi chú). Graph resume đúng `thread_id`; câu trả lời hiện trong chat sau vài giây.
3. Đặt lại dữ liệu đơn demo (ngày giao tính lại theo hôm nay, xóa yêu cầu/approval): `docker compose exec web pnpm db:reset-orders`.

Các đơn demo: 1001/1002/1009/1010/1012 đổi/trả hợp lệ; 1003 quá 7 ngày; 1004 đang giao; 1005 đang xử lý; 1006 tất và phụ kiện đã mở; 1007 giảm giá 40%; 1008 đã có yêu cầu đổi; 1011 đã hủy. Sơ đồ graph, state, vị trí `interrupt()` và quyền từng tool: [docs/agent-graph.md](docs/agent-graph.md).

(Tuỳ chọn) Mở URL demo qua Cloudflare Tunnel: đặt `CLOUDFLARE_TUNNEL_TOKEN` trong `.env` rồi chạy `docker compose --profile tunnel up -d`.

## 5. Kiểm tra

Trên máy có Node 24 + pnpm:

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test                                 # Vitest, không gọi OpenAI (graph dùng model/MCP giả)
pnpm build
```

Không cài Node thì chạy trong container: `docker compose run --rm --no-deps web pnpm test`.

Eval gọi OpenAI thật và cần `db` + MCP nên chạy trong container:

```bash
docker compose exec web pnpm eval:rag     # golden set Week 6 qua graph
docker compose exec web pnpm eval:agent   # golden set Agent 34 case, tự reset đơn demo
```

Kết quả ghi vào `data/eval-results/<timestamp>.json`; bản dùng để nộp nằm ở [evals/results/](evals/results/) (baseline Week 6, Week 6 qua graph, Agent Week 7); dùng `traceId` của từng case để tra `data/logs/web.ndjson`. Sau khi đổi model, prompt, chunking hoặc tham số retrieval phải chạy lại eval.

## 6. Xử lý sự cố

| Triệu chứng | Cách xử lý |
|---|---|
| Port 3000 đã bị dùng | Dừng app đang chiếm port, hoặc đổi `127.0.0.1:3000:3000` trong `docker-compose.yml` |
| Chat báo lỗi / không trả lời | `OPENAI_API_KEY` trống hoặc sai; sửa `.env` rồi `docker compose up -d` (Compose tự tạo lại container khi `.env` đổi) |
| Không đăng nhập được admin | Tạo lại hash (bước 3 mục 1.3), cập nhật `.env`, `docker compose up -d` |
| Admin Knowledge trống | Xem `docker compose logs web worker \| grep -i knowledge`; nếu có cảnh báo "Bỏ qua knowledge snapshot" thì xem [mục 2](#2-dữ-liệu-có-sẵn-trong-repo) |
| Đơn 1001 báo "quá hạn đổi" | Ngày giao cũ: `docker compose exec web pnpm db:reset-orders` |
| Kết quả lạ sau khi pull code | `docker compose up -d --build` |
| Muốn làm lại từ đầu | `docker compose down -v && docker compose up -d` |

## 7. Hành vi chính

- XLSX: chỉ đọc sheet `Catalog sản phẩm`, mỗi sản phẩm một chunk (`product:<id>`).
- PDF: mỗi cặp hỏi–đáp trong bảng FAQ là một chunk (`policy:<mục>:<số thứ tự>`); PDF không có bảng được tách theo heading.
- Re-index dùng lại embedding của chunk có `content_hash` không đổi.
- Câu hỏi ngắn/tham chiếu ("còn size L không?") được ghép với nguồn đã trích dẫn ở lượt trước khi retrieval.
- Không có chunk đạt `RETRIEVAL_MIN_SIMILARITY` thì không gọi model và trả thiếu thông tin. Citation ngoài prompt, câu trả lời thiếu citation hoặc chứa con số không có trong nguồn bị thay bằng phản hồi thiếu thông tin.
- Prompt injection cơ bản (bỏ qua hướng dẫn, xin system prompt/API key) bị chặn bằng luật trước khi gọi model.
- Câu hỏi "sản phẩm nào sắp hết / hết hàng" được lọc theo `stock_status`.
- Trace ở `data/logs/web.ndjson`, `worker.ndjson` và `mcp.ndjson` (xoay vòng 10 MiB × 5 file). Mỗi node graph, tool call MCP, interrupt và resume ghi một dòng có `trace_id`, latency và số bước.

Các điểm triển khai khác plan gốc được ghi ở mục 32–33 của [plan](plans/fashion-assistant-implementation-plan.md).
