# Kế hoạch refactor AI Agent — nhiều Agent, Knowledge scope, MCP Server

> **Trạng thái: Phase 1–4 đã làm xong và kiểm tra (chưa commit). Phase 0 và 5 còn lại (cần OpenAI key).** Q&A đã chốt (Q1–Q8); các điểm tự giả định ở mục 8. Chi tiết phần đã làm và chỗ lệch khỏi plan ở mục 9.

## 1. Mục tiêu

1. Menu admin có nhóm **AI**: **AI Agents**, **Knowledge**, **MCP Server**, **Phê duyệt**.
2. Tạo được **nhiều AI Agent**, có một Agent **mặc định**; mỗi Agent chọn **Knowledge scope** và **MCP Server/tool** nó dùng.
3. **Knowledge scope**: tên + mô tả, gán nhiều file. Scope là một **tool** (tool name + tool description do admin đặt) để model tự quyết định khi nào gọi và tìm đúng nhóm file.
4. **MCP Server**: quản lý danh sách server (thêm/sửa/bật tắt/kiểm tra kết nối/xem tool).

## 2. Hiện trạng (rút ra từ code)

| Chủ đề | Hiện tại | Ảnh hưởng |
|---|---|---|
| Menu | Nhóm "Trợ lý AI" trong [admin-shell.tsx](../src/components/admin/admin-shell.tsx) (Duyệt đổi/trả, Knowledge) | Thay bằng nhóm AI mới |
| Graph | Một graph, prompt đọc từ `prompts/fashion-tomodev-agent-system.md` lúc import; model/giới hạn từ `env` ([graph.ts](../src/features/agent/graph.ts), [runtime.ts](../src/features/agent/runtime.ts)) | Cấu hình theo Agent (DB) |
| Tool | 12 tool hằng số trong [tools.ts](../src/features/agent/tools.ts), chạy qua một MCP server nội bộ ([mcp/server.ts](../src/mcp/server.ts)), URL từ `env.MCP_URL` ([gateway.ts](../src/features/agent/gateway.ts)) | Tool built-in + tool động |
| An toàn | `thread_id` do server điền; `checkout`/`cancel_order` cần khách xác nhận; đổi/trả cần nhân viên duyệt | **Phải giữ nguyên** |
| Knowledge | `knowledge_documents → versions → chunks`; [retrieval.ts](../src/features/rag/retrieval.ts) tìm trên mọi document active, có nhánh riêng cho product/stock/category/policy | Lọc theo document của scope; bỏ nhánh product |
| Route | [router.ts](../src/features/agent/router.ts) regex chọn `rag`/`agent`/`guard` | Bỏ router + node `rag` |
| Thread | `chat_threads` chưa biết Agent | Thêm `agent_id` |

## 3. Quyết định đã chốt (Q&A)

### Q1 — MCP & HITL: Built-in + external
- Server nội bộ "Fashion Tomodev" seed `is_builtin = true`: **không xóa, không sửa URL**; admin chỉ bật/tắt từng tool cho từng Agent.
- Tool built-in giữ nguyên node `confirm`/`approve` và việc server điền `thread_id`/`approval_id`/`confirmation_id` (không nằm trong schema model thấy). **Cờ HITL của tool built-in là hằng số trong code, không sửa được từ UI.**
- Tool server bên ngoài: chỉ dùng tool admin đã tick cho Agent. Mặc định chạy ngay. Admin có thể đánh dấu từng tool **"cần nhân viên duyệt"** → đi qua luồng approval chung (generalize bảng `approval_requests`: thêm action `mcp_tool`, payload lưu server + tool + args).
- Tool ngoài **không nhận `thread_id`** (không biết khách là ai), chỉ nhận tham số model đưa ra.

