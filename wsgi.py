"""Production entry point: `gunicorn wsgi:app`.

app.py is the dev runner (it calls app.run with the debug reloader). This is the
same app with no server attached, so gunicorn owns the process.
"""

from dotenv import load_dotenv

load_dotenv()

from trip import create_app  # noqa: E402

app = create_app()
