"""Generate Vietnamese source files for the Fashion Tomodev catalog and FAQ."""

from __future__ import annotations

from datetime import date
from pathlib import Path
from xml.sax.saxutils import escape
from zipfile import ZIP_DEFLATED, ZipFile

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


OUTPUT_DIR = Path(__file__).resolve().parents[1] / "data" / "raw"
UPDATED_AT = "2026-10-27"

HEADERS = [
    "product_id",
    "product_name",
    "category",
    "price_vnd",
    "description",
    "sizes",
    "colors",
    "material",
    "stock_status",
    "updated_at",
]

PRODUCTS = [
    ("SM-001", "Áo sơ mi Oxford trắng dáng regular", "Áo sơ mi", 499000, "Áo sơ mi cổ bẻ, dáng regular dễ mặc; phù hợp đi làm và gặp gỡ cuối tuần.", "S, M, L, XL", "Trắng", "100% cotton Oxford", "Còn hàng", UPDATED_AT),
    ("SM-002", "Áo sơ mi Oxford xanh nhạt dáng regular", "Áo sơ mi", 499000, "Bề mặt Oxford đứng dáng, màu xanh nhạt dễ phối cùng quần tây hoặc chinos.", "S, M, L, XL", "Xanh nhạt", "100% cotton Oxford", "Còn hàng", UPDATED_AT),
    ("SM-003", "Áo sơ mi linen be dáng relaxed", "Áo sơ mi", 559000, "Chất linen thoáng, dáng relaxed mặc thoải mái trong thời tiết nóng.", "M, L, XL", "Be", "55% linen, 45% cotton", "Còn hàng", UPDATED_AT),
    ("SM-004", "Áo sơ mi linen xanh rêu dáng relaxed", "Áo sơ mi", 559000, "Áo sơ mi tay dài màu xanh rêu, phù hợp du lịch và phong cách casual.", "M, L, XL", "Xanh rêu", "55% linen, 45% cotton", "Sắp hết hàng", UPDATED_AT),
    ("SM-005", "Áo sơ mi caro navy dáng slim", "Áo sơ mi", 529000, "Họa tiết caro nhỏ, dáng slim gọn gàng; nên chọn lớn hơn một size nếu thích mặc thoải mái.", "S, M, L, XL", "Navy caro", "97% cotton, 3% spandex", "Còn hàng", UPDATED_AT),
    ("SM-006", "Áo sơ mi denim xanh trung", "Áo sơ mi", 579000, "Denim mềm đã xử lý wash nhẹ, có thể mặc như áo khoác mỏng.", "M, L, XL", "Xanh denim", "100% cotton denim", "Còn hàng", UPDATED_AT),
    ("SM-007", "Áo sơ mi sọc xanh trắng dáng regular", "Áo sơ mi", 519000, "Sọc dọc thanh lịch, thích hợp đi làm và sự kiện bán trang trọng.", "S, M, L, XL", "Xanh trắng", "100% cotton poplin", "Còn hàng", UPDATED_AT),
    ("SM-008", "Áo sơ mi đen chống nhăn", "Áo sơ mi", 549000, "Vải ít nhăn, màu đen dễ phối; thích hợp đi làm hoặc đi tiệc tối.", "S, M, L, XL", "Đen", "65% cotton, 35% polyester", "Còn hàng", UPDATED_AT),
    ("PL-001", "Áo polo pique đen", "Áo polo", 389000, "Áo polo cổ bo, form regular, logo thêu tối giản ở ngực trái.", "S, M, L, XL, XXL", "Đen", "100% cotton pique", "Còn hàng", UPDATED_AT),
    ("PL-002", "Áo polo pique trắng", "Áo polo", 389000, "Áo polo trắng cơ bản, bo cổ phối viền mảnh màu navy.", "S, M, L, XL, XXL", "Trắng", "100% cotton pique", "Còn hàng", UPDATED_AT),
    ("PL-003", "Áo polo pique xanh navy", "Áo polo", 389000, "Màu navy bền màu, có đường xẻ hai bên lai áo.", "S, M, L, XL, XXL", "Xanh navy", "100% cotton pique", "Còn hàng", UPDATED_AT),
    ("PL-004", "Áo polo dệt kim be", "Áo polo", 469000, "Cổ polo không nút, dệt kim mịn; phong cách smart casual.", "M, L, XL", "Be", "72% viscose, 28% nylon", "Còn hàng", UPDATED_AT),
    ("PL-005", "Áo polo thể thao xám", "Áo polo", 419000, "Vải co giãn và thấm hút, phù hợp di chuyển hoặc chơi golf nhẹ.", "M, L, XL, XXL", "Xám", "92% polyester, 8% spandex", "Còn hàng", UPDATED_AT),
    ("PL-006", "Áo polo sọc ngang xanh rêu", "Áo polo", 429000, "Sọc ngang mảnh, form regular; phù hợp phối cùng quần kaki.", "M, L, XL", "Xanh rêu", "100% cotton pique", "Sắp hết hàng", UPDATED_AT),
    ("TS-001", "Áo thun cotton trắng basic", "Áo thun", 249000, "Áo thun cổ tròn, form regular, đường may vai gia cố.", "S, M, L, XL, XXL", "Trắng", "100% cotton 230gsm", "Còn hàng", UPDATED_AT),
    ("TS-002", "Áo thun cotton đen basic", "Áo thun", 249000, "Áo thun cổ tròn màu đen, vải dày vừa, phù hợp mặc hằng ngày.", "S, M, L, XL, XXL", "Đen", "100% cotton 230gsm", "Còn hàng", UPDATED_AT),
    ("TS-003", "Áo thun oversize xám melange", "Áo thun", 289000, "Dáng oversize vai rơi, màu xám melange; nên chọn đúng size nếu thích form rộng.", "S, M, L, XL", "Xám melange", "100% cotton 260gsm", "Còn hàng", UPDATED_AT),
    ("TS-004", "Áo thun graphic City Ride", "Áo thun", 319000, "In lụa chủ đề thành phố ở mặt sau, mặt trước logo nhỏ.", "S, M, L, XL", "Trắng ngà", "100% cotton 240gsm", "Còn hàng", UPDATED_AT),
    ("TS-005", "Áo thun henley xanh navy", "Áo thun", 329000, "Cổ henley ba nút, dáng regular, thích hợp mặc layer.", "M, L, XL", "Xanh navy", "95% cotton, 5% spandex", "Còn hàng", UPDATED_AT),
    ("KN-001", "Áo len cổ tròn xám than", "Áo len", 649000, "Áo len mỏng cổ tròn, phù hợp mặc trong phòng lạnh hoặc layer cùng sơ mi.", "M, L, XL", "Xám than", "50% cotton, 50% acrylic", "Còn hàng", UPDATED_AT),
    ("KN-002", "Áo cardigan dệt kim navy", "Áo len", 729000, "Cardigan cài nút, dáng regular, hai túi trước tiện dụng.", "M, L, XL", "Xanh navy", "55% cotton, 45% acrylic", "Còn hàng", UPDATED_AT),
    ("JK-001", "Áo khoác bomber đen", "Áo khoác", 899000, "Bomber dáng regular, bo cổ và bo tay; phù hợp thời tiết se lạnh.", "M, L, XL", "Đen", "Vỏ nylon, lót polyester", "Còn hàng", UPDATED_AT),
    ("JK-002", "Áo khoác coach jacket xanh navy", "Áo khoác", 829000, "Coach jacket nút bấm, có lớp chống gió nhẹ.", "M, L, XL", "Xanh navy", "100% polyester", "Còn hàng", UPDATED_AT),
    ("JK-003", "Áo khoác denim xanh indigo", "Áo khoác", 949000, "Denim dày vừa, có túi ngực và túi hông; form regular.", "M, L, XL", "Xanh indigo", "100% cotton denim", "Còn hàng", UPDATED_AT),
    ("JK-004", "Áo khoác blazer casual xám", "Áo khoác", 1199000, "Blazer một hàng nút, không độn vai cứng, phù hợp smart casual.", "M, L, XL", "Xám", "68% polyester, 30% rayon, 2% spandex", "Sắp hết hàng", UPDATED_AT),
    ("QT-001", "Quần chinos be dáng slim taper", "Quần chinos", 549000, "Quần chinos dáng slim taper, cạp vừa; phù hợp đi làm và cuối tuần.", "29, 30, 31, 32, 34, 36", "Be", "97% cotton, 3% spandex", "Còn hàng", UPDATED_AT),
    ("QT-002", "Quần chinos xanh navy dáng slim taper", "Quần chinos", 549000, "Màu navy cơ bản, dễ phối áo sơ mi hoặc polo.", "29, 30, 31, 32, 34, 36", "Xanh navy", "97% cotton, 3% spandex", "Còn hàng", UPDATED_AT),
    ("QT-003", "Quần tây đen dáng slim", "Quần tây", 649000, "Quần tây ly chìm, dáng slim, phù hợp môi trường công sở.", "29, 30, 31, 32, 34", "Đen", "68% polyester, 30% rayon, 2% spandex", "Còn hàng", UPDATED_AT),
    ("QT-004", "Quần tây xám đậm dáng regular", "Quần tây", 649000, "Quần tây ống đứng nhẹ, có ly giữa sắc nét.", "30, 31, 32, 34, 36", "Xám đậm", "68% polyester, 30% rayon, 2% spandex", "Còn hàng", UPDATED_AT),
    ("QT-005", "Quần jeans slim fit xanh đậm", "Quần jeans", 689000, "Jeans wash tối, độ co giãn nhẹ, phù hợp mặc hằng ngày.", "29, 30, 31, 32, 34, 36", "Xanh đậm", "98% cotton, 2% spandex", "Còn hàng", UPDATED_AT),
    ("QT-006", "Quần jeans straight fit xanh nhạt", "Quần jeans", 689000, "Jeans ống đứng, wash sáng vừa, phong cách casual.", "29, 30, 31, 32, 34", "Xanh nhạt", "100% cotton denim", "Còn hàng", UPDATED_AT),
    ("QT-007", "Quần jogger đen co giãn", "Quần jogger", 459000, "Jogger cạp chun có dây rút, túi khóa kéo hai bên.", "M, L, XL", "Đen", "88% nylon, 12% spandex", "Còn hàng", UPDATED_AT),
    ("QT-008", "Quần short kaki be", "Quần short", 399000, "Quần short trên gối, dáng regular, có hai túi hông.", "29, 30, 31, 32, 34, 36", "Be", "97% cotton, 3% spandex", "Còn hàng", UPDATED_AT),
    ("QT-009", "Quần short thể thao đen", "Quần short", 349000, "Quần short thể thao nhẹ, có quần lót lưới bên trong.", "M, L, XL, XXL", "Đen", "100% polyester", "Còn hàng", UPDATED_AT),
    ("PK-001", "Thắt lưng da nâu bản 3,5 cm", "Phụ kiện", 399000, "Thắt lưng da thật bản 3,5 cm, khóa kim loại bạc mờ.", "105 cm, 115 cm, 125 cm", "Nâu", "Da bò", "Còn hàng", UPDATED_AT),
    ("PK-002", "Thắt lưng da đen bản 3,5 cm", "Phụ kiện", 399000, "Thắt lưng da thật màu đen, phù hợp quần tây và chinos.", "105 cm, 115 cm, 125 cm", "Đen", "Da bò", "Còn hàng", UPDATED_AT),
    ("PK-003", "Mũ lưỡi trai cotton navy", "Phụ kiện", 229000, "Mũ lưỡi trai điều chỉnh được ở phía sau, logo thêu tối giản.", "Freesize", "Xanh navy", "100% cotton", "Còn hàng", UPDATED_AT),
    ("PK-004", "Tất cotton cổ trung bộ 3 đôi", "Phụ kiện", 159000, "Bộ ba đôi tất cổ trung màu đen, trắng và xám.", "39–42, 43–46", "Đen, trắng, xám", "75% cotton, 22% polyester, 3% spandex", "Còn hàng", UPDATED_AT),
]