### Q2 — Scope ↔ file, và sản phẩm
- **Sản phẩm là tool riêng**, không phải Knowledge scope. `search_products` (built-in) chuyển thành **hybrid** (từ khóa unaccent + vector); giá và tồn kho **luôn đọc từ DB** lúc trả kết quả, không lấy từ nội dung chunk.
- Chunk `db:catalog` giữ làm index nội bộ cho `search_products`, **ẩn khỏi UI Knowledge**, không gán được vào scope. Sửa sản phẩm vẫn re-sync chunk như hiện tại.
- Scope ↔ file là **N–N**. Agent chọn nhiều scope → lấy **hợp** document, loại trùng chunk theo `source_id`.
- Migration seed scope **"Chính sách"** chứa FAQ PDF hiện có.

### Q3 — Một agent-loop duy nhất
- Bỏ `chooseRoute` và node `rag`. Scope tool, `search_products` và mọi tool khác là tool trong vòng lặp; model chọn dựa vào **tool name + description**.
- Giữ trước vòng lặp (không gọi model): **guard** chống prompt injection và **small-talk shortcut**.
- `respond` vẫn kiểm citation + `enforceGroundedNumbers`.
- Chấp nhận: câu hỏi FAQ chậm/đắt hơn (1 lần gọi tool + 1 lần `final_answer`).
- Chạy lại `eval:rag` và `eval:agent`; `eval-rag.ts` chạy qua agent-loop.

### Q4 — Cấu hình Agent: tách prompt 2 phần
- **Core an toàn** (khóa, file trong `prompts/`, luôn nối vào): chỉ trả lời từ tool, không tự xác nhận đặt hàng, luật đổi/trả, định dạng `final_answer`/citation.
- **Hướng dẫn/nhân cách** (admin sửa, lưu DB, seed từ nội dung hiện tại).
- Field: `name`, `slug`, `description`, `instructions`, `model` (chọn trong danh sách cho phép), `temperature`, `max_steps`, `max_tool_calls`, `is_active`, `is_default`.
- Prompt cuối = core + instructions + mô tả tự sinh về tool/scope đang bật.

### Q5 — Chọn Agent khi chat
- Widget storefront **luôn dùng Agent default**; khách không chọn.
- Trang chi tiết Agent trong admin có **"Chat thử"** chạy đúng Agent đó. Thread gắn `is_test`; UI cảnh báo "tool ghi vẫn chạy thật".
- `chat_threads.agent_id` ghi lúc tạo thread; thread cũ giữ Agent dù default đổi.

### Q6 — Menu
Nhóm **AI**: **AI Agents**, **Knowledge**, **MCP Server**, **Phê duyệt** (đổi tên từ "Duyệt đổi/trả", giữ badge và route `/admin/approvals`).

### Q7 — MCP Server: HTTP + Bearer/header + chống SSRF
- Chỉ **Streamable HTTP**; **không stdio**.
- Auth: không / Bearer / header tùy ý; mã hóa bằng [secrets.ts](../src/lib/secrets.ts) (AES-256-GCM), **không trả lại UI**.
- Chặn loopback, mạng riêng, link-local (gồm metadata cloud) và IPv6 tương đương, trừ host trong env `MCP_ALLOWED_HOSTS` (mặc định `mcp:3001`). Resolve DNS và kiểm tra ở **mỗi lần gọi**, không theo redirect.
- Nút **Kiểm tra kết nối** (`initialize` + `tools/list`), cache tool, hiện annotations (`readOnlyHint`, `destructiveHint`).
- Giới hạn timeout, kích thước kết quả, số tool/server. Tên tool đưa cho model có tiền tố `<server_slug>__<tool>`.

### Q8 — Xóa/tắt: chặn + liệt kê phụ thuộc
- **Agent default**: không xóa/tắt; phải đặt Agent khác làm default trước.
- **Agent đã có thread**: chỉ **lưu trữ** (soft delete, `archived_at`); không dùng cho chat mới, thread cũ vẫn đọc được. Agent chưa có thread mới được xóa hẳn.
- **Scope/MCP server đang được Agent dùng**: chặn xóa và hiện danh sách Agent đang dùng. **Tắt** (disable) vẫn cho phép, UI cảnh báo, Agent bỏ qua tool đó.
- Gỡ file khỏi scope chỉ xóa liên kết (không xóa file).
- Server built-in không xóa được. Tool built-in write không tắt HITL được.

