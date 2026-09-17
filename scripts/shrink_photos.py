"""Shrink photos uploaded before the upload pipeline started optimising them.

Runs the same optimise step new uploads get, over photos already on disk.
Re-encoding renames a file to .jpg, so the photos row has to move with it --
doing the files alone would leave every image 404ing.

Dry run first (touches nothing), then apply:

    source venv/bin/activate
    python -m scripts.shrink_photos
    python -m scripts.shrink_photos --apply

Safe to run more than once: anything already small enough and correctly
encoded is skipped, so repeat runs don't re-compress (and re-degrade) work
from a previous run. Only files referenced by the photos table are touched --
anything else in uploads/ is left alone.

Originals are copied to backups/photos-<timestamp>/ before anything changes.
If a run goes wrong, copy them back and restore trip.db from backups/.
"""

import os
import shutil
import sys
from datetime import datetime

from dotenv import load_dotenv

load_dotenv()

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from PIL import Image  # noqa: E402

from trip import create_app  # noqa: E402
from trip.db import get_db  # noqa: E402
from trip.media import MAX_IMAGE_EDGE, optimize_image  # noqa: E402

# Below this, the bytes saved aren't worth a re-encode's quality loss.
SKIP_UNDER_BYTES = 400 * 1024


def needs_work(path):
    """A file is already done when it's a JPEG inside the size cap."""
    if os.path.getsize(path) <= SKIP_UNDER_BYTES:
        return False
    try:
        with Image.open(path) as im:
            if getattr(im, "n_frames", 1) > 1:
                return False  # animated, leave it
            return im.format != "JPEG" or max(im.size) > MAX_IMAGE_EDGE
    except Exception:
        return False  # unreadable: optimize_image would skip it anyway


def main():
    apply = "--apply" in sys.argv

    app = create_app()
    upload_dir = os.path.abspath(app.config["UPLOAD_DIR"])

    with app.app_context():
        db = get_db()
        rows = db.execute("SELECT id, file_path FROM photos ORDER BY id").fetchall()

        todo = []
        for row in rows:
            path = os.path.join(upload_dir, row["file_path"])
            if not os.path.exists(path):
                print(f"  missing  {row['file_path']}")
                continue
            if needs_work(path):
                todo.append((row["id"], row["file_path"], os.path.getsize(path)))
            else:
                print(f"  skip     {row['file_path']}")

        if not todo:
            print("\nNothing to do -- every photo is already optimised.")
            return

        print(f"\n{len(todo)} photo(s) to shrink:")
        for _, name, size in todo:
            print(f"  {name}  {size / 1024:.0f} KB")

        if not apply:
            print("\nDry run. Re-run with --apply to actually do it.")
            return

        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        backup_dir = os.path.join(os.path.dirname(upload_dir), "backups", f"photos-{stamp}")
        os.makedirs(backup_dir, exist_ok=True)
        print(f"\nBacking originals up to {backup_dir}")

        before = after = 0
        changed = 0
        for photo_id, old_name, old_size in todo:
            old_path = os.path.join(upload_dir, old_name)
            shutil.copy2(old_path, os.path.join(backup_dir, old_name))

            new_name = optimize_image(upload_dir, old_name)
            new_size = os.path.getsize(os.path.join(upload_dir, new_name))

            if new_name != old_name:
                # The file moved, so the row has to move with it or the image
                # 404s. Committed per photo: an interruption then leaves every
                # already-processed row consistent with its file.
                db.execute(
                    "UPDATE photos SET file_path = ? WHERE id = ?", (new_name, photo_id)
                )
                db.commit()

            before += old_size
            after += new_size
            changed += 1
            print(f"  {old_name} -> {new_name}  {old_size / 1024:.0f} KB -> {new_size / 1024:.0f} KB")

    saved = before - after
    print(
        f"\nShrank {changed} photo(s): {before / 1024 / 1024:.1f} MB -> "
        f"{after / 1024 / 1024:.1f} MB (saved {saved / 1024 / 1024:.1f} MB)"
    )
    print("Originals kept in", backup_dir)


if __name__ == "__main__":
    main()
