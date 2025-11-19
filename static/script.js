// -----------------------------
// Simple modern chat frontend
// Expects backend endpoints:
//  - POST /chat  -> { query: "..." } returns { answer: "..." }
//  - POST /upload_pdf/ -> form-data file -> returns { status: "success", chunks: n }
// -----------------------------

// DOM
const chatBox = document.getElementById('chatBox');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const micBtn = document.getElementById('micBtn');
const pauseBtn = document.getElementById('pauseBtn');
const replayBtn = document.getElementById('replayBtn');
const copyBtn = document.getElementById('copyBtn');
const downloadAnsBtn = document.getElementById('downloadAnsBtn');
const downloadChat = document.getElementById('downloadChat');
const voiceStatus = document.getElementById('voiceStatus');
const newChatBtn = document.getElementById('newChatBtn');

const menuBtn = document.getElementById('menuBtn');
const menuPanel = document.getElementById('menuPanel');
const pdfUpload = document.getElementById('pdfUpload');
const chooseFileBtn = document.getElementById('chooseFileBtn');
const uploadBtn = document.getElementById('uploadBtn');
const evalBtn = document.getElementById('evalBtn');
const clearBtn = document.getElementById('clearBtn');
const themeToggle = document.getElementById('themeToggle');

// state
let lastAnswerText = '';
let lastUtterance = null;
let recognition = null;
let listening = false;
let streamingController = null;
let chatHistory = [];

// ---------- localStorage persistence ----------
const LS_KEY = 'llm_chat_history_v1';
function loadHistory(){
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    chatHistory = JSON.parse(raw);
    chatHistory.forEach(m => renderMessage(m.role, m.text, false));
  } catch(e){ console.error(e); }
}
function saveHistory(){
  localStorage.setItem(LS_KEY, JSON.stringify(chatHistory));
}
function pushHistory(role, text){
  chatHistory.push({role, text, ts: Date.now()});
  saveHistory();
}

// ---------- utilities ----------
function scrollBottom(){ chatBox.scrollTop = chatBox.scrollHeight; }
function mkMsgDiv(role, html){
  const el = document.createElement('div');
  el.className = 'msg ' + (role === 'user' ? 'user' : 'bot');
  el.innerHTML = html;
  return el;
}
function renderMessage(role, text, save=true){
  const parsed = (role === 'bot') ? marked.parse(text) : escapeHtml(text);
  const el = mkMsgDiv(role, parsed);
  chatBox.appendChild(el);
  scrollBottom();
  if (save) pushHistory(role, text);
  if (role === 'bot') lastAnswerText = text;
  return el;
}
function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

// ---------- new chat / clear ----------
newChatBtn.addEventListener('click', () => {
  chatBox.innerHTML = '';
  chatHistory = [];
  saveHistory();
  renderMessage('bot', 'New chat started! Ask me anything 🧠');
});
clearBtn.addEventListener('click', () => {
  if (!confirm('Clear chat history?')) return;
  localStorage.removeItem(LS_KEY);
  chatBox.innerHTML = '';
  chatHistory = [];
  renderMessage('bot', 'Chat cleared.');
});

// ---------- dropdown menu toggle ----------
menuBtn?.addEventListener('click', (e) => {
  menuPanel.hidden = !menuPanel.hidden;
});
document.addEventListener('click', e => {
  if (!menuPanel) return;
  if (!menuPanel.contains(e.target) && e.target !== menuBtn) menuPanel.hidden = true;
});

// ---------- file input handlers ----------
chooseFileBtn.addEventListener('click', () => pdfUpload.click());
pdfUpload.addEventListener('change', () => {
  if (pdfUpload.files && pdfUpload.files.length) {
    chooseFileBtn.textContent = '📂 ' + pdfUpload.files[0].name;
  }
});
uploadBtn.addEventListener('click', async () => {
  if (!pdfUpload.files.length) return alert('Choose a PDF first');
  const f = pdfUpload.files[0];
  const fd = new FormData();
  fd.append('file', f);
  try {
    const r = await fetch('/upload_pdf/', { method:'POST', body: fd });
    const j = await r.json();
    if (j.status === 'success') {
      renderMessage('bot','PDF uploaded and retriever rebuilt. You can ask questions now.');
    } else {
      renderMessage('bot','Upload failed: ' + (j.message || 'unknown error'));
    }
  } catch (e){
    console.error(e);
    renderMessage('bot','Upload failed: network error');
  }
});

// ---------- evaluation (calls backend /chat with pre-made eval questions OR endpoint) ----------
evalBtn.addEventListener('click', () => {
  if (!confirm('Run evaluation with built-in questions?')) return;
  // basic client-side demonstration: ask some questions
  const evalQs = [
    "What is the letter to the son about?",
    "Who wrote the poem 'Commonwealth of Bees'?"
  ];
  (async () => {
    for (const q of evalQs){
      await sendMessage(q);
    }
  })();
});

// ---------- theme toggle ----------
function applyTheme(t){
  document.body.className = t === 'dark' ? 'dark' : 'light';
  localStorage.setItem('theme', t);
}
themeToggle.addEventListener('click', () => {
  const current = document.body.classList.contains('dark') ? 'dark' : 'light';
  applyTheme(current === 'dark' ? 'light' : 'dark');
});
const savedTheme = localStorage.getItem('theme') || 'light';
applyTheme(savedTheme);

