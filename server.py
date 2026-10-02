import base64
import json
import os
from pathlib import Path

import requests
from flask import Flask, jsonify, request, send_from_directory

ROOT = Path(__file__).resolve().parent
app = Flask(__name__, static_folder=str(ROOT), static_url_path="")

def load_local_env():
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    for raw in env_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)

load_local_env()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash-lite")
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

RESULT_SCHEMA = {
    "type": "object",
    "properties": {
        "object_name": {"type": "string"},
        "category": {"type": "string"},
        "brand": {"type": "string"},
        "model": {"type": "string"},
        "condition": {"type": "string"},
        "condition_confidence": {"type": "integer"},
        "functionality": {"type": "string"},
        "summary": {"type": "string"},
        "detected_damage": {"type": "array", "items": {"type": "string"}},
        "materials": {"type": "array", "items": {"type": "string"}},
        "safety_concerns": {"type": "array", "items": {"type": "string"}},
        "recommended_option": {
            "type": "string",
            "enum": ["reuse", "repair", "donate", "recycle"]
        },
        "recommendation_reason": {"type": "string"},
        "reuse_options": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "description": {"type": "string"},
                    "difficulty": {"type": "string"},
                    "cost": {"type": "string"},
                    "time": {"type": "string"},
                },
                "required": ["title", "description", "difficulty", "cost", "time"]
            }
        },
        "repair_assessment": {
            "type": "object",
            "properties": {
                "diy_feasibility": {"type": "string"},
                "summary": {"type": "string"},
                "tools": {"type": "array", "items": {"type": "string"}},
                "professional_help": {"type": "string"}
            },
            "required": ["diy_feasibility", "summary", "tools", "professional_help"]
        },
        "donation_assessment": {
            "type": "object",
            "properties": {
                "suitability": {"type": "string"},
                "summary": {"type": "string"}
            },
            "required": ["suitability", "summary"]
        },
        "recycling_assessment": {
            "type": "object",
            "properties": {
                "stream": {"type": "string"},
                "summary": {"type": "string"},
                "hazardous_handling": {"type": "string"}
            },
            "required": ["stream", "summary", "hazardous_handling"]
        },
        "additional_information_needed": {
            "type": "array",
            "items": {"type": "string"}
        }
    },
    "required": [
        "object_name", "category", "brand", "model", "condition",
        "condition_confidence", "functionality", "summary",
        "detected_damage", "materials", "safety_concerns",
        "recommended_option", "recommendation_reason",
        "reuse_options", "repair_assessment", "donation_assessment",
        "recycling_assessment", "additional_information_needed"
    ]
}

SYSTEM_PROMPT = """
You are the vision and decision engine for a product called "Before You Throw It Away".

Your task is to analyze MULTIPLE IMAGES that all show the SAME physical item. Combine evidence across all photos and an optional user description. Do not treat the images as separate objects.

Identify the item as accurately as possible. Inspect its apparent condition, functionality, visible damage, materials, and safety concerns. Then reason about four possible paths: reuse, repair, donation, recycling.

Important:
- Be honest about uncertainty. Never invent a brand, model, material, defect, or capability.
- If the item is unclear, use cautious wording and ask for useful additional photos/details.
- Choose exactly one recommended_option, but the user will make the final choice.
- The four paths are always available.
- Do not invent local shops, NGOs, recyclers, phone numbers, addresses, opening hours, or municipal facts. Local lookup is handled separately by the application.
- Do not give dangerous step-by-step DIY instructions for mains electricity, lithium batteries, gas, hazardous chemicals, heavy machinery, structural hazards, or similar risks. Flag the hazard and recommend qualified help when appropriate.
- Reuse ideas should be practical and specific to the object, not generic where possible.
- Repair assessment should distinguish safe/simple DIY possibilities from situations where professional help is appropriate.
- Donation assessment should consider usability, safety, cleanliness, and whether the item is reasonably suitable to pass to someone else.
- Recycling assessment should identify likely material/e-waste streams and any specialist-handling requirement.
- Return only the requested JSON structure.
"""

@app.get("/")
def home():
    return send_from_directory(ROOT, "index.html")

@app.post("/api/analyze")
def analyze():
    if not GEMINI_API_KEY:
        return jsonify({
            "error": "GEMINI_API_KEY is not configured yet. Create a .env file next to server.py and add your key."
        }), 500

    data = request.get_json(silent=True) or {}
    images = data.get("images", [])
    description = (data.get("description") or "").strip()
    language = data.get("language") or "en"

    if not images:
        return jsonify({"error": "Please provide at least one image."}), 400

    if len(images) > 6:
        return jsonify({"error": "Please use at most 6 images."}), 400

    parts = [{
        "text": (
            f"Respond in the user's selected language where practical. Selected language code: {language}.\n"
            "User's optional description:\n"
            f"{description or '(No description provided.)'}\n\n"
            "Analyze all attached images as views of the same item."
        )
    }]

    for image in images:
        mime_type = image.get("mimeType", "image/jpeg")
        raw_b64 = image.get("data", "")
        if not raw_b64:
            continue

        # Limit to normal browser-upload image types.
        if not mime_type.startswith("image/"):
            continue

        parts.append({
            "inline_data": {
                "mime_type": mime_type,
                "data": raw_b64
            }
        })

    payload = {
        "systemInstruction": {
            "parts": [{"text": SYSTEM_PROMPT}]
        },
        "contents": [{
            "role": "user",
            "parts": parts
        }],
        "generationConfig": {
            "response_mime_type": "application/json",
            "response_schema": RESULT_SCHEMA,
            "temperature": 0.2
        }
    }

    try:
        response = requests.post(
            GEMINI_URL,
            headers={
                "Content-Type": "application/json",
                "x-goog-api-key": GEMINI_API_KEY
            },
            json=payload,
            timeout=90
        )
    except requests.RequestException as exc:
        return jsonify({"error": f"Could not reach Gemini: {exc}"}), 502

    if not response.ok:
        try:
            details = response.json()
        except Exception:
            details = response.text[:1000]
        return jsonify({
            "error": "Gemini returned an error.",
            "details": details
        }), response.status_code

    try:
        body = response.json()
        text = body["candidates"][0]["content"]["parts"][0]["text"]
        result = json.loads(text)
        return jsonify(result)
    except (KeyError, IndexError, TypeError, json.JSONDecodeError) as exc:
        return jsonify({
            "error": "Gemini responded, but the result could not be read.",
            "details": str(exc),
            "raw": response.text[:2000]
        }), 502

@app.get("/<path:path>")
def static_files(path):
    return send_from_directory(ROOT, path)

if __name__ == "__main__":
    print("Before You Throw It Away")
    print("Open: http://localhost:8000")
    app.run(host="127.0.0.1", port=8000, debug=True)
