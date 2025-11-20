📘 Chat A.I+

A lightweight, fast, LM-Studio-powered RAG chatbot built using FastAPI + HTML/CSS/JS.
It supports:

📄 PDF-based RAG (English Textbook)

🔍 Table of Contents extraction

🤖 Primary LLM + Automatic Fallback LLM (Phi-2 → TinyLLaMA)

💬 Clean ChatGPT-style frontend UI

⚡ Local inference using LM Studio API

⏱️ Fast responses with vector search (FAISS/Chroma vectorstore)

🚀 Features
✅ Hybrid LLM System (Fallback Model)

If the main model fails, Chat A.I+ automatically switches to the fallback (TinyLLaMA):

Primary Model → fails → Auto switch → TinyLLaMA


100% local. No OpenAI cloud needed.

✅ RAG (Retrieval Augmented Generation)

Uses a vectorstore (vectorstore.pkl)

Retrieves top-k chunks

Uses LangChain’s create_retrieval_chain

Answer quality improved using context

✅ PDF TOC Extraction

System scans your PDF pages and extracts:

Prose topics

Poetry list

Grammar chapters

Table of contents

TOC query detection works automatically.

✅ Modern UI (like ChatGPT)

Frontend built using:

HTML

CSS (custom UI inspired by your screenshot)

JavaScript

Includes:

Sidebar with chat history

New chat button

Search bar

Smooth chat bubbles

Purple theme to match “Chat A.I+”

📂 Project Structure
📁 project/
│ app.py
│ vectorstore.pkl
│ English_textbook_11th.pdf
│
├─ templates/
│     └── index.html
│
└─ static/
      ├── style.css
      └── script.js

🔧 Tech Stack
Backend

FastAPI

LangChain

LM Studio (local LLM server)

Joblib (for vectorstore)

PyPDF2 (for PDF text extraction)

Frontend

HTML

CSS

JavaScript

Models

Primary: Phi-2

Fallback: TinyLlama-1.1B-Chat

🛠️ Installation & Setup Guide
1. Install dependencies
pip install fastapi uvicorn langchain-openai joblib PyPDF2 jinja2

2. Start LM Studio

Load Phi-2

Set server to:

http://localhost:1234/v1


API key can be anything (you used “lm-studio”).

3. Run the FastAPI server
uvicorn app:app --reload

4. Open the UI

Visit:

👉 http://127.0.0.1:8000

📡 API Endpoints
POST /chat

Send a question:

{
  "query": "What is the summary of the first poem?"
}


Response:

{
  "answer": "Here is your answer..."
}

GET /toc

Returns TOC extracted from PDF.

GET /health

Health check.

🚀 Future Improvements

🎤 Add voice input & output

🗂 Model switcher in UI

📊 Evaluate model response quality

🛡 Hallucination guard (re-ranking)

🌗 Dark mode

🔄 Streaming responses (like ChatGPT)

📜 License

This project is free for personal and educational use.
