"""Evidence assembly: retrieved chunks → grounded context package.

Given the final evidence chunks (in reranked order), assemble:

1. **Expanded context** for the LLM: each chunk's text plus its parent
   (section) context, deduplicated and capped at ``evidence_max_tokens``.
   Order: by evidence rank; the parent is prepended to the *first* child
   of that section that appears, so the LLM sees section framing.
2. **Citation records**: one per final chunk with paper / section / page
   range — what the UI renders as the source panel.

Parent-child design (small-to-big): retrieval stays precise on small
chunks; generation gets the surrounding section so methodology questions
are answerable without dumping the whole paper.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass

from researchrag.models.chunk import Chunk
from researchrag.models.retrieval import ClaimProvenance, RetrievedChunk
from researchrag.tokens import get_token_counter

log = logging.getLogger(__name__)


@dataclass
class EvidenceItem:
    citation: ClaimProvenance
    context_text: str
    chunk: Chunk
    parent_text: str | None = None


@dataclass
class EvidencePackage:
    items: list[EvidenceItem]
    total_tokens: int
    assembly_ms: float = 0.0
    truncated: bool = False


class EvidenceAssembler:
    def __init__(
        self,
        max_tokens: int = 4000,
        use_parent_context: bool = True,
        parent_loader=None,
    ):
        self.max_tokens = max_tokens
        self.use_parent_context = use_parent_context
        self.parent_loader = parent_loader  # (parent_id) -> Chunk | None
        self._counter = get_token_counter()

    def assemble(
        self,
        evidence: list[RetrievedChunk],
        paper_title: str | None = None,
    ) -> EvidencePackage:
        t0 = time.perf_counter()
        items: list[EvidenceItem] = []
        truncated = False
        seen_parents: dict[str, str] = {}  # parent_id -> header already emitted
        seen_chunks: set[str] = set()

        for rc in evidence:
            chunk = rc.chunk
            if chunk.id in seen_chunks:
                continue
            seen_chunks.add(chunk.id)

            previous = "\n\n".join(item.context_text for item in items)
            prefix = previous + "\n\n" if previous else ""
            marker = f"[{len(items) + 1}] "
            item_text = marker + chunk.text
            if self._counter.count(prefix + item_text) > self.max_tokens:
                item_text = self._fit(prefix, item_text)
                truncated = True
            if len(item_text.strip()) <= len(marker.strip()):
                break

            parent_text: str | None = None
            if self.use_parent_context and chunk.parent_id:
                parent = (
                    self.parent_loader(chunk.parent_id)
                    if self.parent_loader
                    else None
                )
                if parent is not None:
                    if chunk.parent_id not in seen_parents:
                        header = self._parent_header(parent)
                        expanded = item_text + "\n" + header + "\n" + parent.text
                        fitted = self._fit(prefix, expanded)
                        if len(fitted) > len(item_text) + len(header) + 2:
                            item_text = fitted
                        seen_parents[chunk.parent_id] = header
                        truncated = truncated or len(fitted) < len(expanded)
                    parent_text = parent.text

            items.append(
                EvidenceItem(
                    citation=ClaimProvenance(
                        chunk_id=chunk.id,
                        paper_id=chunk.paper_id,
                        paper_title=paper_title or chunk.paper_title,
                        section=chunk.section_display,
                        page=chunk.page_start
                        if chunk.page_start == chunk.page_end
                        else None,
                        page_range=chunk.pages_display,
                        relevance=rc.rerank_score if rc.rerank_score is not None else rc.rrf_score,
                    ),
                    context_text=item_text,
                    chunk=chunk,
                    parent_text=parent_text,
                )
            )

        total = self._counter.count("\n\n".join(i.context_text for i in items)) if items else 0
        log.info(
            "evidence: %d items, %d tokens (%.0fms, truncated=%s)",
            len(items), total, (time.perf_counter() - t0) * 1000, truncated,
        )
        return EvidencePackage(
            items=items,
            total_tokens=total,
            assembly_ms=(time.perf_counter() - t0) * 1000,
            truncated=truncated,
        )

    @staticmethod
    def _parent_header(parent: Chunk) -> str:
        section = parent.section_display
        return f"[context: {section or 'paper'}]"

    def _fit(self, prefix: str, text: str) -> str:
        if self._counter.count(prefix + text) <= self.max_tokens:
            return text
        low, high = 0, len(text)
        while low < high:
            mid = (low + high + 1) // 2
            if self._counter.count(prefix + text[:mid]) <= self.max_tokens:
                low = mid
            else:
                high = mid - 1
        return text[:low].rstrip()
