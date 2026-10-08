from typing import Literal
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictBool,
    StrictFloat,
    StrictInt,
    StrictStr,
    model_validator,
)


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class Option(StrictModel):
    value: str = Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$")
    label: str = Field(min_length=1, max_length=500)
    points: StrictInt | None = Field(default=None, ge=0, le=100)


class Item(StrictModel):
    id: str = Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$")
    prompt: str = Field(min_length=1, max_length=2000)
    kind: Literal["choice", "text", "number"] = "choice"
    required: StrictBool = True
    options: list[Option] = Field(default_factory=list, max_length=30)
    minimum: StrictFloat | StrictInt | None = None
    maximum: StrictFloat | StrictInt | None = None

    @model_validator(mode="after")
    def valid(self):
        if self.kind == "choice" and (
            len(self.options) < 2
            or len({o.value for o in self.options}) != len(self.options)
        ):
            raise ValueError(
                "Choice items require at least two uniquely identified options."
            )
        if self.kind != "choice" and self.options:
            raise ValueError("Only choice items have options.")
        if self.kind != "number" and (
            self.minimum is not None or self.maximum is not None
        ):
            raise ValueError("Only number items have bounds.")
        if (
            self.minimum is not None
            and self.maximum is not None
            and self.minimum > self.maximum
        ):
            raise ValueError("Minimum cannot exceed maximum.")
        return self


class Form(StrictModel):
    title: str = Field(min_length=1, max_length=200)
    instrument_version: str = Field(min_length=1, max_length=64)
    instructions: str = Field(default="", max_length=3000)
    scoring: Literal["none", "sum_choice"] = "none"
    scale_id: str = Field(default="", max_length=100)
    items: list[Item] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def valid(self):
        if len({q.id for q in self.items}) != len(self.items):
            raise ValueError("Item identifiers must be unique within a form.")
        if self.scoring == "sum_choice":
            if not self.scale_id.strip():
                raise ValueError("Scored forms need a scale identifier.")
            if any(
                q.kind != "choice" or any(o.points is None for o in q.options)
                for q in self.items
            ):
                raise ValueError(
                    "Sum scoring requires explicit points on every choice option."
                )
        elif any(o.points is not None for q in self.items for o in q.options):
            raise ValueError("Unscored forms must not contain scoring weights.")
        return self


class Schedule(StrictModel):
    duration_days: StrictInt = Field(default=90, ge=1, le=365)
    sessions_per_week: StrictInt = Field(default=3, ge=1, le=7)
    suggested_minutes_min: StrictInt = Field(default=5, ge=1, le=180)
    suggested_minutes_max: StrictInt = Field(default=10, ge=1, le=180)
    interim_day: StrictInt | None = Field(default=45, ge=1, le=364)

    @model_validator(mode="after")
    def valid(self):
        if self.suggested_minutes_max < self.suggested_minutes_min:
            raise ValueError("Maximum session duration is below minimum.")
        if self.interim_day is not None and self.interim_day >= self.duration_days:
            raise ValueError("Interim visit must precede the final visit.")
        return self


class Configuration(StrictModel):
    version: str = Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9._-]+$")
    title: str = Field(min_length=1, max_length=200)
    population_note: str = Field(
        default="Pending study-team confirmation", max_length=1000
    )
    interaction_note: str = Field(
        default="Pending definition of participant interaction", max_length=2000
    )
    schedule: Schedule = Field(default_factory=Schedule)
    forms: dict[Literal["questionnaire", "pre", "post"], Form]
    synthetic_only: Literal[True] = True

    @model_validator(mode="after")
    def valid(self):
        if set(self.forms) != {"questionnaire", "pre", "post"}:
            raise ValueError(
                "Define questionnaire, pre and post forms, even while empty."
            )
        if self.forms["questionnaire"].scoring != "none":
            raise ValueError("The background questionnaire is not a cognitive score.")
        return self


class Assignment(StrictModel):
    configuration_id: str
    confirmed_synthetic: Literal[True]


class Submission(StrictModel):
    configuration_id: str
    confirmed_synthetic: Literal[True]
    answers: dict[str, StrictStr | StrictInt | StrictFloat | None] | None = None
    minutes: StrictInt | None = Field(default=None, ge=1, le=180)
    assistance: Literal["none", "some", "substantial"] | None = None
    comfort: (
        Literal["comfortable", "tiring", "upsetting", "prefer_not_to_say"] | None
    ) = None
