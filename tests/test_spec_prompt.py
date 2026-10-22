"""Prompt formatting must preserve JSON braces and verbatim paper notation."""
from types import SimpleNamespace
from unittest.mock import Mock
from researchrag.config import Settings
from researchrag.spec.generator import SpecGenerator


def test_llm_spec_prompt_preserves_json_and_evidence_braces():
    llm=Mock();llm.chat.return_value=SimpleNamespace(text='{"summary":"Attention method","requirements":[],"open_questions":[]}')
    result=SpecGenerator(Settings(),llm).generate('paper','Title',[('c1','Equation: x_{i} + y',['Methods'],3,'formula')])
    prompt=llm.chat.call_args.args[0][0].content
    assert '"requirements": [' in prompt
    assert 'Equation: x_{i} + y' in prompt
    assert result.summary=='Attention method'
