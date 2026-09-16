import logging
import mimetypes
import os
import uuid

import requests
from PIL import Image, ImageOps

try:
    # iPhones shoot HEIC, which Pillow can't read unaided -- and which most
    # browsers can't display either, so these have to become JPEG or they
    # reach visitors as a broken image.
    from pillow_heif import register_heif_opener

    register_heif_opener()
except ImportError:
    pass

log = logging.getLogger(__name__)

MAX_MEDIA_BYTES = 20 * 1024 * 1024  # 20 MB safety cap
MAX_IMAGE_EDGE = 1600  # px on the long side -- 2x the widest card it lands in
JPEG_QUALITY = 82


def optimize_image(upload_dir, filename):
    """Downscale an upload and re-encode it as JPEG.

    Returns the filename actually left on disk, which the caller must store:
    re-encoding changes the extension, and JPEG bytes served from a .png name
    go out under the wrong Content-Type. Anything unreadable is left alone.
    """
    src = os.path.join(upload_dir, filename)
    try:
        with Image.open(src) as opened:
            # Flattening an animated GIF to its first frame is worse than
            # leaving it big.
            if getattr(opened, "n_frames", 1) > 1:
                return filename

            # Phones store portrait shots as landscape plus a rotation flag.
            # Saving without the EXIF block drops that flag, so the photo would
            # come out lying on its side.
            img = ImageOps.exif_transpose(opened)

            if img.mode != "RGB":
                # JPEG has no alpha; compositing onto white beats letting
                # transparent pixels go black.
                img = Image.alpha_composite(
                    Image.new("RGBA", img.size, (255, 255, 255, 255)),
                    img.convert("RGBA"),
                ).convert("RGB")

            # Only ever shrinks, and keeps the aspect ratio.
            img.thumbnail((MAX_IMAGE_EDGE, MAX_IMAGE_EDGE), Image.Resampling.LANCZOS)

            dest_name = f"{os.path.splitext(filename)[0]}.jpg"
            dest = os.path.join(upload_dir, dest_name)
            img.save(
                dest, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True
            )
    except Exception:
        log.exception("couldn't optimise %s -- keeping the original", filename)
        return filename

    if dest != src:
        os.remove(src)
    return dest_name


def download_media(url, account_sid, auth_token, upload_dir):
    """Fetch a Twilio media URL and save it under upload_dir.

    Twilio media URLs require basic auth and expire, so this must be
    called at receive time. Returns the file path relative to upload_dir.
    """
    resp = requests.get(url, auth=(account_sid, auth_token), timeout=15, stream=True)
    resp.raise_for_status()

    content_type = resp.headers.get("Content-Type", "").split(";")[0].strip()
    ext = mimetypes.guess_extension(content_type) or ".bin"
    if ext == ".jpe":
        ext = ".jpg"

    filename = f"{uuid.uuid4().hex}{ext}"
    os.makedirs(upload_dir, exist_ok=True)
    dest_path = os.path.join(upload_dir, filename)

    size = 0
    with open(dest_path, "wb") as f:
        for chunk in resp.iter_content(chunk_size=65536):
            if not chunk:
                continue
            size += len(chunk)
            if size > MAX_MEDIA_BYTES:
                f.close()
                os.remove(dest_path)
                raise ValueError("media exceeds max allowed size")
            f.write(chunk)

    return optimize_image(upload_dir, filename)
