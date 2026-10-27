# Bài tập Week 6–7: Fashion Assistant

## Bối cảnh

Xây dựng trợ lý cho cửa hàng quần áo thời trang nam. Dự án được triển khai theo hai giai đoạn:

- **Week 6:** chatbot RAG tư vấn sản phẩm và chính sách cửa hàng.
- **Week 7:** nâng cấp chatbot thành AI Agent có tool calling/MCP, LangGraph, checkpoint và bước người duyệt cho hành động nhạy cảm.

Mỗi giai đoạn có thời lượng thực hiện **2 tuần**, làm cá nhân hoặc nhóm tối đa 2 người.

---

## Dữ liệu đầu vào

### 1. Excel báo giá sản phẩm

Mỗi dòng là một sản phẩm và cũng là **một chunk sản phẩm**. Không chia nhỏ thêm một dòng sản phẩm.

Nên chuẩn hóa các cột như sau:

| Cột | Mô tả |
| --- | --- |
| `product_id` | Mã sản phẩm |
| `product_name` | Tên sản phẩm |
| `category` | Danh mục, ví dụ áo sơ mi hoặc quần tây |
| `price` | Giá bán |
| `description` | Mô tả sản phẩm |
| `size` | Các size có sẵn |
| `color` | Màu sắc |
| `material` | Chất liệu |
| `stock_status` | Tình trạng còn hàng |
| `updated_at` | Ngày cập nhật |

Ví dụ nội dung một chunk sau khi nạp:

```text
[Mã: AO-001]
Tên sản phẩm: Áo sơ mi Oxford trắng
Danh mục: Áo sơ mi
Giá: 499.000 VNĐ
Mô tả: Form regular, phù hợp đi làm...
Size: S–XL
Màu: Trắng
Chất liệu: Cotton Oxford
Tình trạng: Còn hàng
Cập nhật: 2026-10-20
```

Lưu metadata riêng cho mỗi chunk: `source_type=product`, `product_id`, `category`, `updated_at` và `source_id`.

### 2. PDF FAQ và chính sách cửa hàng

PDF bao gồm giới thiệu cửa hàng, đổi trả, giao hàng, thanh toán, khuyến mãi, liên hệ và các FAQ liên quan.

- Trích xuất văn bản từ PDF.
- Cắt chunk theo từng mục/chính sách/FAQ thay vì chỉ cắt theo số ký tự.
- Mỗi chunk cần có tiêu đề và metadata, ví dụ: `source_type=policy`, `section=doi-tra`, `updated_at`.

Ví dụ:

```text
[Nguồn: Chính sách đổi trả]
Khách được đổi sản phẩm trong 7 ngày từ khi nhận hàng nếu còn nguyên tem,
chưa qua sử dụng và có hóa đơn mua hàng.
```

---

# Week 6 — RAG Fashion Assistant

## Mục tiêu

Xây dựng chatbot tư vấn sản phẩm và chính sách cửa hàng, chỉ sử dụng dữ liệu từ Excel và PDF. Chatbot phải nêu nguồn và từ chối trả lời khi không có căn cứ.

Ví dụ câu hỏi:

- “Có áo sơ mi trắng nào dưới 500.000đ không?”
- “Áo polo mã PO-002 còn size L không?”
- “Quần này làm từ chất liệu gì?”
- “Đơn bao nhiêu thì được miễn phí giao hàng?”
- “Tôi có thể đổi áo sau 10 ngày không?”
- “Shop có bán giày thể thao không?” → từ chối nếu dữ liệu không có.

## Pipeline bắt buộc

```text
Excel từng dòng → product chunks → embeddings ┐
                                                ├→ Vector DB → retrieval
PDF FAQ → policy/FAQ chunks → embeddings      ┘
                                                ↓
                         Prompt + sources → LLM → JSON answer + citations
```

## Phạm vi bắt buộc

| Hạng mục | Yêu cầu tối thiểu |
| --- | --- |
| Dữ liệu | Excel sản phẩm và PDF FAQ/chính sách có metadata |
| Ingestion | Đọc dữ liệu, tạo chunk, embedding và lưu vào vector DB |
| Retrieval | Tìm `top-k` chunk liên quan theo ngữ nghĩa |
| API/UI | Giao diện chat đơn giản hoặc API nhận câu hỏi và trả lời |
| Prompt | Chỉ trả lời từ `sources`; thiếu dữ kiện phải từ chối |
| Nguồn | Hiển thị tên/mã sản phẩm hoặc tên mục FAQ đã dùng |
| Validation | Kiểm tra JSON/output và các cited source phải tồn tại |
| Guardrails | Chặn câu quá dài, ngoài phạm vi và prompt injection cơ bản |
| Logging | Có `trace_id`, câu hỏi, chunk tìm được, score, nguồn dùng, latency/token nếu có |
| Evals | Golden set tối thiểu 30 câu hỏi |

## Quy tắc trả lời

- Chỉ dùng dữ liệu từ hai file.
- Giá, size, màu, chất liệu và tình trạng hàng phải có trong source mới được trả lời.
- Không tìm thấy sản phẩm/chính sách phù hợp thì nói rõ chưa có dữ liệu.
- Luôn hiển thị nguồn.
- Nếu chính sách mâu thuẫn, ưu tiên chunk có `updated_at` mới hơn.

## Golden set tối thiểu

| Nhóm câu hỏi | Số câu |
| --- | ---: |
| Tìm sản phẩm theo tên, loại, màu, size | 10 |
| Hỏi giá, chất liệu, mô tả, tình trạng hàng | 6 |
| Lọc nhiều điều kiện: loại + giá + size/màu | 4 |
| Hỏi chính sách giao hàng/đổi trả/thanh toán | 5 |
| Kết hợp sản phẩm + chính sách | 2 |
| Không có trong dữ liệu | 2 |
| Prompt injection/ngoài phạm vi | 1 |

