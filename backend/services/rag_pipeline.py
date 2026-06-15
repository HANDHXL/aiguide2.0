"""RAG Pipeline: document chunking, embedding, vector storage, retrieval, and generation."""

from pathlib import Path
from typing import List, Dict, Optional, Iterator, AsyncIterator

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
回答要求：简洁清晰、口语化、适合语音播报，控制在200字以内。

知识库内容：
{context}"""


class RAGPipeline:
    """Complete RAG pipeline for the digital tour guide knowledge base."""

    def __init__(self, persist_dir: Optional[Path] = None):
        self.persist_dir = str(persist_dir or settings.VECTOR_DB_DIR)
        self.embeddings = HuggingFaceEmbeddings(
            model_name=settings.EMBEDDING_MODEL,
            model_kwargs={"device": "cpu"},
            encode_kwargs={"normalize_embeddings": True}
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
        kwargs = {
            "model": settings.LLM_MODEL,
            "temperature": 0.3,
            "streaming": streaming,
        }
        if settings.OPENAI_BASE_URL:
            kwargs["base_url"] = settings.OPENAI_BASE_URL
        if settings.OPENAI_API_KEY:
            kwargs["api_key"] = settings.OPENAI_API_KEY
        return ChatOpenAI(**kwargs)

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

    def _retrieve_context(self, question: str) -> tuple[str, List[Dict]]:
        """Retrieve relevant documents and build context string."""
        if self.vectorstore is None:
            self.load_vectorstore()
        docs = self.vectorstore.similarity_search(question, k=settings.TOP_K)
        context_parts = []
        sources = []
        for i, doc in enumerate(docs):
            context_parts.append(f"[{i+1}] {doc.page_content}")
            sources.append({
                "content": doc.page_content[:300],
                "source": doc.metadata.get("source", "unknown"),
                "type": doc.metadata.get("type", "unknown")
            })
        return "\n\n".join(context_parts), sources

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
        messages, sources = self._build_messages(question, history)
        llm = self._get_llm(streaming=True)

        full_answer = []
        async for chunk in llm.astream(messages):
            token = chunk.content if hasattr(chunk, "content") else str(chunk)
            if token:
                full_answer.append(token)
                yield {"token": token}

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
