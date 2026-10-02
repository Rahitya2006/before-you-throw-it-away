# Before You Throw It Away — Live AI Prototype

This version connects the website to Gemini through a small local Python backend.

## 1. Create your Gemini API key

Use Google AI Studio and create a Gemini API key.

Do NOT send the key to ChatGPT and do NOT put it in `app.js`.

## 2. Create your local `.env`

Copy `.env.example` to `.env`.

Then open `.env` and replace:

GEMINI_API_KEY=PASTE_YOUR_KEY_HERE

with your actual key.

## 3. Install Python packages

Open Terminal in this folder and run:

python3 -m pip install -r requirements.txt

If Ubuntu gives a message about an "externally managed environment", create a virtual environment:

python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r requirements.txt

## 4. Start the website

Run:

python3 server.py

Then open:

http://localhost:8000

IMPORTANT: From now on, use `python3 server.py` instead of `python3 -m http.server 8000`.

## 5. Test

Upload 2–4 photos of the same item. Add a useful description. Click Analyze.

The website should return a real Gemini analysis, not the old demo rules.

## Safety

The server keeps your Gemini API key on the backend. Do not publish `.env`.

If you later deploy the website, use the hosting provider's secret/environment-variable system instead of putting the key in the frontend.
