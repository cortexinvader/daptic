
import os
import json
import sqlite3
from datetime import datetime
from flask import (
    Flask, render_template, request, redirect, url_for, flash, session,
    jsonify, g
)
from werkzeug.security import generate_password_hash, check_password_hash
import requests

# --------- CONFIG ----------
DB_NAME = "daptic.db"
INSTRUCTION_FILE = "instruction.txt"
API_MODEL = "gemini-2.0-flash"
API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
API_KEY = os.getenv("GOOGLE_API_KEY")  # load from env
if not API_KEY:
    raise RuntimeError("GOOGLE_API_KEY not set in environment")

API_URL = f"{API_BASE}/{API_MODEL}:generateContent?key={API_KEY}"

MAX_PROMPT_LEN = 2000  # enforce server-side cap

# Flask app
app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET", "replace_this_in_production")
app.config["SESSION_COOKIE_HTTPONLY"] = True


# --------- DB HELPERS ----------
def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_NAME, detect_types=sqlite3.PARSE_DECLTYPES)
        g.db.row_factory = sqlite3.Row
    return g.db

@app.teardown_appcontext
def close_db(exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()

def init_db():
    """Create DB and tables if missing."""
    if not os.path.exists(DB_NAME):
        with sqlite3.connect(DB_NAME) as conn:
            cur = conn.cursor()
            cur.execute("""
                CREATE TABLE users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    fullname TEXT,
                    email TEXT UNIQUE,
                    username TEXT UNIQUE,
                    password TEXT
                )
            """)
            cur.execute("""
                CREATE TABLE conversations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT,
                    role TEXT,          -- 'user' or 'bot'
                    message TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.commit()
            print("[+] Initialized DB:", DB_NAME)

init_db()

# --------- UTIL ----------
def load_system_instruction():
    if os.path.exists(INSTRUCTION_FILE):
        try:
            with open(INSTRUCTION_FILE, "r", encoding="utf-8") as fh:
                return fh.read().strip()
        except Exception:
            return ""
    return ""

def persist_message(username, role, message):
    try:
        db = get_db()
        db.execute(
            "INSERT INTO conversations (username, role, message) VALUES (?, ?, ?)",
            (username, role, message)
        )
        db.commit()
    except Exception as e:
        # don't crash the whole flow for persistence error; log to console
        print("Failed to persist message:", e)


# --------- AUTH ROUTES (login/signup/logout) ----------
@app.route("/")
def home():
    if "username" in session:
        return render_template("index.html", username=session.get("username"))
    return redirect(url_for("login"))

@app.route("/signup", methods=["GET", "POST"])
def signup():
    if request.method == "POST":
        fullname = request.form.get("fullname", "").strip()
        email = request.form.get("email", "").strip().lower()
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        confirm = request.form.get("confirm", "")

        if not fullname or not email or not username or not password:
            flash("Please fill all required fields.", "error")
            return redirect(url_for("signup"))

        if password != confirm:
            flash("Passwords do not match!", "error")
            return redirect(url_for("signup"))

        hashed = generate_password_hash(password)

        try:
            db = get_db()
            db.execute(
                "INSERT INTO users (fullname, email, username, password) VALUES (?, ?, ?, ?)",
                (fullname, email, username, hashed)
            )
            db.commit()
            flash("Account created successfully! Please login.", "success")
            return redirect(url_for("login"))
        except sqlite3.IntegrityError:
            flash("Email or username already exists!", "error")
            return redirect(url_for("signup"))
        except Exception as e:
            print("Signup error:", e)
            flash("An error occurred during signup.", "error")
            return redirect(url_for("signup"))

    return render_template("signup.html")

@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")

        if not username or not password:
            flash("Provide username and password.", "error")
            return redirect(url_for("login"))

        try:
            db = get_db()
            user = db.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
            if user and check_password_hash(user["password"], password):
                session["username"] = user["username"]
                # optional: set last login time etc.
                return redirect(url_for("home"))
            else:
                flash("Invalid username or password!", "error")
                return redirect(url_for("login"))
        except Exception as e:
            print("Login error:", e)
            flash("Login error occurred.", "error")
            return redirect(url_for("login"))

    return render_template("login.html")

@app.route("/logout")
def logout():
    session.pop("username", None)
    flash("You have been logged out.", "info")
    return redirect(url_for("login"))


# --------- API: current user (frontend reads this) ----------
@app.route("/api/current_user", methods=["GET"])
def api_current_user():
    return jsonify({"username": session.get("username", "")}), 200


# --------- API: generate (server-side call to Gemini) ----------
@app.route("/api/generate", methods=["POST"])
def api_generate():
    """
    Expects JSON:
    { "prompt": "...", "username": "optional" }
    Returns:
    { "reply": "..." }
    """
    # parse payload safefully
    try:
        body = request.get_json(force=True)
    except Exception:
        return jsonify({"error": "Invalid JSON"}), 400

    prompt = (body.get("prompt") or "").strip()
    provided_username = (body.get("username") or "").strip()
    if not prompt:
        return jsonify({"error": "Prompt required"}), 400

    if len(prompt) > MAX_PROMPT_LEN:
        return jsonify({"error": f"Prompt too long (max {MAX_PROMPT_LEN})"}), 413

    # determine username: session > provided > 'anonymous'
    username = session.get("username") or provided_username or "anonymous"

    # persist user message (best effort)
    try:
        persist_message(username, "user", prompt)
    except Exception:
        pass  # already handled inside persist_message

    # build request body with system instruction prepended
    system_inst = load_system_instruction()
    full_prompt = (system_inst + "\n\n" if system_inst else "") + prompt

    payload = {
        "contents": [
            { "parts": [ { "text": full_prompt } ] }
        ]
    }

    headers = {"Content-Type": "application/json"}

    try:
        resp = requests.post(API_URL, headers=headers, json=payload, timeout=30)
    except requests.RequestException as e:
        print("Remote request failed:", e)
        return jsonify({"error": "Failed to reach remote API", "details": str(e)}), 502

    # explicit non-200 handling
    if resp.status_code != 200:
        # try to extract helpful error text
        details = None
        try:
            details = resp.json()
        except Exception:
            details = resp.text
        print("Remote API non-200:", resp.status_code, details)
        return jsonify({"error": "Remote API error", "details": details}), resp.status_code

    # parse returned JSON safely
    try:
        data = resp.json()
    except Exception as e:
        print("Failed parse JSON:", e)
        return jsonify({"error": "Invalid JSON from remote API"}), 502

    # defensive navigation for the reply text
    ai_text = ""
    try:
        candidates = data.get("candidates") or []
        if isinstance(candidates, list) and candidates:
            content = candidates[0].get("content") or {}
            parts = content.get("parts") or []
            if isinstance(parts, list) and parts:
                ai_text = parts[0].get("text") or ""
    except Exception:
        ai_text = ""

    if not ai_text:
        ai_text = "❌ No response."

    # store bot reply
    try:
        persist_message(username, "bot", ai_text)
    except Exception:
        pass

    return jsonify({"reply": ai_text}), 200


# --------- API: history (get conversation for current user) ----------
@app.route("/api/history", methods=["GET"])
def api_history():
    username = session.get("username") or request.args.get("username") or "anonymous"
    try:
        db = get_db()
        rows = db.execute(
            "SELECT role, message, created_at FROM conversations WHERE username = ? ORDER BY id ASC",
            (username,)
        ).fetchall()
        items = [{"role": r["role"], "message": r["message"], "created_at": r["created_at"]} for r in rows]
        return jsonify({"history": items}), 200
    except Exception as e:
        print("History error:", e)
        return jsonify({"history": []}), 200


# --------- START ----------
if __name__ == "__main__":
    
    app.run(debug=True, host="0.0.0.0", port=3000)