## 4. Mô hình dữ liệu (migration `0009_ai_agents.sql`)

```
ai_agents
  id uuid PK, name, slug UNIQUE, description, instructions text,
  model, temperature numeric, max_steps int, max_tool_calls int,
  is_active bool, is_default bool, archived_at timestamptz,
  created_at, updated_at
  -- UNIQUE INDEX (is_default) WHERE is_default AND archived_at IS NULL
  -- default phải is_active

knowledge_scopes
  id uuid PK, name, tool_name UNIQUE CHECK (~ '^[a-z][a-z0-9_]{2,40}$'),
  tool_description text, created_at, updated_at
  -- tool_name không trùng tên tool built-in (danh sách reserved trong code)

knowledge_scope_documents           -- N–N
  scope_id FK CASCADE, document_id FK, PK(scope_id, document_id)
  -- không cho gán document mime = catalogMime

agent_knowledge_scopes
  agent_id FK CASCADE, scope_id FK RESTRICT, PK(agent_id, scope_id)

mcp_servers
  id uuid PK, name, slug UNIQUE, url, auth_type ('none'|'bearer'|'header'),
  auth_header_name, auth_secret_encrypted, is_builtin, enabled,
  last_checked_at, last_status, last_error, tools_cache jsonb,
  created_at, updated_at

agent_mcp_tools                     -- (đã thay bằng agent_mcp_servers + mcp_servers.selected_tools, xem mục 9: "Điều chỉnh sau Phase 4")
  agent_id FK CASCADE, mcp_server_id FK RESTRICT, tool_name,
  requires_approval bool, PK(agent_id, mcp_server_id, tool_name)
  -- requires_approval chỉ có nghĩa với server external

chat_threads  + agent_id FK (RESTRICT), + is_test bool default false
approval_requests  CHECK action: thêm 'mcp_tool' (payload: server_id, tool, args)
```

Seed trong migration/script: 1 Agent default (instructions lấy từ prompt hiện tại, model/giới hạn từ env hiện tại), 1 MCP server built-in (URL từ `MCP_URL`), scope "Chính sách" + FAQ PDF, gán scope + toàn bộ tool built-in cho Agent default, `chat_threads.agent_id` của thread cũ = Agent default. Seed phải idempotent.

## 5. Thiết kế kỹ thuật

### 5.1 Catalog tool built-in (code)
`src/features/agent/builtin-tools.ts` — mỗi tool: `name`, schema, `kind` (`read` | `cart` | `confirm` | `approval`), `injectThread`. Đây là nguồn sự thật cho luồng HITL; DB chỉ quyết định tool nào **bật** cho Agent. `tools.ts` hiện tại chuyển thành catalog này.

### 5.2 Resolve cấu hình lúc chạy
- **Giữ một graph compile duy nhất**; cấu hình Agent đọc theo `thread.agent_id` ở đầu mỗi lượt/resume (`resolveAgentRuntime(threadId)`) và truyền qua `config.configurable`. Node đọc prompt/model/giới hạn/tool từ đó.
- Cache theo `agent.updated_at` (+ updated_at của scope/server liên quan); admin sửa có hiệu lực ngay, không restart.
- `resolveAgentRuntime` trả: prompt cuối, danh sách tool schema (built-in bật + scope tool + external tool), map `tool → executor`, model/giới hạn.
- Khi **resume** thread đang chờ duyệt mà tool đã bị gỡ/tắt: `execute` kiểm tra lại, nếu không còn hợp lệ → từ chối an toàn và báo khách, không gọi tool.

### 5.3 Knowledge scope tool
- Mỗi scope bật cho Agent sinh một tool `{tool_name}({query})`, description = `tool_description`.
- `retrieve()` đổi chữ ký: `retrieve({ query, traceId, documentIds })`; lọc `d.id = ANY(documentIds)`. Bỏ các nhánh stock/category/catalog-overview/policy-topic (sản phẩm đã sang `search_products`).
- Kết quả tool trả `source_id`, `title`, `content`, `similarity`, `updated_at` như `search_policy` hiện tại → ghi vào `turnSources` để `respond` kiểm citation.
- Trang admin kiểm thử truy xuất theo scope (mở rộng `/api/admin/retrieval-test` nhận `scopeId`).

