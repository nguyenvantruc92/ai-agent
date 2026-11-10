# Báo cáo áp dụng Week 8 — Case study triển khai AI Agent an toàn

**Phạm vi audit:** Fashion Tomodev Assistant, ngày 05-11-2026. Week 8 được dùng làm checklist từ phân tích rủi ro đến production; ShopMobile chỉ là case minh hoạ.

**Kết quả kiểm chứng:** `pnpm test` 188 pass, `pnpm typecheck` pass. 129 test DB/integration đã skip do môi trường audit không chạy DB/MCP; chưa thể khẳng định integration/eval live từ kết quả này.

## Kết luận nhanh

Project đã hiện thực phần cốt lõi của case study: phân dữ liệu tĩnh/live, tách model–tool–state, write có confirmation/approval cứng, idempotency, fallback và test graph. Có một phát hiện **P0** cần xử lý trước khi coi đây là production-ready: logger MCP ghi nguyên `args`, có thể ghi SĐT/định danh vào log. Sau đó ưu tiên health/auth MCP, distributed rate-limit, metrics/alert và integration gate.

## Đối chiếu các quyết định thiết kế Week 8

| Quyết định case study | Trạng thái | Ứng dụng/chức năng hiện có | Bằng chứng |
| --- | --- | --- | --- |
| Phân loại static/live/read/write/risk | Đã áp dụng | Policy qua Knowledge RAG; catalog/stock/order/cart qua MCP; write phân `cart`, `confirm`, `approval` | `tools.ts`, `graph.ts`, `knowledge/scopes.ts` |
| Bộ não, đôi tay, bộ nhớ tách rời | Đã áp dụng | Agent model/graph, MCP nghiệp vụ, Postgres checkpoint/store tách module/service | `agent/graph.ts`, `agent/gateway.ts`, `mcp/server.ts`, `agent/runtime.ts` |
| Router/guardrail giá rẻ chạy trước | Đã áp dụng một phần | Regex injection/small talk không gọi model; các ý định nghiệp vụ còn do agent chọn tool | `agent/router.ts`, `chat/guardrails.ts` |
| RAG chỉ cho knowledge tĩnh | Đã áp dụng | Scope retrieval dành cho policy; core prompt bắt giá/tồn kho/trạng thái đơn lấy tool live trong lượt hiện tại | `knowledge/scopes.ts`, `fashion-tomodev-agent-core.md` |
| Contract tool, LLM chỉ là caller | Đã áp dụng | Zod/JSON schema, gateway, MCP server và service nghiệp vụ kiểm input/state | `agent/tools.ts`, `mcp/server.ts` |
| Identity server-side | Đã áp dụng | `thread_id`, confirmation/approval ID do graph/gateway gắn; phone phải do người dùng nói | `agent/graph.ts`, `agent/gateway.ts` |
| Write rủi ro có cổng cứng | Đã áp dụng, có test | Checkout/cancel chờ browser confirmation; exchange/return/external risky tool chờ staff approval rồi `interrupt()` resume | `agent/graph.ts`, `agent/session.ts`, `tests/agent-graph.test.ts` |
| Idempotency/replay safe | Đã áp dụng | Approval key, one pending confirmation, confirmation claim/fingerprint và wait node không side effect trước interrupt | `approvals.ts`, `confirmations.ts`, `graph.ts`, migrations `0007` |
| Hội thoại/checkpoint | Đã áp dụng một phần | Postgres checkpoint theo thread; giữ recent history với whole turns; profile memory TTL | `agent/runtime.ts`, `agent/graph.ts`, `worker/maintenance.ts` |
| Graceful failure | Đã áp dụng | Tool errors trả về model, action bị limit, HTTP/SSE error handled, active doc version không bị thay bởi index lỗi | `graph.ts`, `chat/stream.ts`, `worker/index.ts` |
| Test theo bất biến | Đã áp dụng mạnh | Fake model/gateway test citation, approval, confirmation, restart, external MCP schema/approval; eval scripts kiểm write trước approval | `tests/agent-graph.test.ts`, `src/scripts/eval-agent.ts` |

## Các chức năng hiện thực hoá case study

### Mua hàng an toàn

Agent tìm sản phẩm/tồn kho, chỉnh giỏ, rồi chỉ tạo `customer_confirmation` khi khách cung cấp thông tin đủ. Khách phải bấm nút browser xác nhận; MCP thực hiện đúng payload đã hiển thị và kiểm fingerprint để từ chối giỏ/giá thay đổi. Đây là áp dụng trực tiếp nguyên tắc “tiền do server tính, model không tự xác nhận”.

### Tra đơn và đổi/trả

Tra đơn yêu cầu browser owner hoặc SĐT do khách nêu. Đổi/trả phải qua policy/business validation, tạo approval pending, dừng graph và chỉ gọi MCP write sau khi nhân viên duyệt. Graph còn xử lý order có nhiều line cùng product qua size/màu selector.

### RAG có scope

Admin gán document vào Knowledge scope và scope vào Agent. MCP `search_knowledge` xác thực scope theo agent sở hữu thread; model không thể chỉ gọi tên để xem scope không được cấp.

### External MCP có rào chắn

URL external được SSRF-guarded, input schema được validate, response bị giới hạn kích thước và được nhắc là data không tin cậy. Tool external có thể yêu cầu approval riêng cho từng tool call.

