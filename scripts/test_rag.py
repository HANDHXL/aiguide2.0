"""Test the RAG pipeline — build knowledge base and run test queries."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.services.rag_pipeline import RAGPipeline

TEST_QUESTIONS = [
    "灵山胜境在哪里？有多久的历史？",
    "灵山大佛有多高？有什么特色？",
    "九龙灌浴是什么？",
    "请介绍一下五印坛城",
    "灵山胜境有哪些核心景点？",
    "灵山胜境适合什么季节去游览？",
    "梵宫有什么特别之处？",
    "请推荐一条适合老年人游览的路线",
]


def test_retrieval_only():
    """Test retrieval without LLM (no API key needed)."""
    print("=" * 60)
    print("测试 1: 知识库检索（无需 LLM）")
    print("=" * 60)

    pipeline = RAGPipeline()
    pipeline.build_knowledge_base()

    for q in TEST_QUESTIONS[:4]:
        print(f"\n问题: {q}")
        results = pipeline.similarity_search(q, k=2)
        for i, r in enumerate(results):
            print(f"  结果{i+1}: {r['content'][:150]}...")
            print(f"  来源: {r['source']} | 类型: {r['type']}")


def test_full_rag():
    """Test full RAG with LLM generation (requires API key)."""
    print("\n" + "=" * 60)
    print("测试 2: 完整 RAG 问答（需要 OpenAI API Key）")
    print("=" * 60)

    pipeline = RAGPipeline()
    pipeline.build_knowledge_base()
    pipeline.init_llm()

    for q in TEST_QUESTIONS[:4]:
        print(f"\n问题: {q}")
        result = pipeline.query(q)
        print(f"回答: {result['answer'][:300]}")
        print(f"引用来源数: {len(result['sources'])}")


if __name__ == "__main__":
    test_retrieval_only()
    print("\n提示: 如需测试完整 LLM 问答，请在 .env 文件中配置 OPENAI_API_KEY")
    print("然后取消下面一行的注释:")
    print("# test_full_rag()")