## Tiêu chí hoàn thành

- Tìm đúng sản phẩm hoặc đúng mục chính sách.
- Trả lời kèm citation đúng với dữ kiện đã dùng.
- Không bịa giá, size, màu, tình trạng hoặc chính sách.
- Từ chối rõ ràng khi không đủ thông tin.
- Có trace để xác định lỗi thuộc retrieval, context hay generation.

## Deliverables

- Source code.
- Excel/PDF hoặc dữ liệu mẫu đã được ẩn thông tin nhạy cảm.
- README hướng dẫn chạy.
- Golden set và kết quả đánh giá.
- Ảnh hoặc video demo: trả lời đúng, từ chối đúng, chặn prompt injection.

---

# Week 7 — Fashion Assistant thành AI Agent

## Mục tiêu

Nâng cấp chatbot RAG từ Week 6 thành AI Agent có thể xử lý tác vụ nhiều bước bằng tool calling/MCP. Hành động đổi/trả phải được người duyệt trước khi thực hiện.

Use case: khách hỏi tình trạng đơn hàng và yêu cầu đổi/trả sản phẩm.

Ví dụ:

> “Đơn DH-1001 của tôi có áo sơ mi bị rộng, tôi muốn đổi size L.”

Agent cần:

1. Tra đơn hàng.
2. Tra chính sách đổi trả từ PDF/RAG.
3. Kiểm tra điều kiện đổi/trả.
4. Đề xuất đổi size hoặc từ chối, kèm lý do.
5. Nếu cần tạo yêu cầu đổi/trả, dừng chờ nhân viên duyệt.
6. Sau khi được duyệt, gọi tool thực hiện và trả lời khách.

## Tools/MCP tối thiểu

| Tool | Loại | Mục đích |
| --- | --- | --- |
| `lookup_product(product_id)` | Read-only | Tra sản phẩm từ Excel/catalog |
| `lookup_order(order_id)` | Read-only | Tra đơn giả lập từ JSON hoặc SQLite |
| `search_policy(query)` | Read-only | Tra chính sách FAQ qua RAG |
| `create_exchange_request(order_id, product_id, requested_size)` | Write | Tạo yêu cầu đổi hàng giả lập |
| `create_return_request(order_id, product_id, reason)` | Write | Tạo yêu cầu trả hàng giả lập |

Hai tool ghi dữ liệu là hành động nhạy cảm; chỉ được gọi sau bước phê duyệt của con người.

## Workflow LangGraph

```text
START
  ↓
agent
  ├─ cần tra cứu → tools → agent
  ├─ cần đổi/trả → approve (interrupt)
  │                    ↓ duyệt
  │                  tools → agent
  │                    ↓ từ chối
  │                  agent
  └─ không cần tool → remember → END
```

## State tối thiểu

```text
messages        # lịch sử hội thoại
user_id         # khách đang chat
order_id        # mã đơn, nếu đã xác định
pending_action  # yêu cầu đổi/trả đang chờ duyệt
approval_status # pending / approved / rejected
```

## Checkpoint, memory và an toàn

- Mỗi phiên chat có `thread_id`.
- Dừng tại `interrupt()` khi Agent đề xuất tạo yêu cầu đổi/trả.
- Nhân viên duyệt hoặc từ chối, sau đó `resume` cùng `thread_id`.
- Tool ghi dữ liệu phải idempotent. Dùng, ví dụ, `order_id + product_id + action_type` làm idempotency key để không tạo hai yêu cầu trùng khi chạy lại.
- Store dài hạn chỉ lưu thông tin cần thiết như size thường mua hoặc yêu cầu gần nhất; không lưu dữ liệu nhạy cảm không cần dùng.
- Đặt step limit và phân quyền tối thiểu cho tools.

## Golden set tối thiểu

Tối thiểu 30 tình huống Agent, gồm:

- Tra đơn hợp lệ và đơn không tồn tại.
- Đổi size hợp lệ và không hợp lệ.
- Trả hàng trong hạn và quá hạn.
- Đơn chưa giao nhưng khách yêu cầu đổi.
- Tình huống cần dùng cả dữ liệu đơn hàng và chính sách.
- Nhân viên duyệt, từ chối hoặc chưa phản hồi.
- Resume từ checkpoint.
- Gọi lại cùng một yêu cầu để kiểm tra không tạo bản ghi trùng.
- Prompt injection và yêu cầu ngoài phạm vi.

## Tiêu chí hoàn thành

- Agent chọn/gọi đúng tool với tham số hợp lệ.
- Agent không tự thực hiện hành động nhạy cảm trước khi được phê duyệt.
- Sau `resume`, workflow chạy tiếp từ checkpoint đúng.
- Gọi lại cùng hành động không tạo yêu cầu đổi/trả trùng lặp.
- Có trace cho node/tool call, số bước, độ trễ và lỗi.
- Kết quả eval phiên bản mới không thấp hơn baseline.

## Deliverables

- Source code Agent, MCP server và LangGraph workflow.
- Sơ đồ graph gồm node, edge, state và vị trí `interrupt()`.
- README hướng dẫn chạy và mô tả quyền của từng tool.
- Golden set 30 câu cùng kết quả eval.
- Ảnh/video demo: tra cứu đơn, chờ duyệt, từ chối duyệt và resume hoàn tất đổi/trả.

---

## Phân tách phạm vi

Week 6 tập trung vào việc **trả lời đúng theo Excel/PDF bằng RAG**. Week 7 mở rộng thành **Agent tự quyết định bước xử lý** nhưng vẫn phải có guardrail, checkpoint và người duyệt trước khi tạo yêu cầu đổi/trả.
