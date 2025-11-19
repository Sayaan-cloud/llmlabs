# ⚙️ app.py
import os
import joblib
import re
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, PlainTextResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from langchain_openai import ChatOpenAI
from langchain.chains.combine_documents import create_stuff_documents_chain
from langchain.chains import create_retrieval_chain
from langchain.prompts import PromptTemplate
from fastapi import UploadFile, File
import shutil

try:
    import PyPDF2
except Exception:
    PyPDF2 = None

# ---------- CONFIG ----------
os.environ["OPENAI_API_BASE"] = "http://localhost:1234/v1"
os.environ["OPENAI_API_KEY"] = "lm-studio"
RETRIEVER_FILE = "vectorstore.pkl"
PDF_FILE = "English_textbook_11th.pdf"

# use your available LM Studio models
LMSTUDIO_MODEL_NAME = "phi-2"   # or "tinyllama-1.1b-chat-v1.0"
# ----------------------------

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
TEMPLATES_DIR = os.path.join(BASE_DIR, "templates")

app = FastAPI()

# Mount static + templates
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
templates = Jinja2Templates(directory=TEMPLATES_DIR)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class QueryRequest(BaseModel):
    query: str

# ---------- Load retriever ----------
print("🔄 Loading retriever...")
retriever = joblib.load(RETRIEVER_FILE)
retriever = retriever.as_retriever(search_kwargs={"k": 3})
print("✅ Retriever loaded successfully!")

# ---------- LLM setup ----------
llm = ChatOpenAI(
    model=LMSTUDIO_MODEL_NAME,
    temperature=0.4,
    openai_api_base=os.environ["OPENAI_API_BASE"],
    openai_api_key=os.environ["OPENAI_API_KEY"],
    request_timeout=300,
    streaming=True,
)

prompt_template = """
You are a helpful assistant that answers questions only from the provided context.

Context:
{context}

Question:
{input}

Answer clearly in 3-5 sentences:
"""
QA_CHAIN_PROMPT = PromptTemplate.from_template(prompt_template)
combine_chain = create_stuff_documents_chain(llm=llm, prompt=QA_CHAIN_PROMPT)
qa = create_retrieval_chain(retriever, combine_chain)

# ---------- PDF TOC extraction ----------
CACHE_TOC = None
def extract_toc_from_pdf(pdf_path):
    global CACHE_TOC
    if CACHE_TOC:
        return CACHE_TOC
    if not PyPDF2 or not os.path.exists(pdf_path):
        return None
    try:
        reader = PyPDF2.PdfReader(pdf_path)
        text = "\n".join([p.extract_text() or "" for p in reader.pages])
        toc_lines = [l for l in text.splitlines() if re.search(r"Prose|Poetry|Grammar|Contents", l, re.IGNORECASE)]
        CACHE_TOC = "\n".join(toc_lines[:80])
        return CACHE_TOC
    except Exception as e:
        print("PDF parse error:", e)
        return None

def is_toc_query(q: str):
    q = q.lower().strip()
    toc_keywords = ["prose topics", "contents", "table of contents", "poetry list", "what are the prose"]
    return any(k in q for k in toc_keywords)

# ---------- Routes ----------
@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.post("/chat")
async def chat(req: QueryRequest):
    q = req.query.strip()
    try:
        print("🧠 Received question:", q)

        if is_toc_query(q):
            toc = extract_toc_from_pdf(PDF_FILE)
            if toc:
                return {"answer": toc}

        result = qa.invoke({"input": q})
        answer = result.get("answer") or result.get("output_text") or str(result)
        return {"answer": answer}

    except Exception as e:
        print("❌ Error:", e)
        return {"answer": "⚠️ Something went wrong on the server side."}

@app.get("/health")
async def health():
    return JSONResponse({"status": "ok"})

@app.get("/toc", response_class=PlainTextResponse)
async def toc():
    toc = extract_toc_from_pdf(PDF_FILE)
    if toc:
        return toc
    return PlainTextResponse("No TOC available", status_code=404)

@app.post("/upload_pdf/")
async def upload_pdf(file: UploadFile = File(...)):
    try:
        pdf_path = os.path.join(BASE_DIR, file.filename)
        with open(pdf_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # optional: trigger retriever rebuild (you can hook your PDF loader here)
        # but for now, just pretend success
        return {"status": "success", "chunks": 0}
    except Exception as e:
        print("PDF upload error:", e)
        return {"status": "error", "message": str(e)}