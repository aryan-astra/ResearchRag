"""Unusable generated answers must never be presented as grounded conclusions."""
from types import SimpleNamespace
from unittest.mock import Mock
import pytest
from researchrag.answering.pipeline import AnsweringPipeline
from researchrag.config import Settings
from researchrag.evidence import EvidenceAssembler
from researchrag.models.chunk import Chunk
from researchrag.models.retrieval import RetrievedChunk
from researchrag.llm.base import LLMResponse


def pipeline(text,finish=None):
    chunk=Chunk(id='c',paper_id='p',kind='child',text='The base model uses six encoder layers.',page_start=3,page_end=3)
    package=EvidenceAssembler(use_parent_context=False).assemble([RetrievedChunk(chunk=chunk)])
    llm=Mock();llm.chat.return_value=LLMResponse(text=text,model='test',finish_reason=finish)
    return AnsweringPipeline(Settings(),Mock(),llm),package


@pytest.mark.parametrize('text,finish', [('Uncited assertion.',None),('An invented source [9].',None),('Six layers [1].','length')])
def test_uncited_invalid_and_incomplete_answers_fall_back_to_excerpts(text,finish):
    answerer,package=pipeline(text,finish)
    result=answerer._llm_answer('How many encoder layers?',package,None)
    assert result.mode=='extractive'
    assert 'six' in result.answer
    assert 'source excerpts' in result.answer


def test_a_cited_complete_answer_stays_generative():
    answerer,package=pipeline('Six encoder layers [1].\nCONFIDENCE: explicit\nSUFFICIENCY: sufficient')
    result=answerer._llm_answer('How many encoder layers?',package,None)
    assert result.mode=='generative'
    assert result.answer=='Six encoder layers [1].'


def test_unknown_classification_text_is_hidden_without_inventing_confidence():
    from researchrag.answering.prompts import strip_markers
    clean,confidence,sufficiency=strip_markers('A sourced answer [1].\nCONFIDENCE: strong_inferred\nSUFFICIENCY: sufficient')
    assert clean=='A sourced answer [1].'
    assert confidence is None
    assert sufficiency=='sufficient'


def test_bold_metadata_is_parsed_and_removed():
    from researchrag.answering.prompts import strip_markers
    clean,confidence,sufficiency=strip_markers('An answer [1].\n**Confidence:** weakly_inferred\n**SUFFICIENCY:** insufficient')
    assert clean=='An answer [1].'
    assert confidence=='weakly_inferred'
    assert sufficiency=='insufficient'


def test_model_admitted_weak_answers_fall_back_to_sources():
    answerer,package=pipeline('Six layers [1].\n**Confidence:** weakly_inferred\n**SUFFICIENCY:** insufficient')
    assert answerer._llm_answer('How many layers?',package,None).mode=='extractive'