def column_name(index: int) -> str:
    result = ""
    while index:
        index, remainder = divmod(index - 1, 26)
        result = chr(65 + remainder) + result
    return result


def xlsx_cell(reference: str, value: object, style: int = 0) -> str:
    style_attr = f' s="{style}"' if style else ""
    if isinstance(value, (int, float)):
        return f'<c r="{reference}"{style_attr} t="n"><v>{value}</v></c>'
    return f'<c r="{reference}"{style_attr} t="inlineStr"><is><t>{escape(str(value))}</t></is></c>'


def write_xlsx(path: Path) -> None:
    rows = [HEADERS, *PRODUCTS]
    body = []
    for row_number, row in enumerate(rows, start=1):
        cells = []
        for column_number, value in enumerate(row, start=1):
            style = 1 if row_number == 1 else (2 if column_number == 4 else 0)
            cells.append(xlsx_cell(f"{column_name(column_number)}{row_number}", value, style))
        body.append(f'<row r="{row_number}">{"".join(cells)}</row>')

    worksheet = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:J{len(rows)}"/>
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <cols>
    <col min="1" max="1" width="14" customWidth="1"/>
    <col min="2" max="2" width="38" customWidth="1"/>
    <col min="3" max="3" width="18" customWidth="1"/>
    <col min="4" max="4" width="14" customWidth="1"/>
    <col min="5" max="5" width="78" customWidth="1"/>
    <col min="6" max="6" width="22" customWidth="1"/>
    <col min="7" max="7" width="24" customWidth="1"/>
    <col min="8" max="8" width="35" customWidth="1"/>
    <col min="9" max="9" width="18" customWidth="1"/>
    <col min="10" max="10" width="14" customWidth="1"/>
  </cols>
  <sheetData>{"".join(body)}</sheetData>
  <autoFilter ref="A1:J{len(rows)}"/>
