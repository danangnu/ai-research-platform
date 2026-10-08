"""Synthetic software fixtures, not clinical instruments."""

import copy, csv, io, json, uuid, zipfile
from datetime import datetime, timedelta, timezone
from sqlalchemy import select
from app.api import study_preparation as module
from app.core.config import settings
from app.core.security import create_access_token
from app.db.session import SessionLocal
from app.models import User, Role
from test_study_workflow import enrolled, send as legacy_send

ROOT = "/api/study-preparation"


def specification():
    item = dict(
        id="fixture",
        prompt="Fictional choice",
        kind="choice",
        required=False,
        options=[
            dict(value="a", label="Fixture A", points=0),
            dict(value="b", label="Fixture B", points=2),
        ],
    )
    form = dict(
        title="Fixture assessment",
        instrument_version="fixture-v1",
        scoring="sum_choice",
        scale_id="fixture-scale",
        items=[item],
    )
    return dict(
        version="fixture-" + uuid.uuid4().hex,
        title="Fictional walkthrough",
        synthetic_only=True,
        forms={
            "questionnaire": dict(
                title="Background",
                instrument_version="fixture-v1",
                items=[dict(id="note", prompt="Fictional note", kind="text")],
            ),
            "pre": copy.deepcopy(form),
            "post": copy.deepcopy(form),
        },
    )


def config(client, h, spec=None):
    r = client.post(ROOT + "/configurations", headers=h, json=spec or specification())
    assert r.status_code == 201, r.text
    return r.json()["id"]


def assign(client, h, p, c):
    return client.post(
        ROOT + "/runs/" + p["id"],
        headers=h,
        json={"configuration_id": c, "confirmed_synthetic": True},
    )


def send(client, h, c, stage, **payload):
    return client.post(
        ROOT + "/me/" + stage,
        headers=h,
        json={"configuration_id": c, "confirmed_synthetic": True, **payload},
    )


def test_schedule_scores_export(client, auth_headers, monkeypatch):
    start = datetime(2026, 10, 5, 12, tzinfo=timezone.utc)
    monkeypatch.setattr(module, "now", lambda: start)
    p, h = enrolled(client, auth_headers, allocate=False)
    c = config(client, auth_headers)
    assert assign(client, auth_headers, p, c).status_code == 200
    assert assign(client, auth_headers, p, c).json()["duplicate"]
    state = client.get(ROOT + "/me", headers=h).json()
    assert state["next_stage"] == "questionnaire"
    assert "points" not in json.dumps(state) and "scores" not in state
    assert (
        client.post(
            ROOT + "/runs/" + p["id"] + "/start", headers=auth_headers
        ).status_code
        == 409
    )
    assert (
        send(client, h, c, "questionnaire", answers={"note": "=SUM(1,2)"}).status_code
        == 200
    )
    assert send(client, h, c, "pre", answers={"fixture": "a"}).status_code == 200
    assert client.get(ROOT + "/me", headers=h).json()["next_stage"] == "allocation"
    assert client.post(
        "/api/participants/" + p["id"] + "/allocate", headers=auth_headers
    ).status_code in (200, 201)
    assert (
        client.post(
            ROOT + "/runs/" + p["id"] + "/start", headers=auth_headers
        ).status_code
        == 200
    )
    assert client.post(
        ROOT + "/runs/" + p["id"] + "/start", headers=auth_headers
    ).json()["duplicate"]
    log = dict(minutes=7, assistance="none", comfort="comfortable")
    assert send(client, h, c, "session-1", **log).status_code == 200
    assert send(client, h, c, "session-1", **log).json()["duplicate"]
    assert send(client, h, c, "session-2", **log).status_code == 409
    assert send(client, h, c, "post", answers={"fixture": "b"}).status_code == 409
    monkeypatch.setattr(module, "now", lambda: start + timedelta(days=1))
    assert client.get(ROOT + "/me", headers=h).json()["next_stage"] == "session-2"
    monkeypatch.setattr(module, "now", lambda: start + timedelta(days=90))
    assert client.get(ROOT + "/me", headers=h).json()["next_stage"] == "post"
    assert send(client, h, c, "post", answers={"fixture": "b"}).status_code == 200
    row = next(
        r
        for r in client.get(ROOT + "/dashboard", headers=auth_headers).json()[
            "participants"
        ]
        if r["participant_id"] == p["id"]
    )
    assert (
        row["paired_change"] == 2
        and row["session_count"] == 1
        and row["reported_minutes"] == 7
    )
    assert not any(
        r["participant_id"] == p["id"]
        for r in client.get(
            "/api/study-workflow/dashboard", headers=auth_headers
        ).json()["participants"]
    )
    assert legacy_send(client, h, "pre", answers=[0, 0, 0, 0]).status_code == 409
    export = client.get(ROOT + "/export", headers=auth_headers)
    assert export.status_code == 200 and export.headers["cache-control"] == "no-store"
    with zipfile.ZipFile(io.BytesIO(export.content)) as z:
        raw = json.loads(z.read("source_records.json"))
        assert any(
            r["payload"]["answers"].get("note") == "=SUM(1,2)"
            for r in raw
            if isinstance(r["payload"].get("answers"), dict)
        )
        rows = list(
            csv.DictReader(io.StringIO(z.read("responses.csv").decode("utf-8-sig")))
        )
        assert (
            next(
                r
                for r in rows
                if r["participant_code"] == p["participant_code"]
                and r["item_id"] == "note"
            )["answer"]
            == "'=SUM(1,2)"
        )
        assert all("email" not in r and "full_name" not in r for r in rows)
        assert json.loads(z.read("manifest.json"))["row_counts"]["responses"] == len(
            rows
        )
        assert "DATA_DICTIONARY.txt" in z.namelist()


