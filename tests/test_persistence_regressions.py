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
        db.insert_spec(ImplementationSpec(
            id=spec_id, paper_id="paper", title=spec_id,
            requirements=[SpecRequirement(
                id="REQ-001", requirement="Use attention", type=RequirementType.MODEL,
            )],
        ))
    update_requirement("spec_a", "REQ-001", "accepted", notes, SimpleNamespace(db=db))
    assert db.get_spec("spec_a")["requirements"][0]["status"] == "accepted"
    untouched = db.get_spec("spec_b")["requirements"][0]
    assert untouched["status"] == "open"
    assert untouched["notes"] == ""
