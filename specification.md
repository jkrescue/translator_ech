# 总体目标与核心难点

你这个产品的核心链路是：

PDF 上传 → 解析页面/图片 → OCR（含版面/阅读顺序） → 翻译 → 排版生成新 PDF（双语/覆盖/并排）→ 下载

主要难点不在“有 OCR 就行”，而在：

- PDF 类型差异：可复制文本型 vs 扫描图片型 vs 混合型

版面恢复：段落顺序、表格、两栏、多页页眉页脚

异步任务：OCR/翻译很慢，必须做队列与任务状态

可扩展/可替换：OCR/翻译模型可能会换（Paddle、DeepSeek、其它）

所以后端建议从第一天就用“流水线 + 可插拔 provider”的结构。

# 技术栈推荐（FastAPI 路线）
## 服务与基础设施

API 服务：FastAPI

任务队列：Celery 或 RQ（新手更简单：RQ + Redis）

消息/缓存：Redis

数据库：PostgreSQL（也可先 SQLite，后期迁移）

文件存储：本地磁盘（MVP）→ S3/OSS/MinIO（上线）

容器化：Docker + docker-compose（本地一键起）

OCR 层（可插拔）

优先：PaddleOCR（自部署、免费、成熟）

可选：DeepSeek OCR / 其它 OCR API（省部署但有成本/隐私取舍）

版面分析（可选进阶）：Paddle 的 PP-Structure / Layout 模型，或专门的版面模型（后期做）

翻译层（可插拔）

MVP：先接一个可靠的翻译 API（成本可控、质量稳定）

进阶：LLM 翻译（支持术语表、风格、上下文一致性）

高阶：自建术语库 + 翻译记忆（TM）+ 质量评估

PDF 处理

文本提取：PyMuPDF（fitz）/ pdfplumber

图片渲染：PyMuPDF 把每页渲染成图片供 OCR

生成 PDF：ReportLab / WeasyPrint / PyMuPDF（按你想要的输出样式选）

MVP 建议：先做“纯文本译文 PDF”或“原文+译文双栏 PDF”（最易落地）

后期再做“覆盖原位排版”（最难）



# 问题记录
1. 前后端分别使用frontend以及backend两个路径进行管理代码
2. api key不要内置到代码中，可以使用.env来管理
3. pdf文件中会涉及到图表的布局，所以需要考虑布局bbox识别以及渲染
4. 完成后需要测试前端接口的服务是否正常，之后进行后端服务测试，尤其是外部LLM以及paddleocr等模型的调用服务是否正常等

# 问题记录1
Request URL:
http://localhost:5173/
Referrer Policy:
strict-origin-when-cross-origin
Sec-Ch-Ua:
"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"
Sec-Ch-Ua-Mobile:
?0
Sec-Ch-Ua-Platform:
"Windows"
Upgrade-Insecure-Requests:
1
User-Agent:
Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36

# 问题记录2
前端、后端服务无法访问，主要原因是云服务器（cvm）或者轻量级服务器需要对服务地址进行开放，如安全组或者防火墙（轻量服务器）添加入站规则
前后端均需注意，如前端使用vite可能默认5174的端口，后端使用fastapi可能默认的8000端口等
之前的问题：
浏览器
   ↓
腾讯云防火墙（轻量服务器）
   ↓
服务器
   ↓
Node服务5174
但 防火墙默认只开放：
22
80
443
所以 5174 被拦截。

| 框架         | 端口          |
| ---------- | ----------- |
| Vite       | 5173 / 5174 |
| React      | 3000        |
| SpringBoot | 8080        |
| Flask      | 5000        |
| Streamlit  | 8501        |

| 项目 | 填写        |
| -- | --------- |
| 协议 | TCP       |
| 端口 | 5174      |
| 来源 | 0.0.0.0/0 |
| 备注 | vite      |

# 问题记录3
1. 文档翻译过程中左侧要快速显示原始文档，即PDF直接解析，要对PDF中的图片、文本、表格等layout structure 准确识别，目前缺少版面解析、PDF重排等工具
2. 左侧栏直接显示完成内容后，右侧同步开始进行翻译，翻译的内容也要尽量与原始文档的layout一致，且图表等内容可以不用翻译，直接放到翻译文件中即可


# 问题记录4
1. 目前上传文档后页面左侧栏没有实时更新为最新文档的原始内容，即没有同步更新
2. 图表等内容没有显示，原始文档为 ~/hpc-datasheet-3002446.pdf 文件，可以参考该文档，应用前端的左栏要显示原文，右侧则对应是翻译的文档
3. 翻译完成之后的内容为 ~/hpc-datasheet-翻译.html 文件，明显并没有对应的图表等信息、布局也没有解析到，可以使用业内优秀的layout 或者structure工具，如ppstructure等，结合最优秀的开源工具修改

# 问题记录5
你现在的问题可以整理成 6 类：

1. 图片区域没有被识别为独立对象
右上产品图、图表都没被当作“图片区块”处理，而是被整体忽略或与文字分离。原 PDF 第 1 页明显包含大图和图表区域。

hpc-datasheet-sc24-h200-datashe…

2. 版面块没有切分
像右侧 “Key Features” 这种侧栏，本应是单独 block；现在被漏掉或顺序错乱。PP-StructureV3 这类文档版面管线专门就是解决“文本块、标题、图片、表格、公式、阅读顺序恢复”的。
paddlepaddle.github.io
+1

