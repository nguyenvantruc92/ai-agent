# Báo cáo áp dụng Week 6 — RAG

**Phạm vi audit:** mã nguồn hiện có của Fashion Tomodev Assistant, ngày 05-11-2026. Báo cáo đối chiếu nguyên tắc Week 6 với code thực tế, không coi ví dụ ShopDemo trong slide là yêu cầu bắt buộc.

**Kiểm chứng đã chạy:** `pnpm test` đạt **188 test**; `pnpm typecheck` đạt. Có **129 test database/integration bị skip** vì PostgreSQL/MCP không được khởi động trong lượt audit này; các kết luận có nhãn “có test” dưới đây chủ yếu là unit/graph test.

## Kết luận nhanh

Week 6 đã được áp dụng ở mức **mạnh**: ingestion có version, vector search HNSW, active version không gián đoạn chat, RAG theo Knowledge scope, nguồn bắt buộc, kiểm tra số liệu, golden set/eval và trace. Khoảng trống lớn nhất không phải pipeline cơ bản mà là **vận hành production** (metrics/dashboard/alert), **xử lý tài liệu xung đột/độc hại bằng code** và chạy đầy đủ integration/eval trong CI.

## Phần đã áp dụng

| Nội dung Week 6 | Trạng thái | Chức năng trong project | Bằng chứng code / test |
| --- | --- | --- | --- |
| Nạp tài liệu tách luồng chat | Đã áp dụng | Worker lấy `ingestion_jobs`, parse, chunk, embed, lưu DB; chat chỉ đọc active version | `src/worker/index.ts`, `src/db/migrations/0000_initial.sql`, `0001_active_version.sql` |
| Không làm gián đoạn phiên bản đang phục vụ | Đã áp dụng | Version mới chỉ active sau khi toàn bộ chunk/embed thành công | `processJob()` trong `src/worker/index.ts` |
| Chunk có cấu trúc, nguồn và metadata | Đã áp dụng một phần | PDF FAQ được tách theo mục/bảng hỏi-đáp; chunk giữ `sourceId`, title, `updated_at`, hash | `src/features/knowledge/parser.ts`; `tests/parser.test.ts` |
| Embedding + pgvector + HNSW cosine | Đã áp dụng | Query embedding và `ORDER BY embedding <=> vector`; HNSW cosine index | `src/features/rag/retrieval.ts`, `0000_initial.sql` |
| Tránh embed lại dữ liệu không đổi | Đã áp dụng | Tái dùng embedding có cùng content hash và cùng embedding model | `reusableEmbeddings()` trong `src/worker/index.ts` |
| Retrieval cho nhiều ý/câu hỏi catalog | Đã áp dụng một phần | Semantic run kết hợp policy/category/stock/catalog-overview rồi round-robin để tránh một intent chiếm hết context | `src/features/rag/retrieval.ts`; `tests/rag.test.ts` |
| Tách tri thức tĩnh khỏi dữ liệu sống | Đã áp dụng | Policy đi qua Knowledge scope; giá/tồn kho/đơn/giỏ dùng tool/DB sống thay vì RAG | `src/features/knowledge/scopes.ts`, `src/features/agent/tools.ts`, `prompts/fashion-tomodev-agent-core.md` |
| Prompt là hợp đồng, structured output | Đã áp dụng | Model phải kết thúc bằng tool `final_answer` có `answer`, citations, cờ thiếu thông tin | `src/features/agent/tools.ts`, `src/features/agent/graph.ts` |
| Citation có thật và chỉ thuộc nguồn đã truy xuất | Đã áp dụng, có test | Citation ngoài `turnSources` hoặc câu trả lời có dữ kiện nhưng thiếu citation bị thay bằng câu an toàn | `src/features/chat/validation.ts`, `graph.ts`; `tests/chat.test.ts`, `tests/agent-graph.test.ts` |
| Chống bịa số liệu | Đã áp dụng, có test | Giá/ngày/size/số liệu không có trong kết quả tool, lời khách hoặc ngày hiện tại bị từ chối; có cho phép số lượng nhỏ và phép tính đơn giản | `src/features/chat/grounding.ts`; `tests/guardrails.test.ts` |
| Guardrail đầu vào trước model | Đã áp dụng, có test | Regex prompt-injection VN/EN và chào hỏi đi theo nhánh không gọi model | `src/features/chat/guardrails.ts`, `src/features/agent/router.ts`; `tests/guardrails.test.ts` |
| Trace, latency, token/cost diagnostics | Đã áp dụng | Retrieval, graph node, MCP và chat ghi `trace_id`, latency, token, tool/source; log quay vòng NDJSON | `src/features/rag/retrieval.ts`, `src/features/agent/graph.ts`, `src/lib/logger.ts` |
| Golden set / eval | Đã áp dụng | `eval:rag` đo recall@5, citation validity/coverage, insufficient accuracy, keyword accuracy, latency và token | `src/scripts/eval-rag.ts`, `evals/golden-set.v1.json` |

## Chức năng đang hưởng lợi từ RAG

1. **Tra cứu chính sách**: Agent gọi tool Knowledge scope (ví dụ policy đổi/trả, giao hàng); kết quả chỉ lấy từ tài liệu được admin gán cho agent.
2. **Citation trên chat**: câu trả lời có dữ kiện chỉ hoàn tất khi nguồn hợp lệ của đúng lượt tool đang chạy.
3. **Câu hỏi nhiều ý về catalog/chính sách**: retrieval có các truy vấn/filters bổ sung để giữ kết quả cho từng intent, stock status và category.
4. **Admin Knowledge**: upload/version/re-index tài liệu tách khỏi request chat; scope quy định agent nào thấy được tài liệu nào.
5. **An toàn nghiệp vụ**: RAG chỉ cung cấp facts tĩnh; mọi dữ liệu thay đổi liên tục được trả bởi MCP/tool.

