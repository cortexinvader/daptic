/* ==============================================================
   D.A.P.T.I.C. – Full Front-end Chat Client (Flask + Typing Animation)
   ============================================================== */

const API = {
  generate: "/api/generate",
  history: "/api/history",
  currentUser: "/api/current_user"
};

const chatBox = document.getElementById("chatBox");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const clearBtn = document.getElementById("clearBtn");

// ------------------------------------------------------------------
// Utility: Safe HTML escaping
// ------------------------------------------------------------------
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ------------------------------------------------------------------
// Render a single message (user or bot)
// ------------------------------------------------------------------
function addMessage({ role, message, created_at }) {
  const wrapper = document.createElement("div");
  wrapper.className = `message ${role}-message`;
  wrapper.dataset.timestamp = created_at || new Date().toISOString();

  if (role === "bot" && /```[\s\S]*```/.test(message)) {
    wrapper.innerHTML = renderCodeBlocks(message);
  } else {
    wrapper.innerHTML = `<p>${escapeHtml(message)}</p>`;
  }

  chatBox.appendChild(wrapper);
  chatBox.scrollTop = chatBox.scrollHeight;
}

// ------------------------------------------------------------------
// Render markdown-style code blocks safely
// ------------------------------------------------------------------
function renderCodeBlocks(text) {
  return text.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
    const escaped = escapeHtml(code.trim());
    const language = lang ? `language-${lang}` : "";
    return `<pre><code class="${language}">${escaped}</code></pre>`;
  });
}

// ------------------------------------------------------------------
// Show typing animation (CSS bouncing dots)
// ------------------------------------------------------------------
function showTyping() {
  const wrapper = document.createElement("div");
  wrapper.className = "message bot-message typing";
  wrapper.id = "typingBubble";

  const typing = document.createElement("div");
  typing.className = "bot-typing";
  typing.innerHTML = `<span></span><span></span><span></span>`;

  wrapper.appendChild(typing);
  chatBox.appendChild(wrapper);
  chatBox.scrollTop = chatBox.scrollHeight;
  return wrapper;
}
function hideTyping(bubble) {
  if (bubble && bubble.parentNode) bubble.remove();
}

// ------------------------------------------------------------------
// Load conversation history
// ------------------------------------------------------------------
async function loadHistory() {
  try {
    const res = await fetch(API.history, { credentials: "include" });
    const { history = [] } = await res.json();
    chatBox.innerHTML = "";
    history.forEach(msg => addMessage(msg));
  } catch (err) {
    console.error("History load error:", err);
  }
}

// ------------------------------------------------------------------
// Send prompt to backend
// ------------------------------------------------------------------
async function sendPrompt(prompt) {
  if (!prompt.trim()) return;

  // 1. Add user message
  addMessage({ role: "user", message: prompt });

  // 2. Show typing animation
  const typingBubble = showTyping();

  try {
    const res = await fetch(API.generate, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt })
    });

    const data = await res.json();

    // Remove typing bubble
    hideTyping(typingBubble);

    if (!res.ok) {
      addMessage({ role: "bot", message: data.error || "Server error" });
      return;
    }

    // 3. Simulate typing delay then show real reply
    const baseDelay = 600;
    const msPerChar = 10;
    const randomExtra = Math.random() * 300;
    const totalDelay = baseDelay + data.reply.length * msPerChar + randomExtra;

    const tempTyping = showTyping(); // show again for final typing

    setTimeout(() => {
      hideTyping(tempTyping);
      addMessage({ role: "bot", message: data.reply });
    }, totalDelay);

  } catch (err) {
    hideTyping(typingBubble);
    console.error(err);
    addMessage({ role: "bot", message: "Network error – please try again." });
  }
}

// ------------------------------------------------------------------
// Clear chat
// ------------------------------------------------------------------
function clearChat() {
  if (!confirm("Start a fresh conversation?")) return;
  chatBox.innerHTML = "";
  // Optional: call backend to wipe DB rows
  // fetch("/api/clear", { method: "POST", credentials: "include" });
}

// ------------------------------------------------------------------
// Prompt suggestions
// ------------------------------------------------------------------
function setupPromptSuggestions() {
  const suggestions = [
    "Tell me about D.A.P.T.I.C.",
    "Who created you?",
    "Write a Python function to reverse a string.",
    "Explain quantum computing simply."
  ];

  const container = document.createElement("div");
  container.className = "suggestions";

  suggestions.forEach(txt => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = txt;
    btn.onclick = () => {
      userInput.value = txt;
      userInput.focus();
    };
    container.appendChild(btn);
  });

  const inputGroup = document.querySelector(".input-group");
  if (inputGroup) inputGroup.before(container);
}

// ------------------------------------------------------------------
// Event Listeners
// ------------------------------------------------------------------
function init() {
  // Send button
  if (sendBtn) {
    sendBtn.addEventListener("click", () => {
      const text = userInput.value.trim();
      if (text) {
        sendPrompt(text);
        userInput.value = "";
      }
    });
  }

  // Enter key (Shift+Enter = newline)
  if (userInput) {
    userInput.addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const text = userInput.value.trim();
        if (text) {
          sendPrompt(text);
          userInput.value = "";
        }
      }
    });
  }

  // Clear button
  if (clearBtn) clearBtn.addEventListener("click", clearChat);

  // Load history & suggestions
  loadHistory();
  setupPromptSuggestions();
}

// ------------------------------------------------------------------
// Start on DOM ready
// ------------------------------------------------------------------
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
