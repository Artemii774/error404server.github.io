import os
import secrets
import shutil
from pathlib import Path
from datetime import datetime
import requests

from flask import (
    Flask,
    request,
    jsonify,
    send_file,
    redirect,
    session,
    url_for
)

from flask_cors import CORS


# ======================================================
# CONFIG
# ======================================================

app = Flask(__name__)

app.secret_key = os.environ.get(
    "FLASK_SECRET_KEY",
    secrets.token_hex(32)
)

# Разрешаем CORS для вашего фронтенда на GitHub Pages и локальной разработки
CORS(
    app,
    supports_credentials=True,
    origins=[
        "https://artemii774.github.io",
        "http://localhost:5500",
        "http://127.0.0.1:5500"
    ]
)


# ======================================================
# GOOGLE OAUTH CONFIG
# ======================================================

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET")


# ======================================================
# STORAGE
# ======================================================

STORAGE_ROOT = Path(
    "/mnt/ssd/server-files"
)

USERS_ROOT = STORAGE_ROOT / "users"

TOTAL_STORAGE = 500 * 1024 ** 3


USERS_ROOT.mkdir(
    parents=True,
    exist_ok=True
)


# ======================================================
# ADMIN PASSWORD
# ======================================================

ADMIN_PASSWORD = os.environ.get(
    "CLOUD_ADMIN_PASSWORD"
)


if not ADMIN_PASSWORD:

    print(
        "WARNING: CLOUD_ADMIN_PASSWORD is not configured."
    )


# ======================================================
# HELPERS
# ======================================================

def safe_user_directory(user_id):

    directory = (
        USERS_ROOT /
        user_id
    ).resolve()

    root = USERS_ROOT.resolve()

    if (
        directory != root and
        root not in directory.parents
    ):
        raise ValueError(
            "Invalid user directory"
        )

    directory.mkdir(
        parents=True,
        exist_ok=True
    )

    return directory


def safe_user_path(
    user_id,
    relative_path=""
):

    user_root = safe_user_directory(user_id)

    target = (
        user_root /
        relative_path
    ).resolve()


    if (
        target != user_root and
        user_root not in target.parents
    ):
        raise ValueError(
            "Path traversal blocked"
        )


    return target


def require_user():

    user_id = session.get("user_id")

    if not user_id:

        return None

    return user_id


def require_admin():

    return session.get(
        "admin"
    ) is True


# ======================================================
# ROOT
# ======================================================

@app.route("/")
def index():

    return jsonify({
        "server":
            "Raspberry Pi File API",

        "status":
            "online"
    })


# ======================================================
# GOOGLE AUTH
# ======================================================

@app.route("/auth/google")
def google_login():
    if not GOOGLE_CLIENT_ID:
        return jsonify({
            "error": "Google OAuth is not configured on server (missing GOOGLE_CLIENT_ID)."
        }), 500

    redirect_uri = request.host_url.rstrip("/") + "/auth/google/callback"
    google_auth_url = (
        "https://accounts.google.com/o/oauth2/v2/auth?"
        f"client_id={GOOGLE_CLIENT_ID}&"
        f"redirect_uri={redirect_uri}&"
        "response_type=code&"
        "scope=openid%20email%20profile"
    )
    return redirect(google_auth_url)


@app.route("/auth/google/callback")
def google_callback():
    code = request.args.get("code")
    if not code:
        return redirect("https://artemii774.github.io/?error=no_code")

    redirect_uri = request.host_url.rstrip("/") + "/auth/google/callback"

    token_url = "https://oauth2.googleapis.com/token"
    token_data = {
        "code": code,
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code"
    }

    token_res = requests.post(token_url, data=token_data)
    if token_res.status_code != 200:
        return redirect("https://artemii774.github.io/?error=token_failed")

    token_json = token_res.json()
    access_token = token_json.get("access_token")

    user_info_res = requests.get(
        "https://www.googleapis.com/oauth2/v3/userinfo",
        headers={"Authorization": f"Bearer {access_token}"}
    )

    if user_info_res.status_code != 200:
        return redirect("https://artemii774.github.io/?error=userinfo_failed")

    user_info = user_info_res.json()
    google_id = user_info.get("sub")
    email = user_info.get("email")

    if not google_id or not email:
        return redirect("https://artemii774.github.io/?error=invalid_user")

    session["user_id"] = google_id
    session["email"] = email

    # Сохраняем почту пользователя в специальный файл для админки
    user_dir = safe_user_directory(google_id)
    email_file = user_dir / ".email"
    email_file.write_text(email, encoding="utf-8")

    # Перенаправляем обратно на ваш фронтенд на GitHub Pages
    return redirect("https://artemii774.github.io/")


