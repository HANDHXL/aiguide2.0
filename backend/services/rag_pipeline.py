"""RAG Pipeline: document chunking, embedding, vector storage, retrieval, and generation."""

# Force offline mode BEFORE any huggingface imports — avoids network timeout
# when hf-mirror.com is unreachable (model already cached locally)
import os as _os
_os.environ.setdefault("HF_HUB_OFFLINE", "1")
_os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")

from pathlib import Path
from typing import List, Dict, Optional, Iterator, AsyncIterator

from loguru import logger
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import Chroma
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_classic.chains import RetrievalQA
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from langchain_openai import ChatOpenAI

from backend.config import settings
from backend.services.document_loader import load_all_documents

SYSTEM_PROMPT = """你是灵山胜境的AI数字人导游"小灵"。你热情专业，熟悉景区的历史、文化、景点信息。

请根据以下知识库内容回答游客的问题。如果知识库中没有相关信息，请友好地说明，不要编造。

回答要求：
1. 优先覆盖知识库中与问题直接相关的关键事实和数据
2. 对于列举类问题（如"有哪些景点"、"推荐路线"），请逐项列出，不要遗漏
3. 语言口语化、适合语音播报，控制在250字以内
4. 涉及数字、年代、名称时务必引用知识库原文

知识库内容：
{context}"""