### 5.4 `search_products` hybrid
Từ khóa (unaccent, [queries.ts](../src/features/catalog/queries.ts)) + vector trên chunk `db:catalog`, gộp bằng RRF, map `source_id` → mã sản phẩm, rồi nạp giá/tồn kho từ DB. Không đổi shape kết quả đang dùng (`AgentProductHit`).

### 5.5 Tool từ MCP server bên ngoài
- Gateway mới `callExternalTool(server, tool, args)`: client SSRF-guard, header auth giải mã lúc gọi, timeout, cắt kết quả quá lớn.
- Schema model thấy được dựng từ `inputSchema` của MCP → LangChain tool với **`strict: false`** (schema ngoài thường không thỏa strict của OpenAI). Validate args bằng JSON Schema phía server trước khi gọi.
- Node `tools` gọi thẳng tool ngoài không cần duyệt. Tool có `requires_approval` → `approve` (nhánh `mcp_tool`, bỏ policy đổi/trả; idempotency key = hash(thread, server, tool, args)) → `approve_wait` → `execute` gọi tool ngoài.
- Kết quả tool ngoài được bọc là **dữ liệu không tin cậy** (chống prompt injection gián tiếp) và gắn source id giả `mcp:<server>:<tool>` để model trích dẫn được; số trong kết quả tính là "có trong kết quả tool" cho `enforceGroundedNumbers`.
- Trang `/admin/approvals` hiển thị được payload `mcp_tool` (server, tool, args).

### 5.6 Graph sau refactor
```
START → precheck (guard injection / small-talk)
          ├─ injection → guard → END
          ├─ small-talk → END (không gọi model)
          └─ agent ⇄ tools
             agent → approve → approve_wait → execute → agent   (exchange/return + mcp_tool cần duyệt)
             agent → confirm → confirm_wait → perform → agent   (checkout/cancel_order)
             agent → respond → remember → END ; agent → limit → END
```

### 5.7 API & route admin
| Màn hình | Route | API |
|---|---|---|
| AI Agents | `/admin/agents`, `/admin/agents/[id]` (+ tab Chat thử) | `/api/admin/agents`, `/[id]`, `/[id]/default` |
| Knowledge | `/admin/knowledge` (tab **Scopes** / **Files**), `/admin/knowledge/scopes/[id]` | `/api/admin/knowledge-scopes`, `/[id]`, `/[id]/documents` |
| MCP Server | `/admin/mcp-servers`, `/admin/mcp-servers/[id]` | `/api/admin/mcp-servers`, `/[id]`, `/[id]/test` |
| Phê duyệt | `/admin/approvals` (giữ) | giữ |

`POST /api/chat` nhận thêm `agentId` **chỉ khi** có phiên admin hợp lệ ([features/auth/session.ts](../src/features/auth/session.ts)); khách thường luôn dùng default.

## 6. Giai đoạn triển khai

