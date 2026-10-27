# Kế hoạch triển khai — Fashion Assistant

## Mục tiêu

Xây dựng Fashion Assistant cho cửa hàng quần áo thời trang nam theo hai giai đoạn:

- **Week 6:** chatbot RAG tư vấn sản phẩm và chính sách từ Excel/PDF.
- **Week 7:** mở rộng chatbot thành AI Agent xử lý tra đơn và tạo yêu cầu đổi/trả có người duyệt.

Đặc tả bài tập đầy đủ: [`../week6_week7_fashion_rag_agent_assignment.md`](../week6_week7_fashion_rag_agent_assignment.md).

## Quyết định đã chốt

### 1. Framework ứng dụng

**Đã chốt:** Next.js (App Router) + React + TypeScript + Vercel AI SDK.

**Lý do:** một codebase cho Knowledge CRUD, API route và chat streaming; `useChat` của Vercel AI SDK xử lý trạng thái chat và luồng dữ liệu tới browser.

### 2. Provider LLM và embedding

**Đã chốt:** OpenAI trực tiếp là provider mặc định cho generation và embeddings.

**Lý do:** tích hợp thẳng với Vercel AI SDK, phù hợp streaming, structured output và tool calling; đồng thời giúp kết quả golden set/eval ổn định hơn. OpenRouter hoặc DeepSeek chỉ được xem là phương án benchmark sau này, không nằm trong baseline.

### 3. Môi trường chạy

**Đã chốt:** chỉ chạy local bằng Docker Compose và mở truy cập demo qua Cloudflare Tunnel; không deploy lên Vercel hay hạ tầng cloud khác.

**Lý do:** Postgres + pgvector, ingestion file và trace được giữ trong môi trường local, dễ debug và đúng phạm vi bài tập. Cloudflare Tunnel chỉ cung cấp URL tạm để kiểm thử webchat từ browser bên ngoài.

### 4. Dữ liệu nguồn

**Đã chốt:** dùng bộ dữ liệu nguồn chuẩn tiếng Việt gồm Excel catalog sản phẩm và PDF FAQ/chính sách. Bộ dữ liệu do dự án tạo để mô phỏng nghiệp vụ thực tế, có nội dung nhất quán và dùng trực tiếp cho ingestion; không dùng placeholder/lorem ipsum.

**Lưu ý:** đây là dữ liệu demo, không được trình bày như dữ liệu vận hành của một cửa hàng có thật. Khi có file nghiệp vụ thật, thay file trong Knowledge CRUD và re-index để sử dụng dữ liệu chính thức.

### 5. Phạm vi Agent Week 7

**Đã chốt:** Agent chỉ được tra cứu đơn hàng giả lập, tra cứu chính sách đổi/trả và tạo yêu cầu đổi **size** hoặc trả hàng. Mọi yêu cầu ghi dữ liệu phải dừng để nhân viên phê duyệt trước khi thực hiện.

**Ngoài phạm vi:** đổi sang sản phẩm khác, hoàn tiền, gửi email, cập nhật trực tiếp đơn hàng, đăng nhập khách hàng và xác minh đơn hàng thật. Các hành động này không được cấp tool trong bài tập. Webchat tra đơn chỉ áp dụng dữ liệu seed không có PII thật; không được tái sử dụng cơ chế này cho dữ liệu vận hành.

### 6.1. Chế độ tạo phản hồi

**Đã chốt:** webchat dùng `streamText()` của Vercel AI SDK. `generateText()` chỉ dùng cho tác vụ không tương tác như chạy golden set/evals hoặc thao tác quản trị.

**Hợp đồng output Week 6:** `answer`, `citedSourceIds`, `insufficientInformation`. Dù output được ràng buộc theo schema, server vẫn kiểm tra mọi source ID có nằm trong các chunks đã retrieval trước khi trả kết quả cho browser.

### 6.2. Model generation

**Đã chốt:** dùng duy nhất snapshot `gpt-4.1-2025-04-14` cho Webchat RAG Week 6 và Agent Week 7.

```env
OPENAI_CHAT_MODEL=gpt-4.1-2025-04-14
```

**Lý do dùng snapshot:** khóa hành vi model cho golden set và trace, không phụ thuộc alias `gpt-4.1` thay đổi. Model hỗ trợ streaming, function calling và structured outputs.

**Rủi ro đã chấp nhận:** GPT-4.1 đã deprecated và OpenAI công bố ngày dừng là 2027-01-14. Trước khi cài đặt, kiểm tra model còn xuất hiện trong tài khoản API; không tự ý đổi model nếu chưa có quyết định mới.

### 6.3. Embedding model

**Đã chốt:** dùng `text-embedding-3-small` cho mọi lần ingestion và query retrieval.

