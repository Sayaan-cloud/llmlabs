const sendBtn = document.getElementById("sendBtn");
const userInput = document.getElementById("userInput");
const messagesBox = document.getElementById("messages");
const chatHistory = document.getElementById("chatHistory");

// SEND MESSAGE
async function sendMessage() {
    const text = userInput.value.trim();
    if (!text) return;

    addMessage(text, "user-message");
    userInput.value = "";

    const response = await fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: text })
    });

    const data = await response.json();

    addMessage(data.answer, "bot-message");
}

// ADD MESSAGE TO CHAT WINDOW
function addMessage(text, className) {
    const div = document.createElement("div");
    div.className = "message " + className;
    div.innerText = text;

    messagesBox.appendChild(div);
    messagesBox.scrollTop = messagesBox.scrollHeight;
}

// EVENT LISTENERS
sendBtn.onclick = sendMessage;

userInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendMessage();
});
