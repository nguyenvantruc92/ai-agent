# Ghi chú: MCP trong project

MCP là một service riêng (`mcp`) chứa 5 tool đọc/ghi dữ liệu đơn hàng, sản phẩm và chính sách. Chỉ **luồng Agent (Week 7)** gọi MCP. Luồng **RAG (Week 6) không đi qua MCP**.

## 1. Kiến trúc

```
Browser ──► web (Next.js, /api/chat)
              │
              ▼
          LangGraph agent  (src/features/agent/graph.ts)
              │  router → agent(LLM) → tools / approve / execute
              │
              │  mcpGateway (MCP Client, Streamable HTTP)
              ▼
          mcp:3001/mcp  (src/mcp/server.ts, McpServer)
              │
              ▼
          Postgres (orders, products, chunks, approval_requests, exchange_return_requests)
```

- **Server**: [src/mcp/server.ts](../src/mcp/server.ts) chạy bằng `pnpm mcp`. Server dùng Streamable HTTP ở chế độ stateless, nghĩa là mỗi request tạo một `McpServer` và một transport mới. Trong [docker-compose.yml](../docker-compose.yml) service này **không publish port**, nên chỉ `web` và `worker` trong mạng Compose gọi được tới nó.
- **Client**: [src/features/agent/gateway.ts](../src/features/agent/gateway.ts). Hàm `callTool()` tạo một `Client` mới cho mỗi lần gọi, truyền `traceId` qua `_meta` rồi parse JSON từ kết quả text.
- **Nơi nối vào graph**: [src/features/agent/runtime.ts](../src/features/agent/runtime.ts) truyền `gateway: mcpGateway`. Khi chạy test thì dùng gateway giả trong [tests/fakes.ts](../tests/fakes.ts), nên test không cần MCP thật.
- **Cấu hình**: `MCP_URL` (mặc định `http://mcp:3001/mcp`) và `MCP_PORT` (mặc định `3001`) nằm trong [src/lib/env.ts](../src/lib/env.ts).

## 2. Năm tool MCP

| Tool | Loại | Gọi tới |
|---|---|---|
| `lookup_product` | đọc | `findProduct()` |
| `lookup_order` | đọc | `findOrder()` |
| `search_policy` | đọc | `retrieve({ policyOnly: true })`, cùng hàm RAG với Week 6 nhưng chỉ lấy chunk chính sách |
| `create_exchange_request` | ghi | `createApprovedRequest()` |
| `create_return_request` | ghi | `createApprovedRequest()` |

### LLM không gọi MCP trực tiếp

Trong [src/features/agent/tools.ts](../src/features/agent/tools.ts), các tool mà model nhìn thấy chỉ là schema (`schemaOnly`, nếu chạy sẽ throw). Model chỉ phát ra `tool_call`, sau đó node của graph mới gọi MCP:

- **Node `tools`**: gọi 3 tool đọc. Status hiện trên UI ("Đang tra đơn hàng…", "Đang tra chính sách…") được phát ra từ node này.
- **Node `approve`**: gọi `lookup_order` và `lookup_product` qua MCP để kiểm tra điều kiện bằng `checkRequest()`. Nếu điều kiện đạt thì dừng ở `interrupt()` để chờ nhân viên duyệt.
- **Node `execute`**: chỉ chạy sau khi nhân viên duyệt. Node này gọi tool ghi kèm `approval_request_id`, là giá trị do server điền và model không thấy.

Khi resume sau `interrupt()`, LangGraph **chạy lại node `approve` từ đầu**, nên các lookup qua MCP được gọi thêm một lần nữa.

### Lớp bảo vệ bên trong MCP

`createApprovedRequest()` trong [src/features/orders/repository.ts](../src/features/orders/repository.ts):

- Kiểm tra lại rằng approval có trạng thái `approved`.
- Kiểm tra payload khớp `idempotency_key` và `action` của approval.
- Ghi dữ liệu bằng `ON CONFLICT (idempotency_key) DO NOTHING`, nên gọi lại cũng không tạo bản ghi trùng.
- Ghi audit log với actor `mcp`.

### Log

