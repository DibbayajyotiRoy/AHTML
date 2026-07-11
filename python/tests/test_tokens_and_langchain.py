"""TASKS.md T2.6 (token counting) + T2.7 (LangChain integration).

Token counting: the compact form must measure meaningfully smaller than the
JSON form — the SDK's reason to exist. Real-tokenizer counting is an optional
extra ([tokens] → tiktoken); the estimator is always available.

LangChain: the loader maps snapshot entities to Documents with citation
metadata. langchain-core is an optional extra, so the loader must work
(duck-typed documents) without it and upgrade transparently with it.
"""
from pathlib import Path

import httpx
import pytest

import ahtml
from ahtml import from_json
from ahtml.tokens import count_tokens, estimate_tokens_chars_div4, measure

FIXTURES = Path(__file__).parent / "fixtures"
SNAP_JSON = (FIXTURES / "product_full.json").read_text()


def test_compact_measures_smaller_than_json() -> None:
    snap = from_json(SNAP_JSON)
    compact = ahtml.to_compact(snap)
    m_json = measure(SNAP_JSON)
    m_compact = measure(compact)
    assert m_compact["bytes"] < m_json["bytes"]
    assert (
        m_compact["tokens_estimate_chars_div4"] < m_json["tokens_estimate_chars_div4"]
    )
    assert estimate_tokens_chars_div4(compact) < estimate_tokens_chars_div4(SNAP_JSON)


def test_count_tokens_refuses_to_guess_without_tiktoken() -> None:
    """Design decision under test: count_tokens raises with install
    instructions rather than silently degrading to chars/4 — estimates must
    be asked for by name. A custom tokenizer hook always works."""
    try:
        import tiktoken  # noqa: F401
        pytest.skip("tiktoken installed — the refusal path is unreachable")
    except ImportError:
        pass
    with pytest.raises(ImportError, match="ahtml\\[tokens\\]"):
        count_tokens("hello world, this is a snapshot")
    assert count_tokens("12345678", tokenizer=lambda t: len(t) // 2) == 4


def test_count_tokens_matches_tiktoken_when_available() -> None:
    tiktoken = pytest.importorskip("tiktoken")
    enc = tiktoken.get_encoding("o200k_base")
    text = ahtml.to_compact(from_json(SNAP_JSON))
    assert count_tokens(text, model="o200k_base") == len(enc.encode(text))


# --- LangChain loader ---------------------------------------------------------


def test_loader_yields_documents_with_citation_metadata() -> None:
    from ahtml.langchain import AHTMLLoader

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            content=SNAP_JSON,
            headers={"content-type": "application/ahtml+json", "etag": 'W/"f4c2"'},
        )

    loader = AHTMLLoader(
        "https://shop.example.com/p/mbp-14-m3",
        client=ahtml.AHTMLClient(http=httpx.Client(transport=httpx.MockTransport(handler))),
    )
    docs = loader.load()
    assert docs, "loader must yield at least one document"
    doc = docs[0]
    assert "MacBook Pro" in doc.page_content
    assert doc.metadata["source"] == "https://shop.example.com/p/mbp-14-m3"
    assert doc.metadata.get("entity_id"), "citation anchor (entity id) must be preserved"


def test_quickstart_in_readme_is_under_15_lines() -> None:
    """The roadmap's acceptance bar: a LangChain agent answers a price
    question in <15 lines of Python. Enforce it against the README."""
    readme = (Path(__file__).parent.parent / "README.md").read_text()
    start = readme.index("```python")
    end = readme.index("```", start + 9)
    code_lines = [
        l for l in readme[start:end].splitlines()[1:]
        if l.strip() and not l.strip().startswith("#")
    ]
    assert len(code_lines) < 15, f"quickstart is {len(code_lines)} lines, must be <15"