</worksheet>'''

    styles = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1"><numFmt numFmtId="164" formatCode="#\,##0 &quot;₫&quot;"/></numFmts>
  <fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Aptos"/></font></fonts>
  <fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F4E78"/><bgColor indexed="64"/></patternFill></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>
</styleSheet>'''

    files = {
        "[Content_Types].xml": '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>''',
        "_rels/.rels": '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>''',
        "xl/workbook.xml": '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Catalog sản phẩm" sheetId="1" r:id="rId1"/></sheets></workbook>''',
        "xl/_rels/workbook.xml.rels": '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>''',
        "xl/worksheets/sheet1.xml": worksheet,
        "xl/styles.xml": styles,
        "docProps/core.xml": f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Catalog sản phẩm thời trang nam</dc:title><dc:creator>Fashion Assistant</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">{date.today().isoformat()}T00:00:00Z</dcterms:created></cp:coreProperties>''',
        "docProps/app.xml": '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Fashion Assistant</Application></Properties>''',
    }
    with ZipFile(path, "w", ZIP_DEFLATED) as archive:
        for filename, content in files.items():
            archive.writestr(filename, content)


SECTIONS = [
    ("1. Thông tin cửa hàng", [
        ("Fashion Tomodev là gì?", "Fashion Tomodev là cửa hàng thời trang nam, tập trung vào các sản phẩm áo sơ mi, áo polo, áo thun, áo khoác, quần và phụ kiện. Cửa hàng theo đuổi phong cách hiện đại, dễ mặc cho đi làm, gặp gỡ và sử dụng hằng ngày."),
        ("Địa chỉ cửa hàng ở đâu?", "Fashion Tomodev phục vụ khách tại địa chỉ 72–74 Lê Đại Hành, TP. Đà Nẵng."),
        ("Kênh hỗ trợ khách hàng", "Khách có thể liên hệ qua live chat trên website mỗi ngày từ 08:30 đến 21:30 hoặc đến trực tiếp cửa hàng trong giờ hoạt động để được tư vấn sản phẩm và size."),
    ]),
    ("2. Đặt hàng và thanh toán", [
        ("Đặt hàng như thế nào?", "Khách chọn sản phẩm, size và màu còn hàng, sau đó thêm vào giỏ và điền thông tin nhận hàng. Đơn chỉ được xác nhận sau khi cửa hàng kiểm tra tồn kho."),
        ("Có những hình thức thanh toán nào?", "Cửa hàng hỗ trợ thanh toán khi nhận hàng (COD), chuyển khoản ngân hàng và thanh toán bằng thẻ qua cổng thanh toán. Hiện cửa hàng chưa áp dụng trả góp."),
        ("Có thể sửa đơn sau khi đặt không?", "Có thể yêu cầu sửa địa chỉ, số điện thoại hoặc size trước khi đơn chuyển sang trạng thái đang giao. Sau thời điểm này, khách cần nhận hàng rồi thực hiện đổi trả theo chính sách."),
    ]),
    ("3. Giao hàng", [
        ("Phí giao hàng là bao nhiêu?", "Đơn hàng từ 799.000 VNĐ được miễn phí giao hàng toàn quốc. Đơn dưới 799.000 VNĐ có phí giao hàng tiêu chuẩn 30.000 VNĐ."),
        ("Thời gian giao hàng", "Nội thành Hà Nội và Thành phố Hồ Chí Minh: 1–2 ngày làm việc. Các tỉnh thành khác: 3–5 ngày làm việc. Thời gian không bao gồm Chủ nhật và ngày lễ."),
        ("Cửa hàng có giao quốc tế không?", "Hiện cửa hàng chỉ giao đến địa chỉ tại Việt Nam và chưa hỗ trợ giao hàng quốc tế."),
        ("Có được kiểm tra hàng trước khi thanh toán COD không?", "Khách được kiểm tra đúng mã sản phẩm, màu sắc và size trên nhãn trước khi thanh toán. Không thử sản phẩm hoặc bóc tem khi chưa hoàn tất thanh toán."),
    ]),
    ("4. Chính sách đổi size và đổi sản phẩm", [
        ("Thời hạn đổi size", "Khách có thể đổi size hoặc đổi sang sản phẩm khác trong vòng 7 ngày kể từ ngày nhận hàng. Sản phẩm cần còn nguyên tem, chưa giặt, chưa sử dụng, không có mùi lạ và có hóa đơn hoặc mã đơn hàng."),
        ("Điều kiện đổi sản phẩm", "Sản phẩm đổi phải còn hàng. Nếu sản phẩm mới có giá cao hơn, khách thanh toán phần chênh lệch; nếu thấp hơn, phần chênh lệch được hoàn bằng phương thức chuyển khoản sau khi cửa hàng xác nhận."),
        ("Phí đổi hàng", "Cửa hàng hỗ trợ phí vận chuyển một chiều cho lần đổi size đầu tiên nếu cửa hàng tư vấn sai size. Các trường hợp đổi theo nhu cầu cá nhân, khách thanh toán phí vận chuyển phát sinh."),
        ("Sản phẩm nào không được đổi?", "Tất, phụ kiện đã mở bao bì, sản phẩm giảm giá từ 40% trở lên và sản phẩm bị hư hỏng do sử dụng hoặc bảo quản không đúng cách không áp dụng đổi trả."),
    ]),
    ("5. Chính sách trả hàng và hoàn tiền", [
        ("Khi nào được trả hàng?", "Khách được yêu cầu trả hàng trong 7 ngày từ ngày nhận nếu nhận sai mã, sai size/màu so với đơn đã xác nhận, hoặc sản phẩm có lỗi sản xuất. Cửa hàng cần xác minh bằng ảnh hoặc video trước khi chấp nhận yêu cầu."),
        ("Hoàn tiền mất bao lâu?", "Sau khi cửa hàng nhận và kiểm tra hàng trả, hoàn tiền được xử lý trong 3–5 ngày làm việc. COD được hoàn bằng chuyển khoản; đơn thanh toán trước được hoàn về phương thức phù hợp sau khi xác minh."),
        ("Có hoàn tiền vì không thích sản phẩm không?", "Không. Trường hợp không thích sản phẩm nhưng hàng còn điều kiện đổi chỉ áp dụng đổi size hoặc đổi sản phẩm theo chính sách đổi hàng."),
    ]),
    ("6. Hướng dẫn chọn size", [
        ("Chọn size áo như thế nào?", "Đo vòng ngực và vai áo đang mặc vừa, sau đó so sánh với bảng size trên trang sản phẩm. Nếu số đo nằm giữa hai size, chọn size lớn hơn khi thích mặc thoải mái hoặc mặc layer."),
        ("Chọn size quần như thế nào?", "Đo vòng eo tại vị trí cạp quần và chiều dài quần mong muốn. Ví dụ, khách có vòng eo 80 cm thường phù hợp size 31 hoặc 32 tùy form; hãy kiểm tra mô tả từng sản phẩm trước khi tư vấn."),
        ("Có tư vấn size qua chat không?", "Có. Khách cung cấp chiều cao, cân nặng, số đo cơ bản và kiểu mặc mong muốn. Tư vấn size chỉ là gợi ý; cửa hàng không cam kết tuyệt đối vì thể trạng và sở thích mặc khác nhau."),
    ]),
    ("7. Bảo quản sản phẩm", [
        ("Cách bảo quản áo cotton và linen", "Giặt mặt trái bằng nước lạnh hoặc nước ấm nhẹ, không ngâm lâu, phơi nơi thoáng mát. Tránh dùng chất tẩy mạnh để giữ màu và bề mặt vải."),
        ("Cách bảo quản denim", "Lộn trái khi giặt, hạn chế giặt quá thường xuyên và không dùng máy sấy nhiệt cao. Màu denim có thể phai nhẹ trong các lần giặt đầu."),
        ("Cách bảo quản đồ dệt kim", "Giặt tay hoặc chọn chế độ nhẹ, không vắt xoắn. Phơi ngang để tránh dão vai và biến dạng áo."),
    ]),
]


