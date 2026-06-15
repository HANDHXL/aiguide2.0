# AI 数字人导游 · 灵山胜境

基于多模态大模型的智能景区导览系统。

## 快速启动

### 1. 环境要求

- Python 3.10+
- Node.js 18+
- 讯飞星火 API Key（或任意 OpenAI 兼容接口）

### 2. 后端

```bash
# 创建虚拟环境
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt

# 配置 API Key
cp .env.example .env
# 编辑 .env 填入你的 API Key

# 启动后端 (http://localhost:8000)
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. 前端

```bash
cd frontend

# 安装依赖
npm install

# 启动前端 (http://localhost:5173)
npm run dev
```

### 4. 访问

| 页面 | 地址 |
|:--|:--|
| 游客端 | http://localhost:5173/ |
| 管理后台 | http://localhost:5173/admin |
| 动作测试 | http://localhost:5173/motions |
| API 文档 | http://localhost:8000/docs |

## 项目结构

```
├── backend/                 # Python FastAPI 后端
│   ├── api/routes/          # REST + WebSocket 路由
│   ├── services/            # RAG管道 / 聊天 / 认证 / 管理
│   ├── database/            # SQLAlchemy ORM 模型
│   ├── schemas/             # Pydantic 数据模型
│   └── main.py              # 入口
├── frontend/                # React + TypeScript + Vite
│   ├── src/
│   │   ├── pages/           # TouristChat / AdminDashboard / LoginPage
│   │   ├── components/      # Live2D数字人 / 聊天 / 管理 / 认证
│   │   ├── live2d/          # Live2D Cubism SDK + Haru 模型驱动
│   │   ├── hooks/           # useWebSocket / useRecommend
│   │   ├── api/             # API 客户端
│   │   └── contexts/        # AuthContext
│   └── public/live2d/Haru/  # Live2D 模型资源
├── knowledge_base/          # 景区知识文档
├── tests/                   # 准确率评测脚本
└── data/                    # 向量数据库 + SQLite (运行时生成)
```

## 技术栈

| 层 | 技术 |
|:--|:--|
| 大模型 | 讯飞星火 / DeepSeek / GPT (OpenAI 兼容) |
| 嵌入模型 | shibing624/text2vec-base-chinese |
| 向量库 | ChromaDB |
| 知识库 | LangChain RAG |
| 数字人 | Live2D Cubism 4 + WebGL |
| 语音合成 | 讯飞 TTS / Edge TTS |
| 语音识别 | 讯飞 ASR / Whisper |
| 后端 | FastAPI + SQLAlchemy + SQLite |
| 前端 | React 18 + TypeScript + Tailwind CSS |
| 认证 | JWT |
