#!/usr/bin/env python3
"""Accuracy evaluation for AI Digital Tour Guide.

Sends 20 standard questions to the local API, scores each answer against
expected key facts, and generates a report.

Usage:
    python tests/test_accuracy.py
"""
import json
import re
import time
import argparse
from dataclasses import dataclass
from typing import List

# ── 20 standard Q&A pairs (from the knowledge base docs) ──
# Each: question, expected answer must-contain keywords, expected source docs
# must_have: list of keyword groups. Each group = [alt1, alt2, ...]
# A group matches if ANY of its alternatives are found in the answer.
# The answer passes if ALL groups match at least one keyword.
TEST_CASES = [
    {"question": "灵山大佛有多高？",
     "must_have": [["88"], ["米", "米高"]]},

    {"question": "灵山大佛是什么材质的？",
     "must_have": [["青铜"], ["锡青铜", "青铜", "铜"]]},

    {"question": "灵山胜境在哪里？",
     "must_have": [["无锡"], ["太湖", "无锡"]]},

    {"question": "梵宫有什么特别之处？",
     "must_have": [["艺术殿堂", "东方卢浮宫", "卢浮宫", "佛教艺术"], ["木雕", "壁画", "琉璃", "工艺"]]},

    {"question": "九龙灌浴是什么表演？",
     "must_have": [["佛祖诞生", "诞生", "佛陀"], ["喷泉", "水幕", "动态"]]},

    {"question": "灵山有哪些必去景点？",
     "must_have": [["大佛"], ["梵宫"], ["五印坛城", "坛城"]]},

    {"question": "祥符禅寺有什么历史？",
     "must_have": [["玄奘", "唐代", "唐"], ["古刹", "寺庙", "寺院"]]},

    {"question": "五印坛城是什么风格建筑？",
     "must_have": [["藏传佛教", "藏式", "藏族"], ["鎏金", "金碧辉煌", "铜瓦"]]},

    {"question": "灵山胜境适合亲子游吗？",
     "must_have": [["九龙灌浴", "亲子", "孩子", "家庭"], ["推荐", "适合", "可以"]]},

    {"question": "游览灵山需要多长时间？",
     "must_have": [["半天", "2-3", "3小时", "2小时", "4小时"]]},

    {"question": "灵山有哪些文化活动？",
     "must_have": [["九龙灌浴", "祈福", "文化"], ["活动", "演出", "体验"]]},

    {"question": "阿育王柱有什么意义？",
     "must_have": [["阿育王", "阿育"], ["佛教", "佛法"]]},

    {"question": "降魔浮雕讲述了什么？",
     "must_have": [["佛祖", "佛陀", "释迦"], ["降魔", "成道", "觉悟"]]},

    {"question": "天下第一掌是什么？",
     "must_have": [["佛手", "手掌", "大手"], ["祈福", "大佛", "灵山"]]},

    {"question": "登云道有什么特点？",
     "must_have": [["台阶", "石阶", "步道"], ["登", "云", "道"]]},

    {"question": "五明桥的名字源自哪里？",
     "must_have": [["五明", "智慧", "学问"], ["佛教", "古印度"]]},

    {"question": "灵山大佛的莲花座有什么含义？",
     "must_have": [["莲花"], ["88", "佛教", "圣洁"]]},

    {"question": "五门牌楼象征什么？",
     "must_have": [["五方五佛", "五方", "牌楼"], ["石", "建筑", "门"]]},

    {"question": "曼飞龙塔是什么风格的建筑？",
     "must_have": [["南传佛教", "南传", "傣族"], ["塔", "建筑"]]},

    {"question": "请介绍一下灵山胜境照壁",
     "must_have": [["照壁", "影壁"], ["赵朴初", "题写", "石刻"]]},
]


@dataclass
class EvalResult:
    question: str
    answer: str
    passed: bool
    matched: list
    missing: list
    has_sources: bool
    latency_ms: float


