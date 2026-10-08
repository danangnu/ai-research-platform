"""Restricted research export. CSV cells are escaped; JSON preserves raw responses."""

import csv
import io
import json
import zipfile
from sqlalchemy import select
from app.models import Participant
from app.models.study_workflow import StudyObservation
from app.models.study_preparation import (
    PreparedConfiguration,
    PreparedRun,
    PreparedObservation,
)


def package(db, timestamp):
    # Materialize source records before serialization. All research rows, no UI filters.
    participants = db.scalars(select(Participant)).all()
    configurations = db.scalars(select(PreparedConfiguration)).all()
    runs = db.scalars(select(PreparedRun)).all()
    prepared = db.scalars(select(PreparedObservation)).all()
    legacy = db.scalars(select(StudyObservation)).all()
    pmap = {p.id: p for p in participants}
    cmap = {c.id: c for c in configurations}
    rmap = {r.id: r for r in runs}
    run_by_p = {r.participant_id: r for r in runs}
    tables = {"participants": [], "assessments": [], "responses": [], "sessions": []}
    raw = []
    from app.api.study_workflow import FORMS, VERSION, _score

    for p in participants:
        r = run_by_p.get(p.id)
        tables["participants"].append(
            dict(
                participant_code=p.participant_code,
                condition=p.study_group,
                lifecycle=p.lifecycle_status,
                workflow="prepared" if r else "legacy",
                configuration_version=cmap[r.configuration_id].version
                if r
                else VERSION,
                started_at=r.started_at.isoformat() if r and r.started_at else None,
            )
        )
    for row in prepared + legacy:
        is_new = isinstance(row, PreparedObservation)
        run = rmap[row.run_id] if is_new else None
        p = pmap[run.participant_id if run else row.participant_id]
        config = cmap[run.configuration_id] if run else None
        base = dict(
            participant_code=p.participant_code,
            condition=p.study_group,
            workflow="prepared" if is_new else "legacy",
            configuration_version=config.version if config else row.instrument_version,
            observation_id=row.id,
            stage=row.stage,
            recorded_at=row.created_at.isoformat(),
        )
        raw.append(
            base
            | {
                "payload": row.payload,
                "score": row.score
                if is_new
                else (_score(row) if row.stage in FORMS else None),
            }
        )
        if row.stage.startswith("session-"):
            tables["sessions"].append(base | row.payload)
            continue
        form = config.definition["forms"][row.stage] if is_new else None
        score = row.score if is_new else _score(row)
        tables["assessments"].append(
            base
            | dict(
                instrument_version=form["instrument_version"] if form else VERSION,
                score=score.get("value")
                if is_new and score
                else score.get("correct")
                if score
                else None,
                minimum=score.get("minimum")
                if is_new and score
                else 0
                if score
                else None,
                maximum=score.get("maximum")
                if is_new and score
                else 4
                if score
                else None,
                skipped=score.get("skipped") if score else None,
                scale_id=score.get("scale_id")
                if is_new and score
                else "legacy-four-item"
                if score
                else "",
            )
        )
        if is_new:
            for q in form["items"]:
                value = row.payload["answers"][q["id"]]
                option = next((o for o in q["options"] if o["value"] == value), None)
                tables["responses"].append(
                    base
                    | dict(
                        item_id=q["id"],
                        prompt=q["prompt"],
                        answer=value,
                        answer_label=option["label"] if option else None,
                        points=option["points"] if option else None,
                        missing_reason="skipped" if value is None else "",
                        instrument_version=form["instrument_version"],
                    )
                )
        else:
            for i, (question, choices, correct) in enumerate(FORMS[row.stage]):
                value = row.payload["answers"][i]
                tables["responses"].append(
                    base
                    | dict(
                        item_id=f"item-{i + 1}",
                        prompt=question,
                        answer=value,
                        answer_label=choices[value],
                        points=int(value == correct),
                        missing_reason="skipped" if value == 2 else "",
                        instrument_version=VERSION,
                    )
                )
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, rows in tables.items():
            fields = list(dict.fromkeys(key for row in rows for key in row)) or [
                "participant_code"
            ]
            buffer = io.StringIO(newline="")
            writer = csv.DictWriter(buffer, fieldnames=fields)
            writer.writeheader()
            for row in rows:
                writer.writerow(
                    {
                        k: (
                            "'" + v
                            if isinstance(v, str)
                            and v.lstrip().startswith(("=", "+", "-", "@", "\t", "\r"))
                            else v
                        )
                        for k, v in row.items()
                    }
                )
            archive.writestr(name + ".csv", buffer.getvalue().encode("utf-8-sig"))
        archive.writestr(
            "source_records.json", json.dumps(raw, ensure_ascii=False, indent=2)
        )
        archive.writestr(
            "configurations.json",
            json.dumps(
                [
                    dict(
                        version=c.version,
                        definition_hash=c.definition_hash,
                        definition=c.definition,
                    )
                    for c in configurations
                ],
                indent=2,
            ),
        )
        archive.writestr(
            "legacy_forms.json",
            json.dumps(
                {"version": VERSION, "forms": FORMS}, ensure_ascii=False, indent=2
            ),
        )
        archive.writestr(
            "manifest.json",
            json.dumps(
                {
                    "exported_at": timestamp,
                    "synthetic_only": True,
                    "row_counts": {k: len(v) for k, v in tables.items()},
                    "scope": "All persisted study observations and enrolled participant codes; no recruitment identity, credentials, or audit table. No dashboard filters applied.",
                    "consistency": "Single database read transaction; exports should be taken while demo editing is paused. Not a disaster-recovery database backup.",
                },
                indent=2,
            ),
        )
        archive.writestr(
            "DATA_DICTIONARY.txt",
            """All timestamps are UTC (SQLite may omit the +00:00 suffix). Blank CSV cells represent absent/unscored values, never improvement or zero. Missing assessments have no assessment row: join to participants.csv to find missing visits.
participant_code: pseudonymous join key. condition: stored allocation name. workflow: legacy or prepared; analyze separately. configuration_version: immutable form/schedule version. observation_id: source record identifier. stage: questionnaire, pre, post, or session-N. recorded_at: server save time. started_at: staff-started intervention clock.
responses.csv: one row per item; answer is saved code/text/number; answer_label is a selected choice's wording; points is its configured weight; missing_reason is skipped where explicitly omitted. Unscored items have no points. Prepared incomplete scored forms have a blank total. Legacy skip behavior is preserved (skips score zero); do not pool workflows.
assessments.csv: instrument_version, total score, minimum/maximum possible score, skipped count and scale_id. Matching scale identifiers/ranges only permits arithmetic; clinical comparability still requires review.
sessions.csv: minutes are self-reported, assistance is none/some/substantial, comfort is comfortable/tiring/upsetting/prefer_not_to_say. Session logs are not captured bot dialogue or evidence of model training.
configurations.json contains frozen form definitions and scoring weights. source_records.json preserves exact raw responses, including free text. CSV text that could act as a spreadsheet formula is prefixed with an apostrophe; JSON retains original text. Free text may contain identifiers: restrict exports and review before sharing. Names/emails and account identifiers are excluded, but coded records are not anonymous.
""",
        )
    return output.getvalue(), {k: len(v) for k, v in tables.items()}
