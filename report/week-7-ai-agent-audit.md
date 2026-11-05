# Báo cáo áp dụng Week 7 — AI Agents

**Phạm vi audit:** Fashion Tomodev Assistant, ngày 05-11-2026. Kết quả kiểm chứng hiện tại: `pnpm test` 188 pass, `pnpm typecheck` pass; 129 test DB/integration skip do không có dịch vụ chạy trong lượt audit.

## Kết luận nhanh

Week 7 đã được áp dụng ở mức **rất mạnh cho Agent cấp 3**: một agent LangGraph có state/checkpoint, MCP tool, memory, guardrail, giới hạn vòng lặp và HITL. Project chủ động không dùng planning/reflection/multi-agent; đây là lựa chọn hợp lý cho luồng bán hàng có rủi ro. Các phần nên ưu tiên tiếp theo là router minh bạch hơn nếu cost tăng, tóm tắt hội thoại dài, harden internal MCP và quan sát phân tán.

## Phần đã áp dụng

| Nội dung Week 7 | Trạng thái | Chức năng trong project | Bằng chứng code / test |
| --- | --- | --- | --- |
| Chọn đúng mức tự chủ | Đã áp dụng | Agent cấp 3: model chọn tool trong graph do code kiểm soát; không thả autonomous execution | `src/features/agent/graph.ts`, `tools.ts` |
| Agent loop/ReAct | Đã áp dụng | Model → tool call → `ToolMessage` → model; mỗi lượt buộc kết thúc `final_answer` | `graph.ts`, `src/features/agent/session.ts` |
| Tool nhỏ, schema chặt | Đã áp dụng | Built-in tool dùng Zod, external tool validate JSON Schema; server mới thực thi business logic | `src/features/agent/tools.ts`, `src/features/mcp/validate.ts` |
| MCP | Đã áp dụng | Internal MCP Streamable HTTP, tool registry; external MCP discovery/call, SSRF guard và allowlist | `src/mcp/server.ts`, `src/features/mcp/*`; `tests/ssrf.test.ts` |
| Tool quyền tối thiểu | Đã áp dụng | Agent chỉ nhận built-in/scope/external tool đã được bật; external tool có thể buộc staff approval | `src/features/ai/agents.ts`, `tools.ts`, `graph.ts` |
| State graph tường minh | Đã áp dụng | `precheck → agent → tools/approve/confirm → respond → remember`, có edge điều kiện và nhánh limit | `src/features/agent/graph.ts`, [`docs/agent-graph.md`](../docs/agent-graph.md) |
| Checkpoint theo thread | Đã áp dụng | `PostgresSaver`, resume sau approval/customer confirmation hoặc process restart | `src/features/agent/runtime.ts`, `session.ts`; `tests/agent-graph.test.ts` |
| Memory dài hạn có TTL | Đã áp dụng | `PostgresStore` theo profile namespace, TTL 30 ngày; lưu size ưa dùng/yêu cầu gần nhất | `runtime.ts`, `graph.ts`, `src/worker/maintenance.ts` |
| Human-in-the-loop | Đã áp dụng, có test | Đổi/trả dừng nhân viên duyệt; checkout/hủy dừng chờ khách bấm xác nhận; wait node không side effect | `graph.ts`, `approvals.ts`, `confirmations.ts`; `tests/agent-graph.test.ts` |
| Bất biến server-side | Đã áp dụng | Thread/session, confirmation/approval ID do server giữ; phone phải xuất hiện trong lời khách; tool kiểm tra scope | `graph.ts`, `gateway.ts`, `src/mcp/server.ts` |
| Giới hạn vòng lặp/chi phí | Đã áp dụng | `maxSteps`, `maxToolCalls`, `recursionLimit: 40`, force final ở bước cuối | `src/lib/env.ts`, `graph.ts`, `session.ts` |
| Guardrail/fallback | Đã áp dụng | Injection/chào hỏi không gọi model; tool lỗi thành ToolMessage; answer grounding/citation validation; fallback limit | `router.ts`, `graph.ts`, `validation.ts`, `grounding.ts` |
| Test graph không mạng/DB | Đã áp dụng | Model, gateway, approval, confirmation giả; kiểm tra route/tool/citation/resume | `tests/agent-graph.test.ts` (35 test) |

## Chức năng được Agent đảm nhiệm

- **Tư vấn catalog và tồn kho:** `search_products`, `lookup_product` lấy dữ liệu live rồi trả lời có source.
- **Tra đơn có xác minh:** browser owner hoặc SĐT khách đã gõ; không xác minh thì không trả dữ liệu đơn.
- **Giỏ hàng:** xem/thêm/sửa số lượng, giới hạn bằng stock và schema server-side.
- **Đặt/hủy đơn:** agent chỉ tạo đề xuất; browser của khách xác nhận payload/fingerprint trước khi MCP thực thi.
- **Đổi size/trả hàng:** graph kiểm tra điều kiện và tạo approval pending; nhân viên quyết định rồi thread resume.
- **Knowledge scope:** model gọi tool theo scope được gán, không tự truy xuất mọi tài liệu.
- **External MCP:** tool có schema, SSRF guard; tool được đánh dấu rủi ro phải có staff approval.

