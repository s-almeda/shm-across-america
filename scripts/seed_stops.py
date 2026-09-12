"""Seed the planned route.

These nineteen stops are the plan, not the trip -- they get orange pins with a
hover label and no route line between them. Safe to run more than once: a stop
is matched by name, so re-running adds only what's missing and leaves any
coordinate you've since corrected (or any stop you've hidden) alone.

    source venv/bin/activate
    python -m scripts.seed_stops
"""

import os
import sys

from dotenv import load_dotenv

load_dotenv()

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from trip import create_app  # noqa: E402
from trip.db import get_db  # noqa: E402

# In travel order, west to east. Coordinates are town centres -- good enough
# for a pin on a paper map; edit any of them in the admin dashboard.
STOPS = [
    ("Berkeley, CA", 37.8715, -122.2730),
    ("Reno, NV", 39.5296, -119.8138),
    ("Winnemucca, NV", 40.9730, -117.7357),
    ("Elko, NV", 40.8324, -115.7631),
    ("Salt Lake City, UT", 40.7608, -111.8910),
    ("Point of Rocks, WY", 41.6797, -108.7793),
    ("Laramie, WY", 41.3114, -105.5911),
    ("Wellington, CO", 40.7033, -105.0083),
    ("Lemoyne, NE", 41.2617, -101.8177),
    ("Broken Bow, NE", 41.4022, -99.6382),
    ("Omaha, NE", 41.2565, -95.9345),
    ("Des Moines, IA", 41.5868, -93.6250),
    ("Walcott, IA", 41.5917, -90.7690),
    ("Geneseo, IL", 41.4478, -90.1526),
    ("Urbana-Champaign, IL", 40.1106, -88.2073),
    ("Rushville, IN", 39.6092, -85.4464),
    ("Columbus, OH", 39.9612, -82.9988),
    ("Punxsutawney, PA", 40.9437, -78.9711),
    ("New Milford, NJ", 40.9351, -74.0199),
]


def main():
    app = create_app()
    with app.app_context():
        db = get_db()
        existing = {
            row["name"] for row in db.execute("SELECT name FROM planned_stops").fetchall()
        }
        added = 0
        for name, lat, lng in STOPS:
            if name in existing:
                print(f"  skip  {name} (already there)")
                continue
            db.execute(
                "INSERT INTO planned_stops (name, lat, lng, hidden) VALUES (?, ?, ?, 0)",
                (name, lat, lng),
            )
            added += 1
            print(f"  add   {name}")
        db.commit()

    total = len(existing) + added
    print(f"\nAdded {added} stop(s); {total} planned stops on the map.")


if __name__ == "__main__":
    main()
