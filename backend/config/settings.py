import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Load .env from exe directory (PyInstaller) or project root (dev)
_EXE_DIR = Path(sys.executable).parent if getattr(sys, 'frozen', False) else Path(__file__).resolve().parent.parent.parent
load_dotenv(_EXE_DIR / ".env")

# HuggingFace mirror for China
if not os.getenv("HF_ENDPOINT"):
    os.environ["HF_ENDPOINT"] = "https://hf-mirror.com"
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"

# Base directory: exe folder (PyInstaller) or project root (dev)
BASE_DIR = _EXE_DIR

# Knowledge base — placed next to exe for easy updates
KB_DIR = BASE_DIR / "knowledge_base" / "示范景区公开资料包"
DATA_DIR = BASE_DIR / "data"
VECTOR_DB_DIR = DATA_DIR / "vector_db"

# Embedding model
EMBEDDING_MODEL = "shibing624/text2vec-base-chinese"

# LLM
LLM_MODEL = os.getenv("LLM_MODEL", "gpt-3.5-turbo")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL")

# 讯飞平台
XUNFEI_APP_ID = os.getenv("XUNFEI_APP_ID", "")
XUNFEI_API_KEY = os.getenv("XUNFEI_API_KEY", "")
XUNFEI_API_SECRET = os.getenv("XUNFEI_API_SECRET", "")
SPARK_API_URL = os.getenv("SPARK_API_URL", "wss://spark-api.xf-yun.com/v3.5/chat")
SPARK_DOMAIN = os.getenv("SPARK_DOMAIN", "generalv3.5")

# 讯飞 TTS
TTS_API_URL = "https://tts-api.xfyun.cn/v2/tts"
TTS_VOICE = "xiaoyan"  # 小燕 (亲切女声)

# 讯飞 ASR
ASR_API_URL = "wss://iat-api.xfyun.cn/v2/iat"

# Chunking (减小分块加快检索和LLM处理)
CHUNK_SIZE = 350
CHUNK_OVERLAP = 60

# Retrieval — 评测驱动调优: TOP_K=5 确保广域问题能覆盖足够事实
TOP_K = 5
TOP_K_RRF = 5                    # RRF 融合时每种检索方式取 top N
HYBRID_ALPHA = 0.5               # 混合检索权重: 0=纯BM25, 1=纯向量, 0.5=均等融合

# Auth
JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-change-in-production")
