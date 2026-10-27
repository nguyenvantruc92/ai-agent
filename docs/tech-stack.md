# Tech stack và cấu hình provider

## Tech stack

| Thành phần | Công nghệ |
|---|---|
| Web + API | Next.js 16, React 19, TypeScript, Tailwind CSS 4 |
| Database | PostgreSQL 16 + pgvector (index HNSW, cosine) |
| LLM SDK (RAG, Week 6) | Vercel AI SDK 5 (`@ai-sdk/openai`) |
| Agent (Week 7) | LangGraph 1.5 + LangChain (`@langchain/openai`) |
| Lưu checkpoint/memory của agent | `@langchain/langgraph-checkpoint-postgres` (schema `langgraph`) |
| Tool server | MCP (`@modelcontextprotocol/sdk`), Streamable HTTP, chạy nội bộ |
| Đọc tài liệu | `xlsx` (catalog), `pdf-parse` (FAQ) |
| Validate / Log | Zod, Pino (log NDJSON theo `trace_id`) |
| Test | Vitest, golden set eval |
| Triển khai | Docker Compose: `db`, `web`, `worker`, `mcp` (+ Cloudflare Tunnel tuỳ chọn) |

## Provider: OpenAI

| Mục đích | Model | API |
|---|---|---|
| Sinh câu trả lời (RAG + Agent) | `gpt-4.1-2025-04-14` | Responses API |
| Embedding | `text-embedding-3-small` (1536 chiều) | Embeddings API |

### Tham số model

| Tham số | Giá trị | Ý nghĩa |
|---|---|---|
| `temperature` | 0.3 | Trả lời ổn định, ít sáng tạo |
| `max_output_tokens` | 500 | Giới hạn độ dài câu trả lời |
| `timeout` | 20 000 ms | Timeout mỗi lần gọi |
| `max_retries` | 1 | Số lần thử lại khi lỗi |
| `store` | false | Không lưu dữ liệu trên OpenAI |
| `strict` JSON schema | true | Output và tool call theo đúng schema |
| `parallel_tool_calls` | false | Mỗi bước chỉ gọi một tool |
| `tool_choice` (Agent) | `required`; ở bước cuối ép `final_answer` | Agent luôn kết thúc bằng câu trả lời có cấu trúc |
| `user` | hash ẩn danh của khách | Theo dõi lạm dụng, không gửi danh tính thật |

### Tham số RAG

| Tham số | Giá trị |
|---|---|
| `RETRIEVAL_TOP_K` | 8 |
| `RETRIEVAL_MIN_SIMILARITY` | 0.45 |
| `MAX_CONTEXT_CHUNKS` | 5 |
| `MAX_CONTEXT_TOKENS` | 1200 |
| `EMBEDDING_BATCH_SIZE` | 50 |
| Lịch sử hội thoại | 10 lượt / tối đa 20 tin nhắn |

### Tham số Agent

| Tham số | Giá trị |
|---|---|
| `AGENT_MAX_STEPS` | 5 lần gọi model mỗi lượt |
| `AGENT_MAX_TOOL_CALLS` | 5 lần gọi tool mỗi lượt |
| Hạn chờ duyệt (approval) | 7 ngày, quá hạn thì tự hủy |
| MCP tools | `lookup_order`, `lookup_product`, `search_policy` (đọc); `create_exchange_request`, `create_return_request` (ghi, chỉ chạy sau khi nhân viên duyệt) |

### Giới hạn an toàn

| Tham số | Giá trị |
|---|---|
| Rate limit chat | 30 tin / 10 phút |
| Độ dài tin nhắn | tối đa 2000 ký tự |
| Upload | tối đa 10 MiB, 10 file / giờ, chỉ PDF/XLSX |

Tất cả tham số trên được cấu hình qua `.env` (xem [.env.example](../.env.example)).