## Phần chưa áp dụng hoặc mới áp dụng một phần

| Mức ưu tiên | Khoảng trống | Tác động | Đề xuất áp dụng |
| --- | --- | --- | --- |
| P1 | Chưa có kiểm tra document prompt-injection khi ingest | Tài liệu upload có thể mang câu mệnh lệnh; core prompt coi tool result là data nhưng chưa có lớp scan/quarantine độc lập | Ở worker, gắn rule/heuristic detector cho chunk; đánh dấu `suspicious`, không index mặc định hoặc yêu cầu admin duyệt. Thêm fixture PDF độc hại và test “nội dung đó không được vào model”. **Cập nhật:** Admin → Knowledge/Files thêm trạng thái “Cần duyệt” và nút duyệt/bỏ; Web chat không đổi UI, chỉ không dùng tài liệu bị cách ly. |
| P1 | Xử lý mâu thuẫn/expiry hiện chủ yếu dựa vào prompt | `updated_at` được trả về nhưng retrieval không có rule code để loại/ưu tiên một policy mâu thuẫn hoặc hết hiệu lực | Bổ sung metadata `effective_from`, `effective_to`, `supersedes`; filter theo ngày trước retrieval và resolver chọn bản mới nhất cùng topic. Nếu vẫn mâu thuẫn, trả insufficient bằng code. **Cập nhật:** Admin → Knowledge document form thêm hiệu lực/phiên bản thay thế; Web → chat hiển thị phản hồi thiếu thông tin thay vì chính sách mâu thuẫn. |
| P1 | Chưa có metrics/dashboard/alert production | Log NDJSON tốt để điều tra nhưng không đủ để phát hiện latency, cost, lỗi embedding/provider tăng bất thường | Xuất OpenTelemetry/Prometheus metrics: retrieval empty rate, citation rejection, p95 từng stage, token/cost, job failures; dựng Grafana dashboard và alert theo SLO. **Cập nhật:** Admin → thêm trang Monitoring/Dashboard (hoặc link Grafana); Web khách không đổi chức năng. |
| P2 | Không có reranker/cross-encoder sau semantic retrieval | Với policy gần nghĩa hoặc corpus lớn, top-k vector có thể chưa đủ chính xác | Giữ vector retrieval làm candidate (K=20), thêm rerank cho N tốt nhất; A/B trên golden set trước khi bật. Chỉ triển khai khi Recall@K/context quality cho thấy cần. **Cập nhật:** Admin → Retrieval Test/AI Settings cho chọn cấu hình và so sánh A/B; Web → chat chỉ cải thiện độ chính xác, không cần UI mới. |
| P2 | Query rewrite cho câu nối tiếp không tường minh ở tầng RAG | Agent có lịch sử nên có thể tự chọn query tốt, nhưng không có node/contract riêng để kiểm chứng rewrite | Ghi `original_query` + `resolved_query` vào trace; thêm rewrite nhỏ, deterministic/structured cho pronoun follow-up rồi eval case đa lượt. **Cập nhật:** Admin → Chat thử/Retrieval Test hiển thị query đã rewrite trong debug; Web → các câu “còn size đó?” hiểu đúng hơn, không cần UI mới. |
| P2 | Ingestion chưa là parser đa định dạng chung | Luồng hiện tập trung PDF policy và catalog DB/XLSX import; slide đề cập Markdown/docx/text như nguồn tri thức phổ biến | Nếu business cần, thêm extractor Markdown/DOCX/TXT theo adapter; preserve heading/breadcrumb, provenance/page và test mỗi định dạng. Không cần làm nếu admin chỉ quản lý PDF. **Cập nhật:** Admin → Knowledge upload chấp nhận loại file mới và hiển thị parser/status; Web khách không đổi UI. |
| P2 | Eval live chưa là cổng CI bắt buộc | Script eval có sẵn nhưng cần DB/MCP/OpenAI; offline suite không chứng minh chất lượng model thực tế | Tạo CI stage tách: ephemeral Postgres + MCP + fixture, chạy eval smoke có budget; chạy full golden set theo lịch/release và lưu trend. **Cập nhật:** Hạ tầng CI là chính; Admin → có thể thêm trang Evals để xem lịch sử kết quả; Web khách không đổi UI. |

## Kế hoạch đề xuất

1. **P1 trước release:** scan/quarantine tài liệu độc hại, resolver chính sách theo hiệu lực và metrics tối thiểu.
2. **P1 sau đó:** bật full integration/eval trên môi trường staging; đặt baseline cho recall, citation validity, insufficient accuracy, p95 và chi phí.
3. **P2 theo số liệu:** chỉ thêm reranker hoặc rewrite khi trace/eval chỉ ra retrieval/context là tầng gây lỗi.

## Tiêu chí nghiệm thu cho thay đổi RAG tiếp theo

- Không làm giảm citation validity và insufficient accuracy so với baseline đã ghi.
- Source được trích phải thuộc context/tool result của đúng lượt.
- Đổi embedding model phải tạo index/version mới và chỉ switch sau eval đạt.
- Câu policy mâu thuẫn/hết hiệu lực và document injection phải có case trong golden set.
- Có `trace_id` tra được cả ingestion và request path khi xảy ra sai lệch.