@app.route("/auth/me")
def auth_me():

    user_id = session.get("user_id")
    email = session.get("email")


    if not user_id:

        return jsonify({
            "authenticated":
                False
        }), 401


    return jsonify({
        "authenticated":
            True,

        "email":
            email
    })


@app.route(
    "/auth/logout",
    methods=["POST"]
)
def auth_logout():

    session.clear()

    return jsonify({
        "status":
            "logged_out"
    })


# ======================================================
# FILE LIST
# ======================================================

@app.route("/files")
def list_files():

    user_id = require_user()

    if not user_id:

        return jsonify({
            "error":
                "Authentication required"
        }), 401


    requested_folder = request.args.get(
        "folder",
        ""
    )


    try:

        directory = safe_user_path(
            user_id,
            requested_folder
        )

    except ValueError:

        return jsonify({
            "error":
                "Invalid path"
        }), 403


    if not directory.exists():

        return jsonify([])


    result = []


    for item in directory.iterdir():

        try:

            relative = item.relative_to(
                safe_user_directory(
                    user_id
                )
            )

        except ValueError:

            continue


        if item.is_dir():

            result.append({
                "name":
                    item.name,

                "path":
                    str(relative),

                "size":
                    0,

                "type":
                    "directory"
            })

        elif item.is_file():

            result.append({
                "name":
                    item.name,

                "path":
                    str(relative),

                "size":
                    item.stat().st_size,

                "type":
                    "file"
            })


    return jsonify(result)


# ======================================================
# UPLOAD
# ======================================================

@app.route(
    "/upload",
    methods=["POST"]
)
def upload():

    user_id = require_user()

    if not user_id:

        return jsonify({
            "error":
                "Authentication required"
        }), 401


    uploaded_file = request.files.get(
        "file"
    )


    if not uploaded_file:

        return jsonify({
            "error":
                "No file"
        }), 400


    folder = request.form.get(
        "folder",
        ""
    )


    try:

        directory = safe_user_path(
            user_id,
            folder
        )

        directory.mkdir(
            parents=True,
            exist_ok=True
        )


        target = safe_user_path(
            user_id,
            str(
                Path(folder) /
                uploaded_file.filename
            )
        )


    except ValueError:

        return jsonify({
            "error":
                "Invalid path"
        }), 403


    uploaded_file.save(
        target
    )


    return jsonify({
        "status":
            "uploaded",

        "name":
            uploaded_file.filename
    })


# ======================================================
# DOWNLOAD
# ======================================================

@app.route("/download")
def download():

    user_id = require_user()

    if not user_id:

        return jsonify({
            "error":
                "Authentication required"
        }), 401


    relative_path = request.args.get(
        "path",
        ""
    )


    try:

        target = safe_user_path(
            user_id,
            relative_path
        )

    except ValueError:

        return jsonify({
            "error":
                "Invalid path"
        }), 403


    if not target.is_file():

        return jsonify({
            "error":
                "File not found"
        }), 404


    return send_file(
        target,
        as_attachment=True
    )


# ======================================================
# DELETE
# ======================================================

