"""LangChain integration — port of ``packages/langchain/src/index.ts``.

``AHTMLLoader`` fetches AHTML-emitting sites and returns LangChain
``Document`` records — ``Document.chunks`` preserved as separate records
(one per chunk) with citation anchors, byte ranges, and parent links intact.

Works with or without ``langchain-core`` installed (``pip install
ahtml[langchain]``): when absent, the loader returns plain
:class:`LangChainDocument` objects with the same ``page_content`` /
``metadata`` fields, so the chunk/metadata mapping is identical either way.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional, Union

from .client import AHTMLClient
from .snapshot import Snapshot

__all__ = ["AHTMLLoader", "LangChainDocument"]

try:  # guard the optional dependency
    from langchain_core.documents import Document as _LCDocument  # type: ignore

    _HAS_LANGCHAIN = True
except ImportError:  # pragma: no cover — exercised when extra not installed
    _LCDocument = None
    _HAS_LANGCHAIN = False


@dataclass
class LangChainDocument:
    """Minimal Document shape compatible with langchain-core's Document."""

    page_content: str
    metadata: dict = field(default_factory=dict)


def _make_document(page_content: str, metadata: dict) -> Any:
    if _HAS_LANGCHAIN:
        return _LCDocument(page_content=page_content, metadata=metadata)
    return LangChainDocument(page_content=page_content, metadata=metadata)


class AHTMLLoader:
    """LangChain document loader for AHTML sites.

    ::

        from ahtml.langchain import AHTMLLoader

        loader = AHTMLLoader("https://docs.acmecloud.com")
        docs = loader.load()
    """

    def __init__(
        self,
        urls: Union[str, list[str]],
        *,
        client: Optional[AHTMLClient] = None,
        agent: str = "AHTMLLoader/0.1",
        bearer: Optional[str] = None,
        include_parent: bool = True,
        filter_type: Optional[str] = None,
    ) -> None:
        self._urls = urls
        self._bearer = bearer
        self._include_parent = include_parent
        self._filter_type = filter_type
        self._client = client or AHTMLClient(agent=agent)

    def load(self) -> list:
        urls = self._urls if isinstance(self._urls, list) else [self._urls]
        out: list = []
        for url in urls:
            snap = self._client.fetch(url, format="json", bearer=self._bearer)
            for entity in snap.get("entities", []):
                if self._filter_type and entity.get("type") != self._filter_type:
                    continue
                out.extend(
                    _entity_to_documents(entity, snap, self._include_parent)
                )
        return out


def _entity_to_documents(
    entity: dict, snap: Snapshot | dict, include_parent: bool
) -> list:
    base_metadata: dict[str, Any] = {
        "source": snap.get("url"),
        "entity_id": entity.get("id"),
        "entity_type": entity.get("type"),
        "page_type": snap.get("page_type"),
        "fetched_at": snap.get("fetched_at"),
        "etag": snap.get("etag"),
        "license": (snap.get("policy") or {}).get("license"),
    }

    # Documents: split into chunks if available; else one record with the
    # full content.
    if entity.get("type") == "document":
        records: list = []
        if include_parent:
            records.append(
                _make_document(
                    entity.get("content")
                    or entity.get("summary")
                    or entity.get("title", ""),
                    {
                        **base_metadata,
                        "title": entity.get("title"),
                        "author": entity.get("author"),
                        "published_at": entity.get("published_at"),
                        "modified_at": entity.get("modified_at"),
                        "language": entity.get("language"),
                        "tags": entity.get("tags"),
                        "canonical_url": entity.get("canonical_url"),
                        "word_count": entity.get("word_count"),
                    },
                )
            )
        if entity.get("chunks") and entity.get("content"):
            for chunk in entity["chunks"]:
                records.append(_chunk_to_document(chunk, entity, base_metadata))
        return records

    # Other entities: one record per entity, content = flattened text.
    return [
        _make_document(
            _entity_to_text(entity),
            {**base_metadata, **_entity_metadata(entity)},
        )
    ]


def _chunk_to_document(chunk: dict, doc: dict, base_metadata: dict) -> Any:
    start, end = chunk.get("byte_range", (0, 0))
    page_content = (doc.get("content") or "")[start:end]
    return _make_document(
        page_content,
        {
            **base_metadata,
            "chunk_id": chunk.get("id"),
            "chunk_parent": chunk.get("parent"),
            "chunk_heading": chunk.get("heading"),
            "chunk_anchor": chunk.get("anchor"),
            "chunk_prev": chunk.get("prev"),
            "chunk_next": chunk.get("next"),
            "byte_range": chunk.get("byte_range"),
            "tokens": chunk.get("tokens"),
            "embed_hint": chunk.get("embed_hint"),
            "title": doc.get("title"),
            "author": doc.get("author"),
            "canonical_url": doc.get("canonical_url"),
        },
    )


def _entity_to_text(entity: dict) -> str:
    entity_type = entity.get("type")
    if entity_type == "product":
        price = entity.get("price")
        stock = entity.get("stock")
        parts = [
            entity.get("name", ""),
            f"Brand: {entity['brand']}" if entity.get("brand") else "",
            entity.get("description") or "",
            f"Price: {price['amount']} {price['currency']}" if price else "",
            f"Stock: {stock['status']}" if stock else "",
        ]
        return "\n".join(p for p in parts if p)
    if entity_type == "task":
        desc = entity.get("description")
        return f"{entity.get('title', '')}" + (f"\n{desc}" if desc else "")
    if entity_type == "profile":
        bio = entity.get("bio")
        return f"{entity.get('name', '')}" + (f"\n{bio}" if bio else "")
    if entity_type == "dataset":
        desc = entity.get("description")
        return f"{entity.get('name', '')}" + (f"\n{desc}" if desc else "")
    if entity_type == "conversation":
        return "\n".join(
            f"[{m.get('author')}] {m.get('content')}"
            for m in entity.get("messages", [])
        )
    import json

    return json.dumps(entity)


def _entity_metadata(entity: dict) -> dict:
    # Strip page_content-bound fields; everything else becomes metadata.
    return {
        k: v
        for k, v in entity.items()
        if k not in ("description", "content", "bio")
    }