def test_versions_validation_and_legacy(client, auth_headers):
    spec = specification()
    c = config(client, auth_headers, spec)
    assert (
        client.post(
            ROOT + "/configurations", headers=auth_headers, json=spec
        ).status_code
        == 409
    )
    assert client.patch(
        ROOT + "/configurations/" + c, headers=auth_headers, json=spec
    ).status_code in (404, 405)
    empty = specification()
    empty["forms"]["post"]["items"] = []
    draft = config(client, auth_headers, empty)
    p, h = enrolled(client, auth_headers)
    assert assign(client, auth_headers, p, draft).status_code == 409
    assert assign(client, auth_headers, p, c).status_code == 200
    assert (
        assign(client, auth_headers, p, config(client, auth_headers)).status_code == 409
    )
    for answers in ({}, {"wrong": "a"}, {"note": True}, {"note": ""}):
        assert send(client, h, c, "questionnaire", answers=answers).status_code == 422
    assert (
        send(
            client, h, c, "questionnaire", answers={"note": "fixture"}, minutes=5
        ).status_code
        == 422
    )
    assert (
        send(client, h, c, "questionnaire", answers={"note": "fixture"}).status_code
        == 200
    )
    assert (
        send(client, h, c, "questionnaire", answers={"note": "changed"}).status_code
        == 409
    )
    assert send(client, h, c, "pre", answers={"fixture": True}).status_code == 422
    assert send(client, h, c, "pre", answers={"fixture": None}).status_code == 200
    row = next(
        r
        for r in client.get(ROOT + "/dashboard", headers=auth_headers).json()[
            "participants"
        ]
        if r["participant_id"] == p["id"]
    )
    assert (
        row["scores"]["pre"]["value"] is None and row["scores"]["pre"]["skipped"] == 1
    )
    old, oldh = enrolled(client, auth_headers)
    assert legacy_send(client, oldh, "pre", answers=[0, 0, 0, 0]).status_code == 200
    assert assign(client, auth_headers, old, c).status_code == 409
    assert client.get(ROOT + "/me", headers=oldh).json() == {"assigned": False}
    bad = specification()
    bad["forms"]["pre"]["items"][0]["options"][0]["points"] = None
    assert (
        client.post(
            ROOT + "/configurations", headers=auth_headers, json=bad
        ).status_code
        == 422
    )
    bad = specification()
    bad["schedule"] = {"duration_days": 10, "interim_day": 45}
    assert (
        client.post(
            ROOT + "/configurations", headers=auth_headers, json=bad
        ).status_code
        == 422
    )


def role_headers(role):
    with SessionLocal() as db:
        u = User(
            email=uuid.uuid4().hex + "@example.com",
            full_name="Fixture",
            password_hash="unused",
            is_active=True,
        )
        u.roles = [db.scalar(select(Role).where(Role.name == role))]
        db.add(u)
        db.commit()
        return {"Authorization": "Bearer " + create_access_token(u.id)}


def test_access_and_demoonly(client, auth_headers, participant_headers, monkeypatch):
    engineer = role_headers("AI_ML_RESEARCH_ENGINEER")
    assistant = role_headers("RESEARCH_ASSISTANT")
    for path in ("/configurations", "/dashboard", "/export"):
        assert client.get(ROOT + path).status_code == 401
        assert client.get(ROOT + path, headers=participant_headers).status_code == 403
        assert client.get(ROOT + path, headers=engineer).status_code == 403
        assert client.get(ROOT + path, headers=assistant).status_code == 200
    assert (
        client.post(
            ROOT + "/configurations", headers=assistant, json=specification()
        ).status_code
        == 403
    )
    assert (
        client.post(
            ROOT + "/runs/invalid",
            headers=assistant,
            json={"configuration_id": "invalid", "confirmed_synthetic": True},
        ).status_code
        == 403
    )
    assert (
        client.post(ROOT + "/runs/invalid/start", headers=assistant).status_code == 403
    )
    assert client.get(ROOT + "/me", headers=auth_headers).status_code == 403
    monkeypatch.setattr(settings, "demo_mode", False)
    for path in ("/configurations", "/dashboard", "/export"):
        assert client.get(ROOT + path, headers=auth_headers).status_code == 403
    assert (
        client.post(
            ROOT + "/configurations", headers=auth_headers, json=specification()
        ).status_code
        == 403
    )