@app.route(
    "/files",
    methods=["DELETE"]
)
def delete_file():

    user_id = require_user()

    if not user_id:

        return jsonify({
            "error":
                "Authentication required"
        }), 401


    relative_path = request.args.get(
        "path",
        ""
    )


    try:

        target = safe_user_path(
            user_id,
            relative_path
        )

    except ValueError:

        return jsonify({
            "error":
                "Invalid path"
        }), 403


    if not target.exists():

        return jsonify({
            "error":
                "Not found"
        }), 404


    if target.is_dir():

        shutil.rmtree(
            target
        )

    else:

        target.unlink()


    return jsonify({
        "status":
            "deleted"
    })


# ======================================================
# CREATE FOLDER
# ======================================================

@app.route(
    "/folders",
    methods=["POST"]
)
def create_folder():

    user_id = require_user()

    if not user_id:

        return jsonify({
            "error":
                "Authentication required"
        }), 401


    data = request.get_json(
        silent=True
    ) or {}


    name = data.get(
        "name",
        ""
    )


    folder = data.get(
        "folder",
        ""
    )


    if not name:

        return jsonify({
            "error":
                "Folder name required"
        }), 400


    try:

        target = safe_user_path(
            user_id,
            str(
                Path(folder) /
                name
            )
        )

        target.mkdir(
            parents=False,
            exist_ok=False
        )


    except FileExistsError:

        return jsonify({
            "error":
                "Folder already exists"
        }), 409


    except ValueError:

        return jsonify({
            "error":
                "Invalid path"
        }), 403


    return jsonify({
        "status":
            "created"
    })


# ======================================================
# FILE INFO
# ======================================================

@app.route("/file-info")
def file_info():

    user_id = require_user()

    if not user_id:

        return jsonify({
            "error":
                "Authentication required"
        }), 401


    relative_path = request.args.get(
        "path",
        ""
    )


    try:

        target = safe_user_path(
            user_id,
            relative_path
        )

    except ValueError:

        return jsonify({
            "error":
                "Invalid path"
        }), 403


    if not target.exists():

        return jsonify({
            "error":
                "Not found"
        }), 404


    stat = target.stat()


    return jsonify({

        "name":
            target.name,

        "size":
            stat.st_size,

        "type":
            "directory"
            if target.is_dir()
            else "file",

        "modified":
            datetime.fromtimestamp(
                stat.st_mtime
            ).isoformat()
    })


# ======================================================
# ADMIN LOGIN
# ======================================================

@app.route(
    "/admin/login",
    methods=["POST"]
)
def admin_login():

    if not ADMIN_PASSWORD:

        return jsonify({
            "error":
                "Admin password is not configured"
        }), 500


    data = request.get_json(
        silent=True
    ) or {}


    password = data.get(
        "password",
        ""
    )


    if not secrets.compare_digest(
        password,
        ADMIN_PASSWORD
    ):

        return jsonify({
            "error":
                "Invalid password"
        }), 401


    session["admin"] = True


    return jsonify({
        "status":
            "authenticated"
    })


# ======================================================
# ADMIN STATS
# ======================================================

@app.route("/admin/stats")
def admin_stats():

    if not require_admin():

        return jsonify({
            "error":
                "Admin authentication required"
        }), 403


    total_used = 0

    user_emails = []


    for user_directory in USERS_ROOT.iterdir():

        if not user_directory.is_dir():
            continue


        for file in user_directory.rglob("*"):

            if file.is_file():

                try:

                    total_used += (
                        file.stat().st_size
                    )

                except OSError:

                    pass


        email_file = user_directory / ".email"


        if email_file.exists():

            try:

                email = email_file.read_text(
                    encoding="utf-8"
                ).strip()

                if email:
                    user_emails.append(
                        email
                    )

            except OSError:

                pass


    free = max(
        0,
        TOTAL_STORAGE -
        total_used
    )


    return jsonify({

        "users":
            len(user_emails),

        "used":
            total_used,

        "free":
            free,

        "total":
            TOTAL_STORAGE,

        "user_emails":
            user_emails
    })


# ======================================================
# START
# ======================================================

if __name__ == "__main__":

    app.run(
        host="0.0.0.0",
        port=5000,
        debug=False
    )
