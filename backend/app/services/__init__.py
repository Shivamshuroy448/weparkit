from .vision import gemini as _gemini


def gemini_status() -> bool:
    return _gemini.available()
