"""Regressions for changes that must stay scoped to one paper or specification."""

from types import SimpleNamespace

import pytest

from researchrag.api.routes.specs import update_requirement
from researchrag.models.retrieval import ImplementationSpec, RequirementType, SpecRequirement
from researchrag.storage.database import Database


@pytest.mark.parametrize("notes", [None, "Reviewed against the paper"])
def test_requirement_update_only_changes_requested_spec(tmp_path, notes):
    db = Database(tmp_path / "state.db")
    for spec_id in ("spec_a", "spec_b"):
        db.insert_spec(
            ImplementationSpec(
                id=spec_id,
                paper_id="paper",
                title=spec_id,
                requirements=[
                    SpecRequirement(
                        id="REQ-001",
                        requirement="Use attention",
                        type=RequirementType.MODEL,
                    )
                ],
            )
        )
    update_requirement("spec_a", "REQ-001", "accepted", notes, SimpleNamespace(db=db))
    assert db.get_spec("spec_a")["requirements"][0]["status"] == "accepted"
    untouched = db.get_spec("spec_b")["requirements"][0]
    assert untouched["status"] == "open"
    assert untouched["notes"] == ""


def test_deleting_paper_removes_experiments_and_job_results_only_for_that_paper(tmp_path):
    from researchrag.storage.database import now_iso

    db = Database(tmp_path / "state.db")
    for paper in ["one", "two"]:
        job = db.create_job(paper, "ingest")
        db.kv_set("job_result:" + job, "result")
        db.execute(
            "INSERT INTO experiments (id,paper_id,name,kind,config_json,results_json,created_at) VALUES (?,?,?,?,?,?,?)",
            (paper, paper, "test", "retrieval", "{}", "{}", now_iso()),
        )
    db.delete_paper("one")
    assert len(db.query("SELECT * FROM experiments")) == 1
    assert db.query("SELECT * FROM experiments")[0]["paper_id"] == "two"
    assert len(db.query("SELECT * FROM kv")) == 1


def test_remove_paper_cleans_managed_upload_but_preserves_external_source(tmp_path):
    from unittest.mock import Mock

    from researchrag.config import Settings
    from researchrag.ingestion.pipeline import IngestionPipeline

    uploads = tmp_path / "uploads" / "one"
    uploads.mkdir(parents=True)
    (uploads / "paper.pdf").write_bytes(b"PDF")
    external = tmp_path / "original.pdf"
    external.write_bytes(b"PDF")
    settings = Settings(data_dir=tmp_path)
    pipeline = IngestionPipeline(settings, Mock(), Mock(), Mock(), Mock(), Mock())
    pipeline.remove_paper("one")
    assert not uploads.exists()
    assert external.exists()


def test_restart_marks_only_unfinished_jobs_as_failed(tmp_path):
    db = Database(tmp_path / "state.db")
    pending = db.create_job("paper", "ingest")
    done = db.create_job("paper", "evaluate")
    db.update_job(done, status="done", progress=1)
    db.recover_interrupted_jobs()
    assert db.get_job(pending)["status"] == "failed"
    assert "restarted" in db.get_job(pending)["error"]
    assert db.get_job(done)["status"] == "done"