3. 阅读顺序错误
这类宣传页/数据表页通常不是从左到右一整列读完，而是“标题 -> 正文 -> 侧栏 -> 图表 -> 图注”。如果没有 layout reading order，翻译结果就会乱序。PP-StructureV3 明确支持多栏阅读顺序恢复。
paddlepaddle.github.io

4. 表格没有结构化
第 4 页技术规格表如果只靠 OCR，通常会被拉平成一串文本，列对齐、字段归属都会错。像 PP-StructureV3、MinerU、Docling 这类工具都强调表格/复杂 PDF 的结构化提取能力。

hpc-datasheet-sc24-h200-datashe…

 
paddlepaddle.github.io
+2
GitHub
+2

5. 数字 PDF 没走“原生文本抽取优先”
你这份 PDF 很可能本来就有可选文本层。对这类 PDF，先 OCR 再翻译通常是降级方案，容易丢字体层级、块坐标和表格关系。Docling、MinerU 都是把 PDF 先转成机器可读结构，而不只是做 OCR。
GitHub
+2
docling-project.github.io
+2

6. 译文没有“按块回填”
目前右侧像是把翻译结果简单列表化，没有按原坐标、字号、容器样式、段落间距回写，所以视觉上完全不像原文档。

结论先说：除了 PaddleOCR，你至少还需要这些工具层
1）PDF 原生解析层

优先加：

PyMuPDF / fitz

pdfplumber 或 pdfminer.six

作用不是 OCR，而是先判断：

该页是不是原生数字 PDF

文字块坐标

字体大小、粗细、行块

图片对象位置

表格大致边界

这一步很关键。
原则：能直接抽文本，就不要整页 OCR。

2）版面分析层

最推荐你先接：

PaddleOCR PP-StructureV3

或 Docling

或 MinerU

其中：

PP-StructureV3 自带版面区域分析、OCR，并可选表格识别、公式识别、Markdown 转换，适合做页面块切分和阅读顺序恢复。
paddlepaddle.github.io
+1

MinerU 适合把复杂 PDF 转成结构化 markdown / JSON，便于后续翻译和重排。
GitHub

Docling 更像统一文档理解框架，适合做 PDF 到结构化文档对象的转换。
docling-project.github.io
+1

3）OCR 层

PaddleOCR 继续保留，但降级为“局部 OCR / 扫描页 OCR”，不要当唯一入口。

典型策略：

数字 PDF：先原生解析

扫描 PDF：OCR

混合 PDF：文字层 + 图片区域 OCR

另外，如果你想给输出 PDF 重新加可搜索文本层，可以加 OCRmyPDF。它专门用来给扫描 PDF 添加 OCR 文本层。
ocrmypdf.readthedocs.io
+1

4）表格识别层

如果你的场景里技术白皮书、规格书很多，建议单独把表格抽成一层能力：

PP-StructureV3 的 table recognition

或 Camelot / Tabula（适合边界清晰的数字表格）

或 MinerU/Docling 的表格结构输出

5）图片/图表处理层

这个是你当前最缺的。
推荐的整体处理链路
最稳的后端流水线

A. PDF 预判

上传 PDF

判断每页是：

数字页

扫描页

混合页

B. 页面结构提取
每页输出统一 JSON：

{
  "page_no": 1,
  "width": 768,
  "height": 1024,
  "blocks": [
    {
      "id": "b1",
      "type": "title",
      "bbox": [50, 120, 430, 180],
      "text": "NVIDIA H200 Tensor Core GPU",
      "font_size": 28
    },
    {
      "id": "b2",
      "type": "paragraph",
      "bbox": [52, 320, 480, 470],
      "text": "The NVIDIA H200 Tensor Core GPU..."
    },
    {
      "id": "b3",
      "type": "image",
      "bbox": [490, 40, 760, 275]
    },
    {
      "id": "b4",
      "type": "sidebar",
      "bbox": [550, 340, 760, 560],
      "text": "Key Features..."
    },
    {
      "id": "b5",
      "type": "chart",
      "bbox": [70, 680, 500, 980]
    }
  ],
  "reading_order": ["b1", "b2", "b4", "b5"]
}


C. 翻译
只翻译这些 block 的 text，不要整页翻。
而且要：

标题、正文、表头分开翻

数字和单位保护

产品名术语表保护
例如：

NVIDIA Hopper

HBM3e

Tensor Core

Llama2 70B
这些不能乱译。

D. 页面重建
不是把译文堆成一个新页面，而是：

按原 bbox 回填

图片原样保留

图表原样保留或加覆盖翻译

表格按结构回填

E. 导出
导出双语视图或中文版 PDF。

你前端现在要改什么

你现在的 UI 已经很像“左原文右译文”的审校界面了，但缺少块级映射。

前端建议改成 3 层视图

1. 页面画布层
基于原 PDF 渲染页图作为底图。

2. 结构框层
把后端识别到的 block 框出来：

title

paragraph

image

chart

table

sidebar

用户点击某一块，右侧只显示该块的原文与译文。

3. 翻译覆盖层
支持切换：

原文

译文覆盖

双语对照

仅文字框显示

前端交互建议

增加这些功能：

“显示版面框”

“显示阅读顺序”

“锁定图片不翻译”

“表格单独编辑”

“术语表替换”

“重新跑本页”

“仅修复当前 block”

现在最该修的 5 件事

不要整页 OCR
先判断是不是数字 PDF。

先做 layout，再翻译
没有 block，后面全错。

图片和图表必须保留为对象
不能只抽文字。

表格单独处理
不能并入段落翻译。

译文按 bbox 回填
不是右侧纯文本堆叠。