| Phase | Nội dung | Nghiệm thu |
|---|---|---|
| **0** | Chuẩn bị: commit phần "OpenAI key trong Cài đặt" đang dở (bạn quyết định lúc nào commit); chạy baseline `test` + `eval:rag` + `eval:agent` nếu đã có API key để so sánh sau | Baseline lưu trong `evals/results/` |
| **1** | Menu nhóm AI + trang khung; migration 0009; seed idempotent; `builtin-tools.ts`; `resolveAgentRuntime` đọc Agent default từ DB nhưng **hành vi chat không đổi** | Test hiện có xanh; chat y như trước |
| **2** | **Knowledge scope**: CRUD, gán file, `retrieve` theo `documentIds`, scope tool, tab Scopes/Files, test truy xuất theo scope; chuyển `search_policy` thành scope "Chính sách"; `search_products` hybrid | Test scope + retrieval; golden set chính sách không tụt |
| **3** | **MCP Server**: CRUD, mã hóa auth, SSRF guard, kiểm tra kết nối, cache tool, gateway theo server từ DB, xem tool | Test SSRF (IP riêng, redirect, DNS rebinding), test không lộ secret |
| **4** | **AI Agents**: CRUD, default/archive, chọn scope + tool (cờ requires_approval), prompt core + instructions, model/giới hạn; tool ngoài chạy trong graph; `approve` nhánh `mcp_tool`; bỏ `router`/node `rag`; `chat_threads.agent_id`; Chat thử | Test graph: tool ngoài, duyệt, resume khi tool bị gỡ, không ghi trước khi duyệt |
| **5** | Dọn dẹp (`rag-answer.ts`, `prompts/fashion-tomodev-rag-system.md`, phần `chooseRoute` không còn dùng), cập nhật eval theo Agent, chạy lại `eval:rag`/`eval:agent`, cập nhật README + `docs/agent-graph.md` | Eval không thấp hơn baseline (`writesBeforeApproval = 0`); doc khớp code |

Mỗi phase kết thúc bằng một lần kiểm tra thủ công qua UI và chỉ commit khi bạn yêu cầu.

## 7. Rủi ro và cách giảm

| Rủi ro | Giảm thiểu |
|---|---|
| Tool động làm mất HITL | Cờ HITL built-in là hằng số trong code; chỉ tool ngoài mới có `requires_approval` cấu hình được; test "không ghi trước khi duyệt" cho mọi tool ghi |
| SSRF qua URL MCP | Mục Q7; kiểm tra mỗi lần gọi; test riêng |
| Prompt injection gián tiếp từ kết quả tool ngoài | Bọc dữ liệu không tin cậy; tool ghi built-in vẫn cần người xác nhận/duyệt; tool ngoài bị giới hạn bởi allowlist của Agent |
| Bỏ node `rag` làm lệch chất lượng/độ trễ FAQ | Chạy lại golden set; ghi số liệu trước/sau; nếu tụt thì chỉnh tool description/prompt, chưa bỏ pipeline cũ cho tới khi đạt baseline |
| Mất stream từng phần của câu trả lời | Giữ event `status`; thử stream tham số `answer` của `final_answer`, nếu không khả thi thì chỉ hiện trạng thái đang xử lý (quyết định lúc làm Phase 4) |
| Đổi cấu hình khi thread đang chờ duyệt/xác nhận | Đọc lại cấu hình lúc resume + kiểm tra tool còn hợp lệ (5.2) |
| Prompt tách core/instructions sai ranh giới | Tôi trình diff từng đoạn của prompt hiện tại để bạn duyệt trước khi seed |
| Bước thiếu OpenAI key khi chạy eval | Phase 0/5 cần key (Admin → Cài đặt hoặc `.env`) |

## 8. Giả định tôi tự chọn (chưa hỏi — nói nếu muốn đổi)

1. **Một graph compile duy nhất**, cấu hình Agent truyền qua `configurable` (thay vì compile một graph cho mỗi Agent).
2. **Danh sách model cho phép** đặt bằng env `OPENAI_ALLOWED_MODELS` (mặc định chỉ `gpt-4.1-2025-04-14`). Việc này nới quyết định cũ "chỉ dùng một snapshot" trong [fashion-assistant-implementation-plan.md](fashion-assistant-implementation-plan.md) mục 6.2 — Agent default vẫn dùng đúng snapshot đó.
3. ~~Tool ngoài dùng allowlist từng tool theo Agent~~ → đã đổi theo yêu cầu của bạn: tool được tick trên MCP server, Agent chỉ chọn server (xem mục 9).
4. Tên tool ngoài có tiền tố `<server_slug>__`; scope tool dùng đúng `tool_name` admin đặt.
5. Tool ngoài không được gọi song song (giữ `parallel_tool_calls: false`).
6. Chat thử dùng cookie visitor của admin; thread `is_test` không hiện trong báo cáo/dashboard.

## 9. Tiến độ và điều chỉnh so với plan