def score_answer(answer: str, must_have: list) -> tuple[bool, list, list]:
    """Flexible keyword scoring.

    must_have is a list of groups. Each group is a list of alternative keywords.
    A group passes if at least one keyword from the group is found in the answer.
    The answer passes if ALL groups pass.
    """
    matched = []
    missing = []
    for group in must_have:
        alternatives = group if isinstance(group, list) else [group]
        found = False
        for kw in alternatives:
            if kw in answer:
                matched.append(kw)
                found = True
                break
        if not found:
            missing.append(alternatives[0])  # Report first keyword as missing
    passed = len(missing) == 0
    return passed, matched, missing


def _get_auth_token(base_url: str) -> str:
    """Auto-login (or register) to get a JWT token for testing."""
    import requests
    test_user = {"username": "eval_test", "password": "test123456"}
    # Try login first
    resp = requests.post(f"{base_url}/auth/login", json=test_user)
    if resp.status_code == 200:
        return resp.json()["token"]
    # Register if not exists
    resp = requests.post(f"{base_url}/auth/register", json=test_user)
    if resp.status_code == 200:
        return resp.json()["token"]
    raise RuntimeError(f"Cannot authenticate: {resp.text}")


def run_evaluation(base_url: str = "http://localhost:8000", token: str = None):
    """Run all test cases and print report."""
    import requests

    if not token:
        print("  [AUTH] Getting token...")
        token = _get_auth_token(base_url)
        print()

    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {token}"}

    results: List[EvalResult] = []
    total = len(TEST_CASES)
    passed = 0

    print("=" * 60)
    print("   AI 数字人导游 — 准确率评测")
    print("=" * 60)
    print(f"  测试集: {total} 条标准问答")
    print(f"  API: {base_url}")
    print()

    for i, tc in enumerate(TEST_CASES):
        question = tc["question"]
        print(f"[{i+1:2d}/{total}] {question}")

        start = time.time()
        try:
            resp = requests.post(
                f"{base_url}/chat",
                json={"question": question},
                headers=headers,
                timeout=60
            )
            data = resp.json()
            answer = data.get("answer", "")
            sources = data.get("sources", [])
        except Exception as e:
            answer = f"ERROR: {e}"
            sources = []

        latency = (time.time() - start) * 1000
        p, matched, missing = score_answer(answer, tc["must_have"])
        has_sources = len(sources) > 0

        result = EvalResult(
            question=question, answer=answer, passed=p,
            matched=matched, missing=missing,
            has_sources=has_sources, latency_ms=latency
        )
        results.append(result)

        if p:
            passed += 1
            print(f"        [PASS] 通过 ({latency:.0f}ms) 匹配: {', '.join(matched)}")
        else:
            missing_str = ', '.join(missing)
            print(f"        [FAIL] 未通过 ({latency:.0f}ms) 缺少: {missing_str}")
            print(f"        回答: {answer[:120]}...")

    # ── Summary ──
    accuracy = (passed / total) * 100
    avg_latency = sum(r.latency_ms for r in results) / len(results)
    source_rate = sum(1 for r in results if r.has_sources) / len(results) * 100

    print()
    print("=" * 60)
    print("   评测结果")
    print("=" * 60)
    print(f"  准确率:       {passed}/{total} = {accuracy:.1f}%")
    print(f"  平均延迟:     {avg_latency:.0f}ms")
    print(f"  来源引用率:   {source_rate:.0f}%")
    print(f"  赛题要求:     ≥90%")

    if accuracy >= 90:
        print()
        print("  [PASS] 达标！准确率满足赛题要求。")
    else:
        print()
        print(f"  [FAIL] 未达标，差 {90 - accuracy:.1f}%。建议检查以下问题：")
        for r in results:
            if not r.passed:
                print(f"     - {r.question}")
                print(f"       缺少关键词: {', '.join(r.missing)}")

    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="AI 数字人导游准确率评测")
    parser.add_argument("--base-url", default="http://localhost:8000", help="API base URL")
    parser.add_argument("--token", default=None, help="Auth JWT token (optional)")
    args = parser.parse_args()
    run_evaluation(args.base_url, args.token)