class RAGPipeline:
    """Complete RAG pipeline for the digital tour guide knowledge base."""

    def __init__(self, persist_dir: Optional[Path] = None):
        self.persist_dir = str(persist_dir or settings.VECTOR_DB_DIR)
        self.embeddings = HuggingFaceEmbeddings(
            model_name=settings.EMBEDDING_MODEL,
            model_kwargs={"device": "cpu"},
            encode_kwargs={"normalize_embeddings": True},
        )
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=settings.CHUNK_SIZE,
            chunk_overlap=settings.CHUNK_OVERLAP,
            separators=["\n\n", "\n", "。", "！", "？", "；", "，", " ", ""],
            keep_separator=True
        )
        self.vectorstore: Optional[Chroma] = None
        self.qa_chain: Optional[RetrievalQA] = None
        self._llm: Optional[ChatOpenAI] = None
        self._streaming_llm: Optional[ChatOpenAI] = None
        self._all_chunks: Optional[List[str]] = None    # cached all chunk texts for BM25
        self._all_metadatas: Optional[List[Dict]] = None

    def build_knowledge_base(self, kb_dir: Optional[Path] = None, force_rebuild: bool = False):
        kb_dir = kb_dir or settings.KB_DIR
        if not force_rebuild and Path(self.persist_dir).exists() and any(Path(self.persist_dir).iterdir()):
            print(f"Vector store already exists at {self.persist_dir}, loading existing...")
            self.vectorstore = Chroma(
                persist_directory=self.persist_dir,
                embedding_function=self.embeddings
            )
            return self
        print("Loading documents from knowledge base...")
        docs = load_all_documents(kb_dir)
        print(f"Loaded {len(docs)} document sections.")
        print("Chunking documents...")
        chunks = []
        for doc in docs:
            doc_chunks = self.text_splitter.create_documents(
                texts=[doc["content"]],
                metadatas=[{"source": doc["source"], "type": doc["type"]}]
            )
            chunks.extend(doc_chunks)
        print(f"Created {len(chunks)} chunks.")
        print("Building vector embeddings and storing to ChromaDB...")
        self.vectorstore = Chroma.from_documents(
            documents=chunks,
            embedding=self.embeddings,
            persist_directory=self.persist_dir
        )
        print("Knowledge base built successfully.")
        return self

    def load_vectorstore(self):
        if not Path(self.persist_dir).exists():
            raise FileNotFoundError(f"Vector store not found at {self.persist_dir}. Run build_knowledge_base() first.")
        self.vectorstore = Chroma(
            persist_directory=self.persist_dir,
            embedding_function=self.embeddings
        )
        return self

    def _get_llm(self, streaming: bool = False) -> ChatOpenAI:
        # 缓存 LLM 实例，避免每次查询重建
        if streaming and self._streaming_llm is not None:
            return self._streaming_llm
        if not streaming and self._llm is not None:
            return self._llm

        kwargs = {
            "model": settings.LLM_MODEL,
            "temperature": 0.3,
            "streaming": streaming,
            "timeout": 20.0,           # 20秒超时（正确参数名是 timeout 不是 request_timeout）
            "max_retries": 1,          # 只重试1次
            "max_tokens": 300,         # 限制回答长度，加快响应
        }
        if settings.OPENAI_BASE_URL:
            kwargs["base_url"] = settings.OPENAI_BASE_URL
        if settings.OPENAI_API_KEY:
            kwargs["api_key"] = settings.OPENAI_API_KEY
        llm = ChatOpenAI(**kwargs)

        if streaming:
            self._streaming_llm = llm
        else:
            self._llm = llm
        return llm

    def init_llm(self):
        self._llm = self._get_llm(streaming=False)
        if self.vectorstore is None:
            self.load_vectorstore()
        self.qa_chain = RetrievalQA.from_chain_type(
            llm=self._llm,
            chain_type="stuff",
            retriever=self.vectorstore.as_retriever(search_kwargs={"k": settings.TOP_K}),
            return_source_documents=True
        )
        return self

    def _build_messages(self, question: str, history: Optional[List[dict]] = None) -> tuple[list, List[Dict]]:
        """Build message list with RAG context and optional conversation history."""
        context, sources = self._retrieve_context(question)
        prompt = SYSTEM_PROMPT.format(context=context)
        messages = [SystemMessage(content=prompt)]
        if history:
            for turn in history[-20:]:  # 最近10轮
                if turn["role"] == "user":
                    messages.append(HumanMessage(content=turn["content"]))
                elif turn["role"] == "assistant":
                    messages.append(AIMessage(content=turn["content"]))
        messages.append(HumanMessage(content=question))
        return messages, sources

    def _get_all_chunks(self) -> tuple[List[str], List[Dict]]:
        """Get all chunk texts and metadata from the vector store (cached)."""
        if self._all_chunks is not None:
            return self._all_chunks, self._all_metadatas
        if self.vectorstore is None:
            self.load_vectorstore()
        data = self.vectorstore._collection.get(include=["documents", "metadatas"])
        self._all_chunks = data["documents"]
        self._all_metadatas = data["metadatas"]
        logger.info(f"BM25 索引就绪: {len(self._all_chunks)} 个文档块")
        return self._all_chunks, self._all_metadatas

    def _keyword_search(self, query: str, k: int = 5) -> List[tuple[int, float]]:
        """Simple BM25-like keyword retrieval using term overlap scoring.
        Returns list of (chunk_index, score) sorted by descending score."""
        chunks, _ = self._get_all_chunks()
        # Tokenize: character bigrams + whole words (Chinese-friendly)
        query_tokens = set()
        for i in range(len(query)):
            if i < len(query) - 1:
                query_tokens.add(query[i:i+2])  # bigram
            query_tokens.add(query[i])           # unigram

        if not query_tokens:
            return []

        scored = []
        for idx, chunk in enumerate(chunks):
            # Count token matches in chunk
            match_count = sum(1 for t in query_tokens if t in chunk)
            if match_count == 0:
                continue
            # TF-like score normalized by chunk length
            score = match_count / (len(chunk) ** 0.3)
            scored.append((idx, score))

        # Sort by score descending, take top k
        scored.sort(key=lambda x: x[1], reverse=True)
        return scored[:k]

    def _retrieve_context_hybrid(self, question: str) -> tuple[str, List[Dict]]:
        """Hybrid retrieval: BM25 keyword + vector similarity, fused via RRF."""
        import time
        t0 = time.time()
        if self.vectorstore is None:
            self.load_vectorstore()

        k_rrf = settings.TOP_K_RRF
        final_k = settings.TOP_K

        # 1. Vector search
        vec_docs = self.vectorstore.similarity_search(question, k=k_rrf)

        # 2. Keyword search
        kw_results = self._keyword_search(question, k=k_rrf)

        # 3. Reciprocal Rank Fusion
        chunks, metadatas = self._get_all_chunks()
        rrf_scores: Dict[int, float] = {}
        k_rrf_const = 60  # RRF smoothing constant

        # Vector rank scores
        for rank, doc in enumerate(vec_docs):
            # Find the index of this doc in the all_chunks list
            content = doc.page_content
            for idx, chunk in enumerate(chunks):
                if chunk == content:
                    rrf_scores[idx] = rrf_scores.get(idx, 0) + 1.0 / (k_rrf_const + rank + 1)
                    break

        # Keyword rank scores
        for rank, (idx, _) in enumerate(kw_results):
            rrf_scores[idx] = rrf_scores.get(idx, 0) + 1.0 / (k_rrf_const + rank + 1)

        # Sort by RRF score descending
        sorted_indices = sorted(rrf_scores.items(), key=lambda x: x[1], reverse=True)

        t1 = time.time()

        # Build context from top-k
        context_parts = []
        sources = []
        for i, (idx, score) in enumerate(sorted_indices[:final_k]):
            text = chunks[idx]
            meta = metadatas[idx] if idx < len(metadatas) else {}
            context_parts.append(f"[{i+1}] {text}")
            sources.append({
                "content": text[:300],
                "source": meta.get("source", "unknown"),
                "type": meta.get("type", "unknown")
            })

        vec_only = len(vec_docs)
        kw_only = len([idx for idx, _ in kw_results if idx not in [c for c in [chunks.index(d.page_content) for d in vec_docs if d.page_content in chunks]]])
        logger.info(f"混合检索: 向量{vec_only}篇 + 关键词{len(kw_results)}篇 → RRF融合{len(sorted_indices)}篇 → 取Top{final_k}, 耗时{t1-t0:.2f}s")
        return "\n\n".join(context_parts), sources

    def _retrieve_context(self, question: str) -> tuple[str, List[Dict]]:
        """Retrieve relevant documents using hybrid search (BM25 + vector)."""
        return self._retrieve_context_hybrid(question)

    def query(self, question: str, history: Optional[List[dict]] = None) -> Dict:
        if self._llm is None:
            self.init_llm()
        messages, sources = self._build_messages(question, history)
        llm = self._get_llm(streaming=False)
        response = llm.invoke(messages)
        return {
            "question": question,
            "answer": response.content,
            "sources": sources
        }

    def query_stream(self, question: str, history: Optional[List[dict]] = None) -> Iterator[Dict]:
        """Stream the answer token by token. Yields dicts with 'token' or 'done'+'sources'."""
        messages, sources = self._build_messages(question, history)
        llm = self._get_llm(streaming=True)

        full_answer = []
        for chunk in llm.stream(messages):
            token = chunk.content if hasattr(chunk, "content") else str(chunk)
            if token:
                full_answer.append(token)
                yield {"token": token}

        yield {"done": True, "answer": "".join(full_answer), "sources": sources}

    async def query_stream_async(self, question: str, history: Optional[List[dict]] = None) -> AsyncIterator[Dict]:
        """Async version of query_stream for WebSocket."""
        import time
        messages, sources = self._build_messages(question, history)
        llm = self._get_llm(streaming=True)

        t0 = time.time()
        first_token_yielded = False
        full_answer = []
        async for chunk in llm.astream(messages):
            token = chunk.content if hasattr(chunk, "content") else str(chunk)
            if token:
                if not first_token_yielded:
                    t1 = time.time()
                    logger.info(f"LLM首字延迟: {t1-t0:.2f}s")
                    first_token_yielded = True
                full_answer.append(token)
                yield {"token": token}

        t2 = time.time()
        logger.info(f"LLM回答完成: {len(full_answer)}字, 总耗时{t2-t0:.2f}s")
        yield {"done": True, "answer": "".join(full_answer), "sources": sources}

    def similarity_search(self, query: str, k: int = 5) -> List[Dict]:
        if self.vectorstore is None:
            self.load_vectorstore()
        docs = self.vectorstore.similarity_search(query, k=k)
        return [{
            "content": doc.page_content,
            "source": doc.metadata.get("source", "unknown"),
            "type": doc.metadata.get("type", "unknown")
        } for doc in docs]


_pipeline: Optional[RAGPipeline] = None


def get_pipeline() -> RAGPipeline:
    global _pipeline
    if _pipeline is None:
        _pipeline = RAGPipeline()
    return _pipeline


def build_knowledge_base(force: bool = False):
    pipeline = get_pipeline()
    pipeline.build_knowledge_base(force_rebuild=force)
    return pipeline


def query(question: str, history: Optional[List[dict]] = None) -> Dict:
    pipeline = get_pipeline()
    if pipeline.vectorstore is None:
        pipeline.load_vectorstore()
    return pipeline.query(question, history)


def query_stream(question: str, history: Optional[List[dict]] = None) -> Iterator[Dict]:
    pipeline = get_pipeline()
    if pipeline.vectorstore is None:
        pipeline.load_vectorstore()
    return pipeline.query_stream(question, history)


async def query_stream_async(question: str, history: Optional[List[dict]] = None) -> AsyncIterator[Dict]:
    pipeline = get_pipeline()
    if pipeline.vectorstore is None:
        pipeline.load_vectorstore()
    async for chunk in pipeline.query_stream_async(question, history):
        yield chunk