### Đã làm (Phase 1–3)
- **Phase 1**: menu nhóm AI (AI Agents, Knowledge, MCP Server, Phê duyệt); migration `0009_ai_agents.sql`; seed idempotent `src/features/ai/seed.ts` (chạy trong `db:migrate`, `db:seed` và lười ở lần dùng đầu); tách prompt thành `prompts/fashion-tomodev-agent-core.md` + `prompts/fashion-tomodev-agent-instructions.md` (file `fashion-tomodev-agent-system.md` bị thay thế); `loadAgentRuntime`; graph đọc model/giới hạn/tool theo Agent của thread; `/admin/agents` (chỉ xem, chưa sửa được).
- **Phase 2**: CRUD Knowledge scope + gán file (N–N); `retrieve({ scope })`; scope tool qua MCP `search_knowledge` (kiểm tra scope thuộc Agent của thread); tab Scopes/Tài liệu; thử truy xuất theo scope; `search_products` hybrid (RRF từ khóa + vector, fallback từ khóa khi không có embedding).
- **Phase 3**: CRUD MCP server; mã hóa auth; chống SSRF (kiểm tra lúc lưu và lúc kết nối, không theo redirect); Kiểm tra kết nối + cache tool; chặn xóa/tắt theo Q8 và server built-in bất biến.

### Lệch khỏi plan (cần bạn biết)
1. **Thêm cột `knowledge_scopes.include_system_policy`.** Chunk phí giao hàng do hệ thống sinh nằm trong document `db:catalog`, vốn bị ẩn khỏi scope (Q2). Không có cờ này thì scope "Chính sách" mất thông tin phí ship so với `search_policy` cũ. Scope seed bật cờ này.
2. **Core prompt bắt đầu bằng "Hôm nay là {{today}}."** (tách khỏi đoạn giới thiệu); nội dung còn lại giữ nguyên từng chữ. Không có đoạn "mô tả tool/scope tự sinh" trong prompt vì mô tả scope đã nằm trong schema tool.
3. **`search_policy` không còn là tool built-in**, nhưng scope seed dùng đúng tên `search_policy` nên prompt, golden set và hành vi của model giữ nguyên.
4. **File upload mới không tự vào scope nào** (đúng Q2): tab Tài liệu hiện nhãn "Chưa thuộc scope" và toast nhắc gán.
5. ~~Node `rag` và router chưa bị bỏ~~ → đã bỏ ở Phase 4 (xem bên dưới); chat giờ chỉ đi qua vòng lặp Agent và chỉ tìm trong scope của Agent.
6. Khi tool built-in bị tắt cho Agent nhưng model vẫn gọi, graph trả `tool_unavailable` thay vì chạy.

### Phase 4 (đã làm)
- CRUD Agent (`agent-admin.ts`, `/admin/agents`, `/new`, `/[id]`): hướng dẫn, model (allowlist), temperature, giới hạn, scope, tool built-in, tool ngoài kèm cờ "cần nhân viên duyệt"; đặt mặc định (chuyển nguyên tử, chỉ Agent đang bật); xóa hoặc lưu trữ theo Q8; Agent mới bắt đầu bằng bản sao cấu hình Agent mặc định.
- Graph: bỏ `router` + node `rag` (còn `precheck` → `guard`/`small_talk`/`agent`); tool ngoài chạy trong `tools` hoặc qua `approve`/`approve_wait`/`execute` (approval `mcp_tool`, migration `0010`); `deps.answerWithRag` bị xóa. Core prompt thêm quy tắc tư vấn sản phẩm, tra tài liệu và tool ngoài (14–17).
- Chat thử: `/api/chat` nhận `agentId` chỉ với phiên admin (403 nếu khách gửi), thread `is_test`, event `complete` kèm `toolCalls` chỉ cho admin.
- Lệch plan: không stream từng phần câu trả lời (quyết định lúc làm: chỉ có `status` theo tool); `strict` bị tắt riêng cho tool ngoài bằng cách tự dựng định nghĩa tool (không dùng tùy chọn `strict` toàn cục); khóa idempotency của approval `mcp_tool` gồm id lần gọi; instructions không được chứa `{{`/`}}`.
- **Chưa kiểm chứng được** (cần OpenAI key): model thật có chọn đúng tool theo mô tả khi không còn router; schema non-strict của tool ngoài có được OpenAI Responses API chấp nhận; chất lượng/độ trễ FAQ sau khi bỏ `rag`. `eval:rag` và `eval:agent` đã chạy qua vòng lặp mới nhưng chưa được chạy.

