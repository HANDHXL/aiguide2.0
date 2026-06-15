"""Load and parse documents from the knowledge base."""

from pathlib import Path
from typing import List, Dict
from docx import Document
import pandas as pd


def load_docx(file_path: Path) -> List[Dict[str, str]]:
    """Load and parse a .docx file into structured documents."""
    doc = Document(str(file_path))
    docs = []

    # Extract paragraphs
    paragraphs = []
    for para in doc.paragraphs:
        text = para.text.strip()
        if text:
            paragraphs.append(text)

    # Extract tables
    tables = []
    for table in doc.tables:
        rows = []
        headers = [cell.text.strip() for cell in table.rows[0].cells]
        for row in table.rows[1:]:
            cells = [cell.text.strip() for cell in row.cells]
            row_dict = dict(zip(headers, cells))
            rows.append(row_dict)
        tables.append(rows)

    # Flatten into documents
    if paragraphs:
        full_text = "\n\n".join(paragraphs)
        docs.append({
            "content": full_text,
            "source": file_path.name,
            "type": "document_paragraphs"
        })

    for t_idx, table_rows in enumerate(tables):
        for r_idx, row in enumerate(table_rows):
            row_text = " | ".join(f"{k}: {v}" for k, v in row.items() if v)
            docs.append({
                "content": row_text,
                "source": file_path.name,
                "type": f"table_{t_idx}_row_{r_idx}",
                "metadata": row
            })

    return docs


def load_excel(file_path: Path) -> List[Dict[str, str]]:
    """Load structured data from Excel for analytics context."""
    df = pd.read_excel(str(file_path))

    # Generate summary statistics as document chunks
    summaries = []
    numeric_cols = df.select_dtypes(include=["number"]).columns

    summary_lines = [f"数据集概览：共{len(df)}条记录，包含{len(df.columns)}个字段。"]
    summary_lines.append(f"字段列表：{', '.join(df.columns.tolist())}。")

    for col in numeric_cols:
        if col in ("tourist_id",):
            continue
        stats = df[col].describe()
        summary_lines.append(
            f"{col} 统计：均值{stats['mean']:.2f}，"
            f"中位数{stats['50%']:.2f}，"
            f"最小值{stats['min']:.2f}，最大值{stats['max']:.2f}。"
        )

    # Satisfaction distribution
    if "satisfaction" in df.columns:
        sat_dist = df["satisfaction"].value_counts().sort_index()
        dist_parts = [f"满意度{k}分: {v}人({v/len(df)*100:.1f}%)" for k, v in sat_dist.items()]
        summary_lines.append(f"满意度分布：{'；'.join(dist_parts)}。")

    # Attraction popularity
    if "attraction_name" in df.columns:
        top_attractions = df["attraction_name"].value_counts().head(10)
        attr_parts = [f"{attr}: {cnt}次" for attr, cnt in top_attractions.items()]
        summary_lines.append(f"热门景点TOP10：{'；'.join(attr_parts)}。")

    return [{
        "content": "\n".join(summary_lines),
        "source": file_path.name,
        "type": "data_summary"
    }]


def load_all_documents(kb_dir: Path) -> List[Dict[str, str]]:
    """Load all documents from the knowledge base directory."""
    all_docs = []
    for file_path in kb_dir.glob("*"):
        if file_path.suffix == ".docx":
            all_docs.extend(load_docx(file_path))
        elif file_path.suffix == ".xlsx":
            all_docs.extend(load_excel(file_path))
    return all_docs
