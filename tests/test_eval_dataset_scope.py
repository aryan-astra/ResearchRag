import json

from researchrag.config import Settings
from researchrag.evaluation.service import list_datasets


def test_datasets_are_scoped_to_their_source_pdf(tmp_path):
    (tmp_path / "specific.json").write_text(json.dumps({"paper_sha256": "rag-sha"}))
    (tmp_path / "custom.json").write_text("{}")
    settings = Settings(evals_dir=tmp_path)
    assert list_datasets(settings, "other-sha") == ["custom.json"]
    assert list_datasets(settings, "rag-sha") == ["custom.json", "specific.json"]