```env
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

Tên model được lưu trên mỗi chunk. Không được đổi embedding model cho index hiện tại mà không re-index toàn bộ dữ liệu.

### 6.3a. Embedding dimension

**Đã chốt:** dùng dimension mặc định `1536` của `text-embedding-3-small`.

```env
EMBEDDING_DIMENSIONS=1536
```

Không rút gọn vector ở bản đầu; mỗi lần query và ingestion đều phải dùng cùng model/dimension.

### 6.3b. Retrieval defaults

**Đã chốt:**

```env
RETRIEVAL_TOP_K=8
RETRIEVAL_MIN_SIMILARITY=0.45
MAX_CONTEXT_CHUNKS=5
MAX_CONTEXT_TOKENS=1200
```

Query tìm 8 chunks theo cosine similarity, loại chunks dưới ngưỡng 0.45, sau đó đưa tối đa 5 chunks trong ngân sách 1.200 tokens vào prompt. Không có chunk đạt ngưỡng thì trả `insufficientInformation=true`. Mọi điều chỉnh sau này phải chạy lại golden set để so sánh.

**Lịch sử hiệu chỉnh:** 0.68 → 0.55 sau smoke test (áo sơ mi trắng có score đúng `0.576`). 0.55 → 0.45 khi PDF chuyển sang một chunk cho mỗi cặp hỏi–đáp: chunk ngắn hơn nên chunk đúng đứng hạng 1 nhưng chỉ đạt 0.49–0.54 (ví dụ `policy:giao-hang:1` = 0.489 cho câu hỏi kết hợp). Câu ngoài phạm vi/prompt injection trong golden set chỉ đạt 0.35–0.40. Golden set: 29/35 → 31/35, Recall@5 0.875 → 0.969.

### 6.4a. Temperature

**Đã chốt:** dùng `temperature=0.3`.

```env
OPENAI_TEMPERATURE=0.3
```

Mức này giúp câu trả lời tiếng Việt tự nhiên hơn trong khi các ràng buộc nguồn, schema và validation ở server vẫn kiểm soát tính chính xác.

### 6.5. System prompt RAG

**Đã tạo:** prompt được version trong [`../prompts/fashion-tomodev-rag-system.md`](../prompts/fashion-tomodev-rag-system.md). Prompt quy định phạm vi, quy tắc nguồn, xử lý thiếu dữ liệu, chống prompt injection và ý nghĩa của từng trường output. v2 (2026-10-27) thêm quy tắc ghi kèm mã sản phẩm khi nhắc tới sản phẩm. Prompt Agent Week 7 ở [`../prompts/fashion-tomodev-agent-system.md`](../prompts/fashion-tomodev-agent-system.md).

### 6.5a. Response transport và structured output

**Đã chốt:** `/api/chat` dùng `streamText()` với `Output.object(ChatAnswerSchema)` và UI Message Stream.

```ts
type ChatAnswer = {
  answer: string;
  citedSourceIds: string[]; // tối đa 5 IDs
  insufficientInformation: boolean;
};
```

Model stream các partial object; UI chỉ render giá trị `answer` mới nhất trong một bubble có trạng thái “đang kiểm tra nguồn”. Không cắt nội dung theo câu. Sau khi stream kết thúc, backend validate schema và source IDs rồi mới lưu kết quả, gửi source cards và đánh dấu câu trả lời hoàn tất. Citation không hợp lệ hoặc thiếu căn cứ khiến toàn bộ bubble bị thay bằng phản hồi thiếu thông tin an toàn; không lưu câu trả lời nháp.

### 6.4b. Max output tokens

**Đã chốt:** giới hạn tối đa 500 output tokens cho mỗi lần gọi generation.

```env
OPENAI_MAX_OUTPUT_TOKENS=500
```

Giới hạn này bao gồm phần output có cấu trúc và đủ cho câu trả lời tư vấn ngắn gọn bằng tiếng Việt.

### 6.4c. Timeout và retry

**Đã chốt:**

```env
OPENAI_TIMEOUT_MS=20000
OPENAI_MAX_RETRIES=1
```

Chỉ retry một lần với lỗi tạm thời (timeout, 429, 500, 502, 503, 504) và chỉ khi chưa gửi token nào về browser. Stream đã bắt đầu mà lỗi thì kết thúc với lỗi có `trace_id`, không tự phát lại. Client hủy chat phải hủy upstream request qua `AbortSignal`.

### 6.4d. Sampling parameter còn lại

**Đã chốt:** không truyền `top_p` hoặc `seed`; đặt `frequencyPenalty=0` và `presencePenalty=0`.

Temperature 0.3 là tham số sampling duy nhất được tinh chỉnh. OpenAI Responses API không nhận `frequency_penalty`/`presence_penalty` (AI SDK chỉ cảnh báo và bỏ qua), nên code không truyền hai tham số này và giá trị hiệu lực là mặc định 0. Không dùng penalties để tránh làm biến dạng tên sản phẩm, size, giá hoặc câu chữ chính sách; golden set đo chất lượng thay vì yêu cầu từng câu trả lời có cùng câu chữ.

### 6.5b. Dữ liệu gửi OpenAI và lưu response

**Đã chốt:** dùng OpenAI Responses API tường minh, lưu hội thoại ở Postgres local và không lưu response ở OpenAI.

```ts
model: openai.responses('gpt-4.1-2025-04-14'),
providerOptions: {
  openai: {
    store: false,
    strictJsonSchema: true,
    parallelToolCalls: false,
    user: hmac(visitorId),
  },
},
```

```env
MAX_HISTORY_TURNS=10
MAX_HISTORY_MESSAGES=20
```

Mỗi request gửi system prompt, tối đa 10 cặp hỏi–đáp gần nhất lấy từ Postgres, câu hỏi hiện tại và tối đa 5 RAG chunks. Không gửi file gốc, trace, dữ liệu admin, API key, email, số điện thoại hay định danh thật. Không dùng `previousResponseId` hoặc OpenAI Conversation API.

### 6.6. OpenAI service tier

**Đã chốt:** gửi `serviceTier: "default"` trong provider options.

Không dùng `flex`, `priority` hoặc `auto`; đây là lựa chọn xử lý chuẩn, phù hợp ứng dụng chạy local và không phát sinh yêu cầu ưu tiên hạ tầng.

### 7.1. Agent Week 7: giới hạn số bước và tool calls

**Đã chốt:** giới hạn Agent ở 5 bước và 5 tool calls; không chạy tool song song.

```env
AGENT_MAX_STEPS=5
AGENT_MAX_TOOL_CALLS=5
```

```ts
stopWhen: stepCountIs(5)
parallelToolCalls: false
```

Vượt giới hạn thì Agent dừng an toàn, ghi trace và yêu cầu khách thử lại hoặc liên hệ nhân viên. Tool ghi dữ liệu luôn qua `interrupt()` để chờ phê duyệt.

### 7.2. Embedding ingestion: batch size và chính sách lỗi

**Đã chốt:**

```env
EMBEDDING_BATCH_SIZE=50
EMBEDDING_TIMEOUT_MS=20000
EMBEDDING_MAX_RETRIES=1
```

Mỗi request embeddings gửi tối đa 50 chunks. Batch lỗi sau một lần retry khiến document có trạng thái `failed`, không được kích hoạt index dở dang. Chỉ các chunks có `content_hash` thay đổi mới được tạo embedding lại.

### 8. Database và vector store

**Đã chốt:** PostgreSQL 16 + pgvector, chạy local trong Docker Compose.

```text
Docker image: pgvector/pgvector:pg16
Vector column: vector(1536)
Distance metric: cosine similarity
Index: HNSW
```

Một database lưu knowledge documents/chunks/embeddings, chat threads/messages, kết quả eval và dữ liệu Week 7 (đơn hàng giả lập, checkpoint, memory, approval/audit). Trace runtime được ghi file local, không lưu bảng trace. Không thêm Chroma hoặc Qdrant.

### 9. ORM, migration và vector query

**Đã chốt:** Drizzle ORM + Drizzle Kit + postgres.js.

Drizzle schema khai báo `vector(1536)`, migration đầu tiên bật `CREATE EXTENSION IF NOT EXISTS vector`, và HNSW cosine index được tạo trong migration. CRUD và retrieval dùng query typed; không dùng Prisma hoặc raw SQL cho mọi vector query.

### 10. Local file storage cho Knowledge CRUD

**Đã chốt:** lưu file gốc ở local filesystem với Docker bind mount.

```text
data/raw/                                      # dữ liệu seed ban đầu
data/uploads/<document-id>/<uuid>.<ext>        # file do admin upload
data/trash/                                    # file đã soft-delete
```

Database chỉ lưu metadata, tên hiển thị gốc đã được sanitize, content hash, storage key sinh bởi server, version và trạng thái ingestion. Upload copy file vào `data/uploads`; re-index đọc file local. Xóa Knowledge soft-delete metadata và chuyển file vào `data/trash` để có thể khôi phục trong thời gian làm bài.

### 11. Xác thực và phân quyền cho admin/Knowledge CRUD

**Đã chốt:** một tài khoản admin nội bộ, không có đăng ký tài khoản hay auth service ngoài.

```env
ADMIN_PASSWORD_HASH=<scrypt-hash>
ADMIN_SESSION_SECRET=<random-secret>
```

`/chat` cho phép khách ẩn danh. `/admin/*` và API upload/re-index/xóa/duyệt yêu cầu admin session: cookie ký, `HttpOnly`, `Secure`, `SameSite=Strict`. Dùng Node `crypto.scrypt`; giới hạn đăng nhập sai 5 lần mỗi 15 phút theo IP. Không có customer auth ở bài tập: tra đơn Week 7 chỉ dùng mã đơn seed, không chứa PII thật.

### 12. Rate limit và giới hạn request

**Đã chốt:**

```env
CHAT_RATE_LIMIT=30
CHAT_RATE_WINDOW_SECONDS=600
MAX_USER_MESSAGE_CHARS=2000
UPLOAD_MAX_BYTES=10485760
UPLOAD_RATE_LIMIT=10
UPLOAD_RATE_WINDOW_SECONDS=3600
```

Public chat bị giới hạn theo `visitor_id` kết hợp IP; upload chỉ dành cho admin. Rate limit dùng in-memory store vì chỉ có một `web` container trong phạm vi bài tập; reset khi service restart là chấp nhận được. Chỉ nhận PDF/XLSX sau khi kiểm tra MIME type, extension và file signature. Next.js chỉ bind `localhost`; Cloudflare Tunnel là đường vào duy nhất.

### 13. Ingestion và chiến lược chunking

**Đã chốt:**

- Excel chỉ đọc sheet `Catalog sản phẩm`; mỗi dòng sản phẩm là đúng một chunk. Cột bắt buộc: `product_id`, `product_name`, `price_vnd`, `updated_at`. Chunk được chuẩn hóa thành text có nhãn cho mã, tên, loại, giá, mô tả, size, màu, chất liệu, tồn kho và ngày cập nhật; source ID ổn định có dạng `product:<product_id>`.
- PDF được trích text theo heading và từng cặp câu hỏi–trả lời. Một FAQ/chính sách là một chunk, không cắt theo trang hoặc số ký tự; chỉ mục dài hơn 800 tokens mới tách nhỏ. Source ID có dạng `policy:<section-slug>:<index>`.
- Mọi chunk lưu title, page (nếu có), `updated_at`, document version và `content_hash` trong metadata. Content không đổi không tạo embedding lại.

### 14. Retrieval cho câu hỏi nối tiếp/nhiều lượt

**Đã chốt:** không thêm một model call để rewrite query ở bản đầu. Nếu câu hỏi hiện tại là câu tham chiếu/ngắn, retrieval query được ghép từ câu hỏi hiện tại và title/source ID đã validate ở câu trả lời ngay trước.

Không dùng text trả lời trước của model làm dữ kiện; chỉ dùng metadata nguồn đã validate. Nếu không có citation ở lượt trước thì retrieval dùng câu hỏi hiện tại độc lập.

### 15. Retrieval cho câu hỏi nhiều ý

**Đã chốt:** không dùng LLM để tách ý. Luôn semantic search với toàn bộ câu hỏi; nếu phát hiện keyword chính sách thì chạy thêm policy query có filter `source_type=policy`, sau đó gộp và khử trùng lặp theo `source_id` trước khi áp dụng giới hạn context.

Keyword ban đầu: `ship`, `giao hàng`, `phí giao` → giao hàng; `đổi`, `trả`, `hoàn tiền` → đổi/trả; `COD`, `thanh toán`, `chuyển khoản` → thanh toán; `size`, `số đo` → hướng dẫn size. Toàn bộ query, score và chunks sau khi merge phải xuất hiện trong trace.

### 16. Cách chạy ingestion/re-index từ Knowledge CRUD

**Đã chốt:** PostgreSQL job table + một Node worker container; không dùng Redis/BullMQ.

Upload/re-index tạo document/job `pending`; worker lấy job bằng `FOR UPDATE SKIP LOCKED`, chuyển trạng thái sang `processing`, parse → chunk → embed → index, rồi chỉ kích hoạt version document khi thành công toàn bộ. UI hiển thị `uploaded → processing → ready/failed`; lỗi không ảnh hưởng webchat và có thể tạo job re-index mới.

### 17. Docker Compose services và network local

**Đã chốt:** bốn services: `web`, `worker`, `db` và `cloudflared`.

`web` bind `127.0.0.1:3000`; `worker` và `web` dùng chung application image/codebase; `db` có named volume; `data/uploads` và `data/trash` là host bind mounts. `cloudflared` chạy qua Compose profile `tunnel`, trỏ nội bộ đến `http://web:3000`; tunnel token chỉ đặt trong `.env`. Không dùng nginx.

### 18. Trace, logging và observability local

**Đã chốt:** dùng Pino ghi JSON Lines vào file local; không dùng trace table, dashboard hay SaaS observability trong bài tập.

```text
data/logs/web.ndjson
data/logs/worker.ndjson
```

Mỗi dòng log có `trace_id`, timestamp, stage, latency, source IDs, similarity scores, token usage và error category. Log directory là host bind mount; rotation 10 MiB/file, giữ 5 file gần nhất. Không log API key, password, file gốc hoặc dữ liệu nhạy cảm. Khi debug cần truy vấn, dùng `trace_id` với công cụ đọc NDJSON cục bộ; không có trang `/admin/traces`.

### 19. Golden set và cách chạy eval

**Đã chốt:** golden set versioned ở `evals/golden-set.v1.json`, có ít nhất 30 case, chạy bằng `pnpm eval:rag`.

Mỗi case có message(s), expected source IDs, expected answer keywords/numbers và expected `insufficientInformation`. Runner đo Recall@5, citation validity/coverage, từ chối đúng, keyword/số liệu bắt buộc, latency/token/lỗi; kết quả ghi vào `data/eval-results/<timestamp>.json`. Không dùng LLM-as-a-judge hoặc CI ở bản đầu.

### 20. UI toolkit và phạm vi giao diện

**Đã chốt:** Tailwind CSS v4 + shadcn/ui + Lucide icons.

Chỉ dùng Button, Input, Textarea, Card, Table, Dialog, Sheet, Badge, Tabs, Toast và Progress. Week 6 có `/chat`, `/admin/login`, `/admin/knowledge`, `/admin/knowledge/[id]`; Week 7 thêm `/admin/approvals`. Không có `/admin/traces`, UI kit trả phí, chart library hoặc dashboard template. Chat desktop-first nhưng responsive mobile.

### 21. Test tự động ngoài golden set

**Đã chốt (mức cơ bản):** Vitest unit tests + checklist test tay; chưa thêm Playwright, Testcontainers, test database riêng hay CI.

```text
pnpm test      # Vitest, không gọi OpenAI thật
pnpm eval:rag  # golden set, gọi OpenAI thật khi chủ động chạy
pnpm eval:agent # golden set Agent Week 7, gọi OpenAI thật khi chủ động chạy
```

Unit tests dùng fake model/fixture và chỉ cover các phần có rủi ro cao: parser Excel/PDF, chunking, source validation, policy keyword detection, guardrail input cơ bản và Week 7 policy/order validation. Checklist test tay cover upload → indexing → chat streaming → citation → approval → resume và lỗi thiếu thông tin.

### Hợp đồng OpenAI đã chốt

Không còn tham số OpenAI nào cần quyết định trước khi implement. Bất kỳ thay đổi nào với model, embedding, retrieval hoặc prompt đều phải cập nhật golden set và chạy eval lại.

### 22. Package manager và development checks

**Đã chốt (mức cơ bản):** pnpm, TypeScript strict mode và ESLint. Dependency dùng version cố định trong `package.json`, commit `pnpm-lock.yaml` và cung cấp `.env.example`; chưa thêm Prettier, Husky, lint-staged hoặc format check riêng.

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm eval:rag
pnpm eval:agent
```


### 23. Cấu trúc source code

**Đã chốt:** một Next.js application duy nhất, không monorepo.

```text
src/app/        # pages và route handlers
src/components/ # UI
src/db/         # Drizzle schema, migrations, queries
src/features/   # knowledge, rag, chat, admin, agent
src/lib/        # OpenAI, logging, auth, validation
src/worker/     # ingestion worker
prompts/
evals/
data/
```

Phân tách được Week 6 và Week 7 trong cùng codebase mà không tạo thêm package/app quản lý riêng.

### 24. Schema database tối thiểu cho Week 6

**Đã chốt:** sáu bảng: `knowledge_documents`, `knowledge_document_versions`, `knowledge_chunks`, `ingestion_jobs`, `chat_threads`, `chat_messages`.

Chunks gắn với `document_version_id`; chỉ version `ready` được retrieval. Thay file tạo version mới, còn version cũ phục vụ chat đến khi version mới index thành công. `chat_messages.citations` lưu source IDs đã validate. Orders, approvals, checkpoints và memory chỉ được thêm ở Week 7.

### 25. API contract tối thiểu Week 6

**Đã chốt:**

```text
POST   /api/chat
POST   /api/admin/session
DELETE /api/admin/session
GET    /api/admin/documents
POST   /api/admin/documents
GET    /api/admin/documents/:id
DELETE /api/admin/documents/:id
POST   /api/admin/documents/:id/reindex
POST   /api/admin/retrieval-test
```

Browser chỉ gửi `threadId` (nếu có) và message hiện tại đến `/api/chat`. Server tự tạo/fetch thread, đọc lịch sử từ Postgres và không nhận source, prompt, model ID, visitor ID hoặc lịch sử tự khai từ browser. Response là UI Message Stream có `trace_id`, partial answer, trạng thái và source cards. Không có source đạt ngưỡng thì trả thiếu thông tin mà không gọi OpenAI.

### 26. Node runtime và Docker base image

**Đã chốt:** Node.js 24 LTS, image `node:24-bookworm-slim`, pnpm qua Corepack.

Không dùng Alpine để giảm rủi ro tương thích native dependency cho PDF parsing/crypto trong local Docker.

### 27. MCP server topology cho Week 7

**Đã chốt:** Week 7 thêm service `mcp` viết bằng TypeScript MCP SDK, dùng Streamable HTTP tại `http://mcp:3001/mcp` trong Docker network.

Service không publish port ra host hoặc Cloudflare Tunnel; `web`/LangGraph là MCP client. MCP mở `lookupProduct`, `lookupOrder`, `searchPolicy`, `createExchangeRequest`, `createReturnRequest`. LangGraph giữ Human-in-the-loop: tool ghi chỉ được gọi sau `interrupt()` và admin approval.

### 28. LangGraph checkpoint và long-term memory

**Đã chốt:** dùng `PostgresSaver` và `PostgresStore` trên PostgreSQL đã có, trong schema `langgraph`.

`thread_id` là UUID `chat_threads.id`. Checkpointer lưu graph state phục vụ `interrupt()`/`resume()`; Store dùng namespace `['fashion-tomodev', visitorId, 'profile']` và chỉ lưu JSON đơn giản như size thường chọn/yêu cầu gần nhất, không bật semantic memory. Checkpoint/Store giữ 30 ngày và worker dọn dữ liệu hết hạn hằng ngày; gọi `.setup()` khi service khởi động lần đầu.

### 29. Human-in-the-loop approval flow Week 7

**Đã chốt:** Agent chỉ đề xuất write khi server-side validation hợp lệ, rồi gọi `interrupt({ action, payload, summary, sourceIds, idempotencyKey })` trước mọi write tool.

Validation tối thiểu: item phải thuộc order; order đã giao và ngày nhận không quá 7 ngày; item không thuộc nhóm bị loại trừ; đổi size phải có size yêu cầu trong catalog và sản phẩm còn hàng; trả hàng chỉ nhận lý do `wrong_item`, `wrong_size_or_color` hoặc `manufacturing_defect`. Không làm upload ảnh/video ở bản đầu: request trả hàng được tạo ở trạng thái chờ và admin approval là bước xác minh thủ công của demo, không phải chấp nhận hoàn tiền.

Tạo bảng `approval_requests` gồm `thread_id`, action, payload, source IDs, unique idempotency key, trạng thái `pending|approved|rejected|expired`, người duyệt, note và timestamps. Admin chỉ duyệt/từ chối, không sửa payload. Approved resume đúng `thread_id` rồi mới gọi MCP write tool; rejected resume để Agent phản hồi khách. Request hết hạn sau 7 ngày; idempotency key là `order_id + product_id + action + requested_size` (nếu không phải đổi size thì không có hậu tố size), để gửi lại cùng yêu cầu không tạo bản ghi trùng. Mọi quyết định ghi audit log.

Week 7 có ba API admin cơ bản: `GET /api/admin/approvals`, `POST /api/admin/approvals/:id/approve`, `POST /api/admin/approvals/:id/reject`. Hai endpoint quyết định thực hiện `resume` đúng `thread_id`; trang `/admin/approvals` hiển thị các request pending và hai nút Duyệt/Từ chối.

### 30. Dữ liệu đơn hàng giả lập cho Week 7

**Đã chốt:** thêm `orders`, `order_items`, `exchange_return_requests`, `audit_logs` và seed 12 đơn hàng giả lập có product IDs thật từ Excel, không chứa PII thật.

Mã đơn `FT-2026-1001` đến `FT-2026-1012` bao phủ: đơn giao trong/quá 7 ngày, đang giao, đã có yêu cầu đổi/trả, mã đơn không tồn tại, phụ kiện không đổi, đổi size và trả vì lỗi. Không seed hay hỗ trợ đổi sang sản phẩm khác. Seed chạy từ script versioned khi khởi tạo database.

### 31. Golden set Agent Week 7

**Đã chốt:** thêm `evals/agent-golden-set.v1.json` với tối thiểu 30 tình huống, chạy bằng `pnpm eval:agent`. Bộ case bao phủ tra đơn hợp lệ/không tồn tại, điều kiện đổi size/trả hàng hợp lệ và không hợp lệ, pending/approve/reject/resume, idempotency, prompt injection và yêu cầu ngoài phạm vi. Runner dùng fake MCP/approval fixture cho test thường; chỉ chạy OpenAI thật khi chủ động chạy eval Agent.

### 32. Điều chỉnh khi triển khai Week 6

**Đã chốt (2026-10-27):** các điểm dưới đây thay thế quyết định tương ứng ở trên cho Week 6.

| Mục gốc | Thực tế triển khai | Lý do |
| --- | --- | --- |
| #9 Drizzle ORM + Drizzle Kit | postgres.js với tagged-template SQL (tham số hóa), migration SQL đánh số trong `src/db/migrations` chạy bằng `pnpm db:migrate` có advisory lock | Bản đang chạy ổn định; chuyển ORM không thay đổi hành vi và cần reset DB |
| #1, #6.5a `useChat` + UI Message Stream | Server-Sent Events tự định nghĩa (`start`, `partial`, `complete`, `error`) và client đọc stream bằng `fetch` | Giữ nguyên hợp đồng: partial answer, trạng thái "đang kiểm tra nguồn", source cards và `trace_id` chỉ gửi khi validate xong |
| #20 shadcn/ui + Lucide | Tailwind CSS v4 thuần | Phạm vi UI nhỏ (chat + admin), không cần thêm component library |
| #24 chỉ version `ready` được retrieval | `knowledge_documents.active_version_id`; worker chỉ gán sau khi index thành công trong cùng transaction | Version cũ phục vụ chat khi version mới đang xử lý hoặc lỗi; hai version `ready` không bị retrieve lẫn nhau |
| #15 chỉ semantic + policy query | Thêm query lọc theo danh mục sản phẩm (khi câu hỏi nêu tên danh mục) và query tổng quan catalog; hai query này xếp theo similarity thật nhưng không áp ngưỡng. Kết quả các query được gộp xoay vòng theo hạng (query có ngưỡng trước) | Câu hỏi danh mục ("áo thun có không?") embed kém; gộp xoay vòng giữ chunk tốt nhất của mỗi ý trong câu hỏi nhiều ý |
| #13 chunk PDF | PDF dạng bảng "Câu hỏi \| Thông tin" được tách theo tọa độ chữ: mỗi hàng hỏi–đáp là một chunk, có số trang; PDF không có bảng dùng cách tách theo heading | Đúng nguyên tắc một FAQ một chunk mà không phụ thuộc text phẳng của PDF |
| #6.5b `user: hmac(visitorId)` | HMAC-SHA256 với `ADMIN_SESSION_SECRET` | Không thêm secret mới |

Kết quả golden set baseline (35 case, 2026-10-27): 31/35 pass, Recall@5 0.969, citation validity 1.0, citation coverage 0.953, từ chối đúng 0.971. Case còn fail: hỏi theo tình trạng tồn kho ("sắp hết hàng" — semantic search không lọc được `stock_status`), hai case đúng nội dung nhưng khác từ khóa mong đợi, và một case kết hợp chỉ trích dẫn nguồn chính sách.

### 33. Chốt bổ sung trước khi triển khai Week 7

**Đã chốt (2026-10-27):** bổ sung và làm rõ các mục #5, #7.1, #27–#31.

1. **LLM trong LangGraph:** node `agent` dùng `@langchain/openai` (`ChatOpenAI`) với Responses API, cùng snapshot `gpt-4.1-2025-04-14`, temperature/max tokens/timeout/retry như Week 6, `store: false`, `service_tier: default`, `user = hmac(visitorId)`, `parallel_tool_calls: false`. Embedding và RAG Week 6 tiếp tục dùng Vercel AI SDK.
2. **Routing trong graph:** mọi tin nhắn đi qua LangGraph. Node `router` (quy tắc, không gọi LLM) chuyển câu hỏi có mã đơn, ý định đổi/trả/tra đơn, hoặc thread đang có ngữ cảnh đơn hàng sang `agent`; còn lại sang node `rag` chạy đúng pipeline Week 6 (streaming, citation validation). Câu trả lời cuối của `agent` đi qua tool `final_answer` với cùng hợp đồng `answer`, `citedSourceIds`, `insufficientInformation`; citation chỉ hợp lệ nếu thuộc source IDs mà tool đã trả về trong lượt đó (`product:*`, `policy:*`, `order:*`). Golden set Week 6 chạy qua graph phải không thấp hơn baseline 31/35.
3. **Khách nhận kết quả sau phê duyệt:** thêm `GET /api/chat/threads/:id` (chỉ chủ cookie visitor đọc được). Khi có yêu cầu `pending`, UI hiện "Đang chờ nhân viên duyệt", khóa ô nhập và poll endpoint này cho đến khi có câu trả lời sau `resume`. Thread ID lưu ở `localStorage` để tải lại lịch sử khi refresh. Trong lúc chờ duyệt, server không chạy graph cho tin nhắn mới của thread đó.
4. **Dữ liệu catalog có cấu trúc:** ingestion lưu thêm `sizes` và `colors` (mảng) vào metadata chunk sản phẩm; nội dung chunk không đổi nên re-index dùng lại embedding. `lookup_product` đọc từ chunk của version active.
5. **Ngày tương đối:** seed đơn hàng tính `delivered_at` tương đối theo thời điểm chạy seed. `pnpm eval:agent` reset dữ liệu đơn seed (ngày, yêu cầu, approval) trước khi chạy để kết quả không phụ thuộc ngày chạy.
6. **Bảng và quyền ghi:** `order_items` có `size`, `color`, `quantity`, `unit_price_vnd`, `discount_percent`, `is_opened`; `orders` có `status` và `delivered_at`. MCP write tool nhận thêm `approval_request_id` (do server điền, model không thấy) và chỉ ghi khi approval đó `approved` và payload khớp. Unique index cho approval `pending|approved` theo idempotency key; yêu cầu bị từ chối/hết hạn có thể đề xuất lại.

Ngoài ra: giới hạn 5 lần gọi model và 5 tool call được tính lại từ đầu cho mỗi tin nhắn mới và mỗi lần `resume`. Approval hết hạn được worker chuyển `expired` và `resume` thread để Agent báo khách.

**Guardrail bổ sung sau eval Agent lần đầu (chặn ở server, không chỉ dựa vào prompt):**
- Lần gọi model cuối cùng trong giới hạn bị ép `tool_choice = final_answer`, để Agent trả lời bằng dữ liệu đã có thay vì dừng ở thông báo vượt giới hạn.
- Sau khi approval bị từ chối/hết hạn, Agent không được đề xuất lại yêu cầu trong cùng lượt (`just_decided`).
- Lý do trả hàng phải có căn cứ trong lời khách (sai sản phẩm, sai size/màu, lỗi); model không được tự chọn lý do (`reason_not_stated`).
- Prompt Agent nhận danh sách source ID hợp lệ của lượt để giảm citation bịa; citation ngoài danh sách vẫn bị thay bằng phản hồi thiếu thông tin.

**Guardrail bổ sung cho cả RAG và Agent:**
- Kiểm tra số liệu: mọi số > 10 trong câu trả lời phải có trong nguồn đã trích (RAG), kết quả tool của lượt (Agent), lời khách hoặc là tổng/hiệu của hai số trong đó (số lượng × giá với số lượng ≤ 10); nếu không, thay bằng phản hồi thiếu thông tin (`unsupported_number`).
- Node `guard` chặn prompt injection cơ bản bằng luật (bỏ qua hướng dẫn, xin system prompt/API key, đổi vai) trước khi gọi bất kỳ model nào.
- Retrieval thêm truy vấn lọc `stock_status` cho câu hỏi "sắp hết / hết hàng", ưu tiên trong bước gộp.

**Kết quả eval (2026-10-27, lưu ở `evals/results/`):** Agent 32/34, 0 lần ghi trước phê duyệt (28/34 trước khi bổ sung guardrail). Golden set Week 6 chạy qua graph (prompt RAG v2, kiểm tra số liệu, guard injection, lọc tồn kho) 33/35, Recall@5 1.0, citation validity 1.0, keyword 1.0 — cao hơn baseline Week 6 31/35.

### Các quyết định kỹ thuật còn cần chốt

| # | Vấn đề | Trạng thái |
| --- | --- | --- |
| — | Không còn quyết định kiến trúc bắt buộc trước khi scaffold | Hoàn tất |

### Kiến trúc mục tiêu

```text
Browser
  └─ Next.js UI (React + Vercel AI SDK useChat)
       ├─ /chat
       ├─ /admin/knowledge
       └─ Week 7: /admin/approvals
              │
              ▼
       Next.js Route Handlers
       ├─ Knowledge CRUD / ingestion
       ├─ RAG retrieval / chat streaming
       └─ Week 7: Agent workflow / approval
              │
              ▼
       PostgreSQL + pgvector
```

## Trạng thái quyết định

Toàn bộ các quyết định nền tảng đã được chốt. Có thể bắt đầu thiết kế chi tiết và triển khai Week 6 mà không thay đổi scope.

## Nguyên tắc triển khai

- Hoàn thành và đánh giá RAG Week 6 trước khi thêm Agent Week 7.
- API key chỉ ở server-side environment variables, không đưa xuống browser.
- Mọi câu trả lời RAG phải có citation hoặc từ chối khi không đủ thông tin.
- Có `trace_id`, log retrieval và golden set để đánh giá thay đổi.
- Chỉ thêm thành phần sau khi quyết định liên quan đã được chốt.