## Khoảng trống và đề xuất theo ưu tiên

| Ưu tiên | Finding | Bằng chứng audit | Đề xuất cụ thể |
| --- | --- | --- | --- |
| **P0** | PII có thể đi vào log MCP | `handler()` ở `src/mcp/server.ts` log trực tiếp `args`; `verify_order` có `phone`, các tool khác có `thread_id`/confirmation ID. API chat cũng chỉ redaction email và chuỗi 9+ số liền nhau, không bao phủ tên/địa chỉ hay SĐT có dấu. | Tạo hàm redact trung tâm theo tool/schema, tuyệt đối không log raw payload nhạy cảm; log field allowlist/hash/last-4. Áp dụng cho web, MCP, external MCP và error logs. Thêm test bắt buộc “phone/address không xuất hiện trong log”. **Cập nhật:** Backend/hạ tầng là bắt buộc; Admin → Monitoring chỉ xem dữ liệu đã redaction; Web khách không đổi UI. |
| **P1** | Internal MCP chưa có auth và health endpoint | Compose không publish port nhưng `mcp/server.ts` chỉ nhận POST `/mcp`; không có Bearer/mTLS hoặc `/health`. | Gắn service credential/mTLS web↔MCP, reject thiếu token, thêm `/health`; Docker healthcheck và dependency `service_healthy`. **Cập nhật:** Backend/Docker; Admin → MCP Server hiển thị health/last error; Web khách không đổi UI. |
| **P1** | Rate limit chỉ dùng memory local | `src/lib/rate-limit.ts` nêu rõ chỉ phù hợp single container. | Redis/Postgres rate limiting dùng atomic TTL; limit riêng cho chat, tra đơn thất bại, confirmation/resume và admin API. **Cập nhật:** Backend/hạ tầng; Web → thông báo retry/cooldown; Admin → Monitoring xem rate-limit events. |
| **P1** | Production observability chưa hoàn chỉnh | Có NDJSON trace rất tốt nhưng chưa có metric exporter, dashboard/SLO/alert. | Metrics cho model/tool/retrieval/approval/confirmation, p95 latency, error/empty/guard rates, token cost; Grafana + alert provider error, approval backlog, PII-redaction failure. **Cập nhật:** Admin → Monitoring/Dashboard hoặc link Grafana; Web khách không đổi UI. |
| **P1** | Integration gate chưa được chứng minh trong lượt audit | 129 test DB bị skip, eval live chưa chạy. | Staging compose: chạy test DB, `eval:rag`, `eval:agent`; block release nếu hard-fail > 0 hoặc metric thấp baseline. **Cập nhật:** Hạ tầng CI; Admin → có thể thêm màn Evals để xem lịch sử run; Web khách không đổi UI. |
| **P2** | Context dài chưa có summary node | Chỉ window recent turns; Week 8 khuyến nghị summary và cleanup tool call dở dang. | Thêm structured summarize node sau threshold; retain order/cart/approval state separately; test interrupted tool call và 20+ lượt chat. **Cập nhật:** Backend agent; Web → chat dài giữ ngữ cảnh tốt hơn; Admin → AI Agent Settings có ngưỡng summary/history. |
| **P2** | Không có circuit breaker/retry policy rõ cho provider/MCP | Có timeout và error fallback, nhưng chưa thấy circuit breaker/backoff/health-aware disable. | Bọc OpenAI/MCP client bằng timeout, bounded retry+jitter, circuit breaker; khi open thì trả thông báo tạm thời không gọi model liên tục. **Cập nhật:** Backend/hạ tầng; Web → thông báo dịch vụ tạm thời thay vì chờ lỗi; Admin → Monitoring hiển thị trạng thái circuit. |
| **P2** | Thanh toán online là mô phỏng | Có order/payment domain nhưng không thấy payment gateway/webhook thực tế trong flow audit. | Khi tích hợp gateway: webhook signed, idempotency provider ref, state machine payment, reconciliation/audit; payment action luôn server-side, không từ model. **Cập nhật:** Web → trang checkout/order/payment status và luồng thanh toán; Admin → Orders/payment reconciliation; Backend → webhook + payment state machine. |

## Lộ trình xử lý khuyến nghị

1. **Trước production:** xử lý PII logging, xác thực/health MCP, integration test có DB/MCP, và rate limit phân tán.
2. **Production baseline:** dashboard + alert, chạy full eval staging theo mỗi release, lưu kết quả/golden-set theo commit.
3. **Mở rộng chức năng:** summary/circuit breaker trước; payment gateway thật chỉ sau khi các invariant confirmation/idempotency/audit có test integration.

## Bất biến phải giữ khi sửa code

- Không có write nào xảy ra trước confirmation/approval hợp lệ.
- Giá, phí, stock, order status và payment result do server/tool tính; model không được tự suy ra từ history.
- `thread_id`, visitor scope, approval/confirmation ID không do model hoặc client tự chọn.
- Restart/resume không tạo duplicate approval/confirmation/write.
- Tool error, provider error, RAG rỗng và giới hạn vòng lặp phải có đường lui có trace.
- PII không được xuất hiện ở application/MCP logs; dữ liệu trả cho model được giới hạn theo source/scope hiện tại.

