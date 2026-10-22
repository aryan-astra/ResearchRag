from scripts.check_secrets import scan


def test_detects_provider_key_without_returning_value():
    candidate = b"sk-" + b"aB3x" * 10
    result = scan(b"line one\n" + candidate)
    assert result == [("provider credential", 2)]
    assert candidate.decode() not in str(result)


def test_detects_private_key_and_env_assignment():
    assert scan(b"-----BEGIN " + b"PRIVATE KEY-----")
    assert scan(b"RESEARCHRAG_LLM_API_KEY=" + b"aB3x" * 10)


def test_empty_and_documented_placeholders_are_safe():
    assert not scan(b'RESEARCHRAG_LLM_API_KEY=\napi_key="test-secret"\n')
    assert not scan(b"RESEARCHRAG_LLM_API_KEY=\nRESEARCHRAG_LLM_MAX_TOKENS=700\n")
