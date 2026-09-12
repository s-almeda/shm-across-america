import mimetypes
import os
import uuid

import requests

MAX_MEDIA_BYTES = 20 * 1024 * 1024  # 20 MB safety cap


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

    return filename
