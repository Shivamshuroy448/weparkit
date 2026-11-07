"""Central configuration. Every value can be overridden via environment variables (.env)."""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(BASE_DIR / ".env"), extra="ignore")

    app_name: str = "IceStation UB"
    database_url: str = f"sqlite:///{(DATA_DIR / 'icestation.db').as_posix()}"
    cors_origins: str = "http://localhost:8081,http://127.0.0.1:8081"  # Expo web; native apps ignore CORS
    # Expo web opened from another device on the LAN (e.g. http://192.168.1.20:8081). Private ranges only.
    cors_origin_regex: str = (r"^https?://(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+"
                              r"|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$")

    # --- Vision -------------------------------------------------------------
    # auto = YOLOv8 if ultralytics + weights load, else OpenCV heuristic detector.
    # Gemini (if a key is set) is layered on top for snow/plowing/space judgement.
    # Options: auto | yolo | opencv
    vision_provider: str = "auto"
    yolo_weights: str = "yolov8n.pt"
    yolo_confidence: float = 0.25
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"

    # --- Satellite / weather ------------------------------------------------
    satellite_live_enabled: bool = True
    goes_sector_url: str = "https://cdn.star.nesdis.noaa.gov/GOES19/ABI/SECTOR/ne/13/"
    goes_image_size: str = "600x600"
    # Pixel position of UB North Campus in the GOES sector image + approximate scale.
    # Defaults are rough guesses for the 600x600 Northeast sector: calibrate before trusting ETAs.
    buffalo_px_x: int = 230
    buffalo_px_y: int = 330
    km_per_px: float = 2.0
    nws_user_agent: str = "IceStationUB/1.0 (hackathon prototype; contact@example.com)"
    nws_point_lat: float = 43.0008
    nws_point_lon: float = -78.7890
    nws_station: str = "KBUF"
    weather_live_enabled: bool = True
    external_timeout_s: float = 4.0

    # --- Decision thresholds -----------------------------------------------
    ice_arrival_threshold_min: int = 60
    ice_capacity_reduction_default: float = 0.18   # used when a lot has no snow scan data
    ice_departure_buffer_min: int = 12
    ice_search_time_multiplier: float = 1.5

    # --- Expiry -------------------------------------------------------------
    parking_report_ttl_min: int = 30
    ice_hazard_ttl_hours: float = 6.0
    other_hazard_ttl_hours: float = 4.0
    ramp_hazard_ttl_hours: float = 12.0
    leaving_notice_ttl_min: int = 10

    # --- Recommendation -----------------------------------------------------
    walk_speed_m_per_min: float = 80.0
    ice_walk_speed_m_per_min: float = 60.0
    walk_detour_factor: float = 1.3
    default_drive_minutes: int = 15
    campus_timezone: str = "America/New_York"
    # Optional HH:MM. When set, the occupancy model and recommendations run as if it were
    # this time of day (handy for demos at 2 AM). Shown in the UI as SIMULATED CLOCK.
    sim_clock: str = ""

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
