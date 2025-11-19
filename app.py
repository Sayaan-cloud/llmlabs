import os
import joblib
import re
import shutil
from fastapi import FastAPI, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, PlainTextResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from langchain_openai import ChatOpenAI
from langchain.chains.combine_documents import create_stuff_documents_chain
from langchain.chains import create_retrieval_chain
from langchain.prompts import PromptTemplate

try:
    import PyPDF2
except Exception:
    PyPDF2 = None


# =========================================================
#  CONFIG
# =========================================================
os.environ["OPENAI_API_BASE"] = "http://localhost:1234/v1"
os.environ["OPENAI_API_KEY"] = "lm-studio"

PRIMARY_MODEL = "phi-2"
FALLBACK_MODEL = "tinyllama-1.1b-chat-v1.0"

RETRIEVER_FILE = "vectorstore.pkl"
PDF_FILE = "English_textbook_11th.pdf"


# =========================================================
#  FASTAPI SETUP
# =========================================================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = FastAPI()

# static + templates
app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")
templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "templates"))

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class QueryRequest(BaseModel):
    query: str



# =========================================================
#  LOAD VECTORSTORE RETRIEVER
# =========================================================
print("Loading retriever...")
retriever = joblib.load(RETRIEVER_FILE)
retriever = retriever.as_retriever(search_kwargs={"k": 3})
print("Retriever loaded.")



# =========================================================
#  HELPER: Create model instance
# =========================================================
def create_llm(model_name: str):
    return ChatOpenAI(
        model=model_name,
        temperature=0.4,
        openai_api_base=os.environ["OPENAI_API_BASE"],
        openai_api_key=os.environ["OPENAI_API_KEY"],
        request_timeout=200,
        streaming=False,  # NOTE: LangChain → LM Studio streaming is unstable
    )

# Initialize primary LLM
llm = create_llm(PRIMARY_MODEL)



# =========================================================
#  QA CHAIN SETUP
# =========================================================
prompt_template = """
You are a helpful assistant that answers questions only from the provided context.

Context:
{context}

Question:
{input}

Answer in 3–5 clear sentences:
"""

QA_PROMPT = PromptTemplate.from_template(prompt_template)

def build_chain(model):
    combine_chain = create_stuff_documents_chain(llm=model, prompt=QA_PROMPT)
    return create_retrieval_chain(retriever, combine_chain)

qa_chain = build_chain(llm)



# =========================================================
#  PDF - Extract TOC
# =========================================================
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
        toc_lines = [
            l for l in text.splitlines()
            if re.search(r"Prose|Poetry|Grammar|Contents", l, re.IGNORECASE)
        ]
        CACHE_TOC = "\n".join(toc_lines[:80])
        return CACHE_TOC
    except Exception as e:
        print("PDF TOC parse error:", e)
        return None


def is_toc_query(q: str):
    q = q.lower().strip()
    keywords = [
        "contents", "table of contents",
        "prose topics", "poetry list",
        "what are the prose"
    ]
    return any(k in q for k in keywords)



# =========================================================
#  FALLBACK LLM LOGIC
# =========================================================
def answer_with_fallback(question: str):
    global llm, qa_chain

    # try primary
    try:
        result = qa_chain.invoke({"input": question})
        if result:
            return result.get("answer") or result.get("output_text")
    except Exception as e:
        print("Primary model failed:", e)

    # fallback attempt
    print("\n--- Switching to fallback TinyLlama ---\n")
    fallback_llm = create_llm(FALLBACK_MODEL)
    fallback_chain = build_chain(fallback_llm)

    try:
        result = fallback_chain.invoke({"input": question})
        if result:
            return result.get("answer") or result.get("output_text")
    except Exception as e:
        print("Fallback model also failed:", e)

    return "Both primary and fallback models failed to answer."



# =========================================================
#  ROUTES
# =========================================================
@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.post("/chat")
async def chat(req: QueryRequest):
    q = req.query.strip()
    print("Received query:", q)

    try:
        if is_toc_query(q):
            toc = extract_toc_from_pdf(PDF_FILE)
            if toc:
                return {"answer": toc}

        answer = answer_with_fallback(q)
        return {"answer": answer}

    except Exception as e:
        print("Chat error:", e)
        return {"answer": "Server error occurred."}


@app.get("/toc", response_class=PlainTextResponse)
async def toc():
    toc_data = extract_toc_from_pdf(PDF_FILE)
    if toc_data:
        return toc_data
    return PlainTextResponse("No TOC available", status_code=404)


@app.post("/upload_pdf/")
async def upload_pdf(file: UploadFile = File(...)):
    try:
        save_path = os.path.join(BASE_DIR, file.filename)
        with open(save_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        return {"status": "success", "chunks": 0}

    except Exception as e:
        print("Upload error:", e)
        return {"status": "error", "message": str(e)}


@app.get("/health")
async def health():
    return {"status": "ok"}
