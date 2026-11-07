"""Create tables and load seed data.   python -m scripts.init_db [--reset]"""
import sys

from app.seed import init, reset

if __name__ == "__main__":
    if "--reset" in sys.argv:
        reset()
        print("Database reset and reseeded.")
    else:
        init()
        print("Database initialised (existing data kept).")
