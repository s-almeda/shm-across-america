import os

from dotenv import load_dotenv

load_dotenv()

from trip import create_app  # noqa: E402

app = create_app()


def _print_banner(port):
    base = f"http://127.0.0.1:{port}"
    c = app.config
    lines = [
        "",
        "=" * 62,
        "  SHM Across America -- dev server",
        "=" * 62,
        f"  Map:            {base}/",
        f"  Admin login:    {base}/{c['ADMIN_PATH']}/login",
        f"  Admin password: {c['ADMIN_PASSWORD']}",
        "-" * 62,
        "  Routes:",
        "    POST /sms                        Twilio webhook",
        "    GET  /api/trip                   pins + planned stops + comments",
        "    GET  /api/comments               list visible comments",
        "    POST /api/comments               post a comment",
        "    POST /api/comments/<id>/flag     flag a comment",
        f"    GET  /{c['ADMIN_PATH']}/         admin dashboard (login required)",
        "=" * 62,
        "",
    ]
    print("\n".join(lines))


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 47321))
    if not app.debug or os.environ.get("WERKZEUG_RUN_MAIN") == "true":
        _print_banner(port)
    app.run(host="0.0.0.0", port=port, debug=True)