// ---------- Speech recognition + TTS ----------
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SR();
  recognition.lang = 'en-IN';
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  recognition.onstart = ()=>{ listening = true; micBtn.classList.add('listening'); voiceStatus.textContent='Listening...'; }
  recognition.onend = ()=>{ listening = false; micBtn.classList.remove('listening'); voiceStatus.textContent='Idle'; }
  recognition.onresult = (e)=>{
    const transcript = Array.from(e.results).map(r => r[0].transcript).join('');
    userInput.value = transcript;
    if (e.results[0].isFinal) sendBtn.click();
  };
  recognition.onerror = (e)=>{ console.error(e); voiceStatus.textContent = 'Mic error'; }
}
micBtn.addEventListener('click', ()=> {
  if (!recognition) return alert('Speech recognition not supported');
  if (!listening) recognition.start(); else recognition.stop();
});

function speakText(text){
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const ut = new SpeechSynthesisUtterance(text);
  ut.rate = 1;
  ut.pitch = 1;
  const voices = speechSynthesis.getVoices();
  if (voices && voices.length){
    const v = voices.find(v => v.lang && v.lang.startsWith('en')) || voices[0];
    if (v) ut.voice = v;
  }
  lastUtterance = ut;
  speechSynthesis.speak(ut);
}
pauseBtn.addEventListener('click', ()=>{
  if (speechSynthesis.speaking && !speechSynthesis.paused){ speechSynthesis.pause(); voiceStatus.textContent='Paused'; }
  else if (speechSynthesis.paused){ speechSynthesis.resume(); voiceStatus.textContent='Resumed'; }
});
replayBtn.addEventListener('click', ()=> { if (lastUtterance){ speechSynthesis.cancel(); speechSynthesis.speak(lastUtterance); voiceStatus.textContent='Replaying'; }});
copyBtn.addEventListener('click', ()=> {
  const m = chatBox.querySelector('.bot:last-child, .bot');
  if (!m) return alert('No answer to copy');
  navigator.clipboard.writeText(m.innerText).then(()=> voiceStatus.textContent='Copied ✅');
});
downloadAnsBtn.addEventListener('click', ()=> {
  const m = chatBox.querySelector('.bot:last-child, .bot');
  if (!m) return alert('No answer to download');
  const blob = new Blob([m.innerText], {type:'text/plain'}); const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'answer.txt'; a.click();
});
downloadChat.addEventListener('click', ()=> {
  const all = Array.from(chatBox.children).map(c=>c.innerText).join('\n\n');
  const blob = new Blob([all], {type:'text/plain'}); const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'chat.txt'; a.click();
});

// ---------- streaming chat send ----------
async function sendMessage(prefilled){
  const text = typeof prefilled === 'string' ? prefilled : userInput.value.trim();
  if (!text) return;
  renderMessage('user', escapeHtml(text));
  userInput.value = '';

  // show typing placeholder while streaming
  const botHolder = document.createElement('div');
  botHolder.className = 'msg bot';
  const typing = document.createElement('div');
  typing.className = 'typing';
  typing.innerHTML = '<span></span><span></span><span></span>';
  botHolder.innerHTML = '<div class="placeholder"><strong>Bot:</strong> </div>';
  botHolder.appendChild(typing);
  chatBox.appendChild(botHolder);
  scrollBottom();

  // abort controller for streaming
  if (streamingController) streamingController.abort();
  streamingController = new AbortController();
  const signal = streamingController.signal;

  try {
    // attempt to stream using fetch readable stream
    const res = await fetch('/chat', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ query: text }),
      signal
    });

    if (!res.ok){
      throw new Error('Server error');
    }

    // if server streams text chunks, read them progressively
    const reader = res.body?.getReader?.();
    if (!reader){
      // fallback: read whole text at once
      const j = await res.json();
      chatBox.removeChild(botHolder);
      renderMessage('bot', j.answer || String(j));
      speakText(j.answer || '');
      return;
    }

    // stream reading
    const decoder = new TextDecoder();
    let done = false;
    let fullText = '';
    // replace typing placeholder with live text container
    const live = document.createElement('div');
    live.className = 'live-bot';
    botHolder.innerHTML = '';
    botHolder.appendChild(live);
    chatBox.appendChild(botHolder);
    scrollBottom();

    while (!done){
      const { value, done: d } = await reader.read();
      if (d) { done = true; break; }
      const chunk = decoder.decode(value, { stream: true });
      fullText += chunk;
      // update live markdown progressively (best-effort)
      live.innerHTML = marked.parse(escapeHtml(fullText));
      scrollBottom();
    }

    // finalization
    chatBox.removeChild(botHolder);
    renderMessage('bot', fullText);
    speakText(fullText);

  } catch (err){
    console.error('chat error', err);
    try { chatBox.removeChild(botHolder); } catch(e){}
    renderMessage('bot', '⚠️ Error fetching answer.');
  } finally {
    streamingController = null;
  }
}

sendBtn.addEventListener('click', () => sendMessage());
userInput.addEventListener('keydown', (e)=> { if (e.key === 'Enter') sendMessage(); });

// ---------- initialization ----------
renderMessage('bot', 'Hey — ask me anything from your English textbook 😄');
loadHistory();
if (chatHistory.length === 0) {
  renderMessage('bot', 'Hey — ask me anything from your English textbook 😄');
}

// restore theme
const theme = localStorage.getItem('theme') || 'light';
document.body.className = theme === 'dark' ? 'dark' : 'light';
