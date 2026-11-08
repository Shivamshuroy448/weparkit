"""Request/response schemas (also drive the OpenAPI docs at /docs)."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .models import HAZARD_CATEGORIES


class Open(BaseModel):
    model_config = ConfigDict(extra="allow")


class HealthOut(BaseModel):
    status: Literal["ok"]
    app: str
    mode: str
    vision_detector: str
    gemini_configured: bool
    satellite_source: str
    weather_source: str
    simulated_clock: bool
    time_campus: str
    voice_enabled: bool = False


class LotOut(Open):
    id: int
    slug: str
    name: str
    kind: str
    lat: float
    lng: float
    total_capacity: int
    snow_adjusted_capacity: int
    snow_blocked_spaces: int
    occupied: int
    available: int
    occupancy_pct: float
    confidence: float = Field(ge=0, le=1)
    data_source: str
    last_update: str | None
    capacity_is_seed_estimate: bool


class LotsOut(BaseModel):
    lots: list[LotOut]
    totals: dict
    mode: str
    disclaimer: str


class ScanOut(Open):
    scan_id: int
    lot_id: int
    lot_name: str
    vehicles_detected: int
    estimated_open_spaces: int
    snow_blocked_spaces: int
    plowed_rows: int | None
    unplowed_rows: int | None
    confidence: float
    weather_condition: str
    recommendation: str
    explanation: str
    space_method: str
    detector: str
    annotated_image_url: str
    blurred_image_url: str


class ReportIn(BaseModel):
    lot_id: int
    scan_id: int | None = Field(None, description="Confirm/correct a scan. Omit for a manual report.")
    occupied_spaces: int | None = Field(None, ge=0)
    open_spaces: int | None = Field(None, ge=0)
    snow_blocked_spaces: int | None = Field(None, ge=0)
    occupancy_pct: float | None = Field(None, ge=0, le=100, description="Manual quick report, e.g. 'about 90% full'")
    plowed_rows: int | None = Field(None, ge=0)
    unplowed_rows: int | None = Field(None, ge=0)
    note: str = Field("", max_length=200)
    user_id: int | None = None
    is_demo: bool = False


class LeaveIn(BaseModel):
    lot_id: int
    user_id: int | None = None


class HazardVoteIn(BaseModel):
    user_id: int
    vote: Literal["confirm", "clear"] = "confirm"


class HazardClearIn(BaseModel):
    user_id: int


class AssistIn(BaseModel):
    user_id: int
    lot_id: int | None = None
    location_note: str = Field("", max_length=120)
    action: Literal["request", "respond"] = "request"
    request_id: int | None = None


class ModeIn(BaseModel):
    mode: Literal["standard", "watch", "ice"] | None = Field(None, description="null clears the manual override")


class ProfileIn(BaseModel):
    needs_accessible_routes: bool | None = None
    accepts_assist_requests: bool | None = None


class HazardCategory(BaseModel):
    category: str

    @field_validator("category")
    @classmethod
    def _v(cls, v: str) -> str:
        if v not in HAZARD_CATEGORIES:
            raise ValueError(f"category must be one of {HAZARD_CATEGORIES}")
        return v