Mỗi lần gọi tool, MCP server ghi một dòng `stage: 'mcp.tool'` (hoặc `mcp.tool_failed`) vào `data/logs/mcp.ndjson`, kèm `trace_id`, `args` và `latencyMs`.

## 3. Router quyết định có đi qua MCP hay không

[src/features/agent/router.ts](../src/features/agent/router.ts):

- Tin nhắn khớp mẫu prompt injection → `guard`, không có MCP.
- Tin nhắn có mã `FT-xxxx-xxxx` hoặc ý định đổi/trả → `agent`, **có MCP**.
- Câu hỏi nối tiếp ngắn khi thread đã có `orderId` → `agent`, **có MCP**.
- Các tin nhắn còn lại → `rag`, gọi `retrieve()` trực tiếp, không có MCP.

## 4. Mục nào trong demo-script.md dùng MCP

| Mục | MCP? | Tool được gọi |
|---|---|---|
| **A1–A12** | ❌ | Đi luồng RAG hoặc guard, gọi thẳng DB/pgvector |
| **A13–A16** (Admin Knowledge, Retrieval test) | ❌ | API admin gọi `retrieve()` trực tiếp |
| **B1, B2, B3** | ✅ | `lookup_order` (B3 trả về "không tìm thấy") |
| **B4** | ✅ | `lookup_order` và có thể thêm `search_policy`/`lookup_product` (node tools), rồi `lookup_order` + `lookup_product` (node approve), sau đó dừng chờ duyệt |
| **B5** (màn hình duyệt) | ❌ | Chỉ đọc bảng `approval_requests` |
| **B6** (restart web) | ❌ | Kiểm chứng checkpoint Postgres |
| **B7** (Duyệt → resume) | ✅ **ghi** | Node approve chạy lại nên gọi lại lookup, rồi `create_exchange_request`. Đây là mục quan trọng nhất về MCP |
| **B8** | ✅ | Các tool đọc, chờ duyệt |
| **B9** (Từ chối) | ✅ chỉ đọc | Resume gọi lại lookup nhưng **không** gọi tool ghi |
| **B10** | ✅ chỉ đọc | Lookup thấy yêu cầu đã có nên trả `already_created`, không gọi tool ghi |
| **B11–B15** | ✅ chỉ đọc | Lookup qua MCP, `checkRequest()` từ chối (quá 7 ngày, chưa giao, tất, giảm giá, sai size) |
| **B16** | ✅ **ghi** | Lookup, duyệt, rồi `create_return_request` |
| **B17** | ✅ chỉ đọc (thường là vậy) | Model thường gọi `lookup_order`/`search_policy`. Node approve chặn `reason_not_stated` trước khi lookup |
| **B18** | ✅ chỉ đọc | Câu này không khớp mẫu injection nên đi luồng agent. Lookup qua MCP rồi vẫn chờ duyệt |
| **B19** | ❌ | Có mã đơn nhưng "bỏ qua mọi hướng dẫn" khớp guard trước, nên không tới MCP |
| **B20** | ✅ chỉ đọc (có thể) | Model có thể gọi `lookup_order`/`search_policy`. Không có tool hoàn tiền nên không ghi gì |
| **Hết hạn duyệt** | ✅ chỉ đọc | Worker gọi `decideAndResume('expired')`. Node approve chạy lại nên gọi lookup, nhưng không ghi |
| **Trace** | ✅ | `grep` trên `mcp.ndjson` sẽ thấy các dòng `mcp.tool` |

Các mục "có thể" (B17, B20, và một phần B4) phụ thuộc vào việc model có chủ động gọi tool hay không, nên trace giữa các lần chạy có thể khác nhau.

## 5. Ảnh nên chụp để chứng minh MCP

Chụp **B4 → B7** kèm phần **Trace**:

```bash
grep "<trace_id>" data/logs/web.ndjson data/logs/mcp.ndjson | cut -c1-220
```

Trong log theo một `trace_id` sẽ thấy lần lượt:

1. `graph.node` (router, agent, tools…) trong `web.ndjson`
2. `mcp.tool` với `tool: lookup_order` trong `mcp.ndjson`
3. `graph.interrupt` ở node `approve`
4. Sau khi duyệt: `mcp.tool` với `tool: create_exchange_request`