def write_pdf(path: Path) -> None:
    font_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
    font_bold_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    pdfmetrics.registerFont(TTFont("DejaVu", font_path))
    pdfmetrics.registerFont(TTFont("DejaVu-Bold", font_bold_path))

    doc = SimpleDocTemplate(str(path), pagesize=A4, leftMargin=1.7 * cm, rightMargin=1.7 * cm, topMargin=1.6 * cm, bottomMargin=1.6 * cm)
    styles = getSampleStyleSheet()
    title = ParagraphStyle("TitleVN", parent=styles["Title"], fontName="DejaVu-Bold", fontSize=19, leading=24, alignment=TA_CENTER, textColor=colors.HexColor("#1F4E78"), spaceAfter=8)
    subtitle = ParagraphStyle("SubtitleVN", parent=styles["Normal"], fontName="DejaVu", fontSize=9, leading=13, alignment=TA_CENTER, textColor=colors.HexColor("#555555"), spaceAfter=18)
    heading = ParagraphStyle("HeadingVN", parent=styles["Heading2"], fontName="DejaVu-Bold", fontSize=13, leading=17, textColor=colors.HexColor("#1F4E78"), spaceBefore=12, spaceAfter=7)
    question = ParagraphStyle("QuestionVN", parent=styles["Normal"], fontName="DejaVu-Bold", fontSize=9.3, leading=13)
    answer = ParagraphStyle("AnswerVN", parent=styles["Normal"], fontName="DejaVu", fontSize=9.3, leading=13)

    story = [
        Paragraph("FAQ VÀ CHÍNH SÁCH CỬA HÀNG", title),
        Paragraph(f"Fashion Tomodev · 72–74 Lê Đại Hành, TP. Đà Nẵng · Cập nhật {UPDATED_AT}", subtitle),
    ]
    for section_title, entries in SECTIONS:
        story.append(Paragraph(section_title, heading))
        data = [[Paragraph("Câu hỏi", question), Paragraph("Thông tin", question)]]
        for q, a in entries:
            data.append([Paragraph(q, question), Paragraph(a, answer)])
        table = Table(data, colWidths=[5.0 * cm, 10.2 * cm], repeatRows=1, hAlign="LEFT")
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#D9EAF7")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#17365D")),
            ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#AAB7C4")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        story.append(KeepTogether(table))
        story.append(Spacer(1, 5))
    doc.build(story)


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    write_xlsx(OUTPUT_DIR / "bang_gia_san_pham_thoi_trang_nam.xlsx")
    write_pdf(OUTPUT_DIR / "faq_chinh_sach_cua_hang.pdf")
    print(f"Generated {len(PRODUCTS)} product records and {sum(len(entries) for _, entries in SECTIONS)} FAQ entries in {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
