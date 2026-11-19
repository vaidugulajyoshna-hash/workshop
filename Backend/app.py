import os
from uuid import UUID

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from postgrest import APIError
from supabase import Client, create_client

load_dotenv()

app = Flask(__name__)


@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response


def _make_supabase() -> Client | None:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_PUBLISHABLE_KEY") or os.environ.get("SUPABASE_KEY")
    if not url or not key:
        return None
    return create_client(url, key)


supabase = _make_supabase()


def _db():
    if supabase is None:
        return None, (
            jsonify(
                {
                    "error": (
                        "Supabase is not configured. Set SUPABASE_URL and "
                        "SUPABASE_PUBLISHABLE_KEY."
                    )
                }
            ),
            503,
        )
    return supabase, None


def _api_error(error: APIError):
    message = getattr(error, "message", str(error))
    code = getattr(error, "code", None)
    status = 409 if code == "23505" else 400
    return jsonify({"error": message, "code": code}), status


def _valid_uuid(value) -> bool:
    if not isinstance(value, str):
        return False
    try:
        UUID(value)
        return True
    except (ValueError, TypeError, AttributeError):
        return False


@app.route("/api/events", methods=["GET", "OPTIONS"])
def list_events():
    if request.method == "OPTIONS":
        return "", 204

    db, error = _db()
    if error:
        return error

    try:
        query = db.table("events").select("*")
        status = request.args.get("status")
        if status:
            query = query.eq("status", status)
        response = query.execute()
        return jsonify(response.data)
    except APIError as exc:
        return _api_error(exc)


@app.route("/api/events/<event_id>", methods=["GET", "OPTIONS"])
def get_event(event_id):
    if request.method == "OPTIONS":
        return "", 204
    if not _valid_uuid(event_id):
        return jsonify({"error": "event id must be a UUID"}), 400

    db, error = _db()
    if error:
        return error

    try:
        response = (
            db.table("events")
            .select("*")
            .eq("id", event_id)
            .maybe_single()
            .execute()
        )
        if not response.data:
            return jsonify({"error": "Event not found"}), 404
        return jsonify(response.data)
    except APIError as exc:
        return _api_error(exc)


@app.route("/api/registrations", methods=["POST", "OPTIONS"])
def create_registration():
    if request.method == "OPTIONS":
        return "", 204

    body = request.get_json(silent=True) or {}
    user_id = body.get("user_id")
    event_id = body.get("event_id")

    if not _valid_uuid(user_id) or not _valid_uuid(event_id):
        return jsonify({"error": "user_id and event_id must be UUIDs"}), 400

    db, error = _db()
    if error:
        return error

    try:
        event_response = (
            db.table("events")
            .select("id,capacity,status")
            .eq("id", event_id)
            .maybe_single()
            .execute()
        )
        event = event_response.data
        if not event:
            return jsonify({"error": "Event not found"}), 404

        if event.get("status", "").lower() not in {"open", "published", "active"}:
            return jsonify({"error": "Event is not accepting registrations"}), 409

        # The schema has capacity but no attendee count. Concurrent requests
        # need a database constraint or RPC for a strict capacity guarantee.
        current = (
            db.table("registrations")
            .select("id", count="exact")
            .eq("event_id", event_id)
            .execute()
        )
        count = getattr(current, "count", None)
        if count is None:
            count = len(current.data or [])

        capacity = event.get("capacity")
        if capacity is not None and count >= capacity:
            return jsonify({"error": "Event is full"}), 409

        result = (
            db.table("registrations")
            .insert({"user_id": user_id, "event_id": event_id})
            .execute()
        )
        registration = (
            result.data[0]
            if result.data
            else {"user_id": user_id, "event_id": event_id}
        )
        return jsonify(registration), 201
    except APIError as exc:
        return _api_error(exc)


@app.route("/api/me/registrations", methods=["GET", "OPTIONS"])
def my_registrations():
    if request.method == "OPTIONS":
        return "", 204

    user_id = request.args.get("user_id")
    if not _valid_uuid(user_id):
        return jsonify(
            {
                "error": "Provide a UUID user_id query parameter"
            }
        ), 400

    db, error = _db()
    if error:
        return error

    try:
        response = (
            db.table("registrations")
            .select("*, events(*)")
            .eq("user_id", user_id)
            .execute()
        )
        return jsonify(response.data)
    except APIError as exc:
        return _api_error(exc)


@app.route("/api/events/<event_id>/registrations", methods=["GET", "OPTIONS"])
def event_registrations(event_id):
    if request.method == "OPTIONS":
        return "", 204
    if not _valid_uuid(event_id):
        return jsonify({"error": "event id must be a UUID"}), 400

    db, error = _db()
    if error:
        return error

    try:
        event_response = (
            db.table("events")
            .select("id")
            .eq("id", event_id)
            .maybe_single()
            .execute()
        )
        event = event_response.data
        if not event:
            return jsonify({"error": "Event not found"}), 404

        response = (
            db.table("registrations")
            .select("*, users(id,email,role)")
            .eq("event_id", event_id)
            .execute()
        )
        return jsonify(response.data)
    except APIError as exc:
        return _api_error(exc)


if __name__ == "__main__":
    app.run(debug=True)