### Việc còn lại
- **Phase 0**: cần OpenAI key để chạy baseline và `eval:rag`/`eval:agent` (chưa có key nên chưa chạy; toàn bộ test dưới đây dùng fake/mock embedding).
- **Phase 5**: ~~dọn dẹp code chết~~ (đã xóa `chat/rag-answer.ts`, `chat/prompt.ts`, `rag/query.ts`, `sourceTitles`, `prompts/fashion-tomodev-rag-system.md`; type `FinalAnswer`/`SourceRef`/`PreviousSource` chuyển sang `chat/answer.ts`). **Lệch plan:** nhánh product/stock/category trong `retrieve` được giữ vì tab Tài liệu → Thử truy xuất (không scope) vẫn dùng; danh mục giờ đọc từ bảng `categories` (`catalog/category-names.ts`, cache 60s, xóa cache khi sửa danh mục/import) và so khớp không dấu. Còn lại: chạy `eval:rag`/`eval:agent` và so với baseline, README.

### Kiểm tra đã chạy
- `tsc`, `eslint` sạch; 259 test (unit + Postgres) xanh, gồm: seed idempotent, scope CRUD/ràng buộc, retrieval chỉ trong scope, ủy quyền `search_knowledge`, hybrid search, 37 case SSRF, round-trip MCP thật có Bearer/header/redirect/lỗi kết nối, secret không lộ.
- Chạy app thật trên DB riêng: các trang admin mới trả 200, API đúng mã lỗi, MCP built-in kiểm tra được (12 tool), `search_knowledge` qua MCP từ chối scope không thuộc Agent và chỉ dừng ở bước embedding vì chưa có key.

### Điều chỉnh sau Phase 4 (theo yêu cầu của bạn)
- **Tick tool ở trang MCP Server**, không phải ở Agent: thêm/sửa server có nút **Lấy danh sách tool** (kết nối bằng thông tin đang nhập, chưa lưu), tick tool cần dùng (cột "Cần duyệt" cho tool có thể gây thay đổi, tool có `destructiveHint` được đánh dấu sẵn), rồi mới lưu. Khi lưu, hệ thống kết nối lại để chắc chắn tool đã tick còn tồn tại.
- **Agent chỉ chọn MCP Server** bằng dropdown chọn nhiều; Agent dùng toàn bộ tool đã tick của mỗi server đang bật. Server chưa tick tool nào hoặc đang tắt không chọn được.
- Dữ liệu (migration `0011`): `mcp_servers.selected_tools` (`[{name, requiresApproval}]`), bảng `agent_mcp_servers`, bỏ `agent_mcp_tools`. Dữ liệu cũ được chuyển: server nào Agent từng dùng thì giữ liên kết, tool đã tick là hợp các tool mọi Agent từng có trên server đó (cờ duyệt lấy OR).
- Server built-in: chỉ chọn được tool nào trong 10 tool hệ thống được bật; luật xác nhận/duyệt vẫn cố định trong code.
- **Đánh đổi cần biết**: lựa chọn tool là của server nên áp dụng cho mọi Agent dùng server đó. Không còn cách cho Agent A có `checkout` còn Agent B thì không, nếu cả hai cùng dùng server built-in. Nếu cần lại sau này, thêm "bỏ bớt tool" theo từng Agent là một thay đổi nhỏ.
- Sửa lỗi nhỏ: lỗi 401/404 từ server MCP không có nội dung giờ báo "từ chối xác thực"/"không tìm thấy endpoint" thay vì thông báo chung.
