"""Prompt templates for grounded answering.

The system prompt enforces the product's epistemic contract:
answers must be grounded in the numbered evidence, must cite evidence
indices, must state what is missing, and must classify confidence.
"""

from __future__ import annotations

import re as _re

SYSTEM_PROMPT = """Answer the question using only the numbered passages from this research paper.
Answer only what was asked. Keep factual lookups to one sentence; use up to three short paragraphs for explanations. Omit unrelated background. Cite each factual claim with its passage number, for example: "The base model has six layers [1]."
Do not repeat sentences. Do not invent missing details. If the passages do not answer the question, say "The retrieved passages do not specify this."
End with these two lines, choosing one value on each line:
CONFIDENCE: explicit | strongly_inferred | weakly_inferred | external | unknown
SUFFICIENCY: sufficient | partial | insufficient
Use explicit only for claims directly stated in a cited passage; use unknown and insufficient when the answer is missing.

Passages:
{evidence}
"""

USER_PROMPT = "Question: {question}"

_CONF_RE = _re.compile(
    r"CONFIDENCE\s*:\s*(explicit|strongly_inferred|weakly_inferred|external|unknown)",
    _re.IGNORECASE,
)
_SUFF_RE = _re.compile(
    r"SUFFICIENCY\s*:\s*(sufficient|partial|insufficient)", _re.IGNORECASE
)


def strip_markers(text: str) -> tuple[str, str | None, str | None]:
    """Remove the trailing classification lines; return (clean, conf, suff)."""
    conf_m = _CONF_RE.search(text)
    suff_m = _SUFF_RE.search(text)
    clean = _re.sub(r"(?im)^\s*(?:CONFIDENCE|SUFFICIENCY)\s*:[^\n]*(?:\n|$)", "", text)
    clean = _CONF_RE.sub("", clean)
    clean = _SUFF_RE.sub("", clean)
    clean = clean.strip()
    conf = conf_m.group(1).lower() if conf_m else None
    suff = suff_m.group(1).lower() if suff_m else None
    return clean, conf, suff