## Phần chưa áp dụng hoặc mới áp dụng một phần

| Mức ưu tiên | Khoảng trống | Nhận định | Đề xuất áp dụng |
| --- | --- | --- | --- |
| P1 | Internal MCP chưa có authentication ở tầng service | MCP không publish ra host là lớp bảo vệ tốt, nhưng `src/mcp/server.ts` không kiểm Bearer/mTLS; bất kỳ workload nào vào Docker network có thể gọi tool | Thêm service token/mTLS giữa web/worker và MCP, kiểm `/health` riêng; rotate secret và test 401. Giữ network isolation là lớp bổ sung, không là boundary duy nhất. **Cập nhật:** Hạ tầng/backend; Admin → MCP Server chỉ hiển thị health/connection, không cho cấu hình secret nội bộ; Web khách không đổi UI. |
| P1 | Rate limit nằm trong memory của web process | Nhiều replica sẽ đếm riêng, restart làm reset counter | Chuyển limiter chat/login/lookup sang Redis hoặc Postgres atomic counter; key theo visitor + IP + action; xuất metric reject rate. **Cập nhật:** Backend/hạ tầng; Web → giữ lỗi 429 hiện có, có thể hiển thị countdown thử lại; Admin → Monitoring xem số lần bị chặn. |
| P1 | Không có tóm tắt hội thoại dài | `agentHistory()` cắt theo `MAX_HISTORY_TURNS` nhưng không có summary node; lịch sử cũ có thể mất ngữ cảnh nghiệp vụ | Thêm node summary có structured fields (intent, selected product, verified order, pending action); giữ nguyên cặp tool call/result và test conversation dài. **Cập nhật:** Backend graph; Web → chat giữ mạch hội thoại dài tốt hơn, không cần UI mới; Admin → AI Agent form có thể thêm ngưỡng history/summary. |
| P2 | Router 4 nhánh của bài học chưa được hiện thực riêng | `precheckRoute` chỉ nhận injection/small-talk/agent; việc policy vs live/shop do agent tự chọn tool | Thiết kế này đơn giản và đang hợp lý. Nếu tool/cost tăng, thêm classifier JSON nhiệt độ 0 có route `chat/rag/shop/out_of_scope`, fallback an toàn, trace và golden cases trước khi chuyển luồng. **Cập nhật:** Backend graph; Admin → Chat thử hiển thị route/debug; Web khách không đổi UI ngoài phản hồi ngoài phạm vi nhất quán hơn. |
| P2 | Chưa có planning/reflection/multi-agent | Không có node plan, critic hay sub-agent | Không coi đây là nợ bắt buộc. Chỉ thêm Reflection cho nội dung dài cần chất lượng; Planning cho task nhiều phụ thuộc; không dùng multi-agent cho purchase/order flow khi workflow hiện đã kiểm soát tốt. **Cập nhật nếu cần:** Admin → cấu hình capability chỉ cho agent chuyên biệt; Web → chỉ áp dụng ở chức năng mới (ví dụ tạo nội dung), không đưa vào checkout/đơn hàng. |
| P2 | Observability mới là log, chưa phải distributed tracing | Có trace ID tốt, nhưng chưa có UI trace/cost dashboard và correlation xuyên web→MCP→DB | Chuẩn hoá OpenTelemetry spans/traceparent, log structured redacted, dashboard node/tool/model p95/cost/error; liên kết `trace_id` với approval/confirmation. **Cập nhật:** Admin → trang Monitoring/chi tiết trace; Web khách không đổi UI. |
| P2 | Một số test quan trọng chưa chạy integration trong audit | 13 test file DB bị skip; offline fake model không chứng minh Postgres/MCP/interrupt trong compose | Chạy `docker compose up`, `pnpm test` với DB enabled, sau đó `eval:agent` ở staging; lưu kết quả theo commit. **Cập nhật:** Hạ tầng CI; Admin → có thể xem report eval/trace, Web khách không đổi UI. |

## Khuyến nghị kiến trúc

Giữ một agent workflow hiện tại làm luồng chính. Nó đã có boundary rõ và dễ test hơn multi-agent. Phát triển theo thứ tự:

1. Hardening MCP + distributed rate limit.
2. Summary/context policy khi telemetry chỉ ra context/cost là vấn đề.
3. Router riêng khi số tool/scope đủ lớn để tool selection không còn ổn định.
4. Reflection/planning chỉ cho capability mới có metric chấp nhận cụ thể.

## Tiêu chí nghiệm thu khi thêm tool/agent capability

- Schema hạn chế input; business validation và authz nằm ở server, không nằm trong prompt.
- Identity, tenant/thread, approval/confirmation ID do server inject.
- Read/write/risk level được khai báo; write có idempotency và test replay/resume.
- Có timeout, giới hạn tool/model calls, fallback và trace.
- Có fake-model test cho nhánh thành công, schema sai, tool lỗi, injection và action bị từ chối.

