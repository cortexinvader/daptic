const API_KEY = "AIzaSyAhUIwfut8uqIrVyve_wepLXI4aOA7hKFY"; 
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`;

const chatBox = document.getElementById("chatBox");

function sendMessage() {
  const input = document.getElementById("userInput");
  if (!input) {
    console.error('Input element not found!');
    return;
  }
  const userText = input.value.trim().toLowerCase(); // Normalize for keyword matching
  if (!userText) return;
  
  addMessage("user", userText.charAt(0).toUpperCase() + userText.slice(1)); // Capitalize for display
  input.value = "";
  getBotResponse(userText.charAt(0).toUpperCase() + userText.slice(1)); // Pass capitalized for API if needed
}

function addMessage(sender, text) {
  const msg = document.createElement("div");
  msg.className = `message ${sender === 'user' ? 'user-message' : 'bot-message'}`;
  
  if (sender === "bot" && text.includes("```")) {
    const parsed = parseCode(text);
    msg.innerHTML = parsed;
  } else {
    msg.innerText = text;
  }
  
  chatBox.appendChild(msg);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function parseCode(text) {
  return text.replace(/```(\w+)?([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code>${escapeHtml(code.trim())}</code></pre>`;
  });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function getBotResponse(prompt) {
  const lowerPrompt = prompt.toLowerCase();
  
  // Custom response for name queries
  if (lowerPrompt.includes('name') || lowerPrompt.includes('who are you') || lowerPrompt.includes('what is your name')) {
    const nameResponse = "Am D.A.P.T.I.C meaning David Advance Phantom Technology Intelligence Core. I am an AI chat-bot here to assist you with anything you need, so what's on your mind, do you mind to share";
    addMessage("bot", nameResponse);
    return;
  }
  
  // Custom response for creator queries
  if (lowerPrompt.includes('creator') || lowerPrompt.includes('who made you') || lowerPrompt.includes('who created you')) {
    const creatorResponse = `Agboola David Ololade, David Advance Phantom Technology Intelligence Core CEO

Agboola David Ololade is a visionary entrepreneur and tech innovator dedicated to pushing the boundaries of AI and phantom technology. With a passion for creating intelligent companions that advance human potential, he founded D.A.P.T.I.C to bridge the gap between advanced AI and everyday users. His work focuses on ethical AI development, seamless user experiences, and tools that empower creativity and productivity. As CEO, David leads a team committed to making cutting-edge technology accessible and transformative.

He owns several companies including Agbodave Nig Ent, Dylan Graphic, and Vectech, where he drives innovation in tech, graphic design, and enterprise solutions. His notable projects include Chatpals, a conversational AI platform for engaging user interactions, and Skill-Link, a skill-matching tool that connects professionals with opportunities. Through these ventures, David continues to shape the future of AI and digital ecosystems.`;
    addMessage("bot", creatorResponse);
    return;
  }
   // Custom response for creation queries
  if (lowerPrompt.includes('creation')|| lowerPrompt.includes('how were you made') || lowerPrompt.includes('how were you created ')){
    const creationResponse = `I was created by Agboola David Ololade, David Advance Phantom Technology Intelligence Core CEO then was trained by Google and that was how I was made, anything else feel free to ask.`;
    addMessage("bot", creationResponse);
    return;
  }
  
  const thinking = document.createElement("div");
  thinking.className = "message bot-message";
  thinking.innerText = "Typing...";
  chatBox.appendChild(thinking);
  chatBox.scrollTop = chatBox.scrollHeight;
  
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    
    const data = await res.json();
    const aiText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "❌ No response.";
    thinking.remove();
    addMessage("bot", aiText);
  } catch (err) {
    thinking.remove();
    addMessage("bot", "⚠️ Error getting response.");
  }
}

// Fixed: Clear history button/function - Immediate new chat, no confirm
function clearChatHistory() {
  if (chatBox) {
    chatBox.innerHTML = '';
  }
  const input = document.getElementById("userInput");
  if (input) {
    input.value = '';
  }
  console.log('New chat started');
}

// Button handlers—event delegation for full-area clicks (handles nested icons/text)
function setupOptionDelegation() {
  const textarea = document.getElementById("userInput");
  const inputGroup = document.querySelector('.input-group');

  if (!textarea) {
    console.warn('No textarea found—check ID="userInput"');
    return;
  }

  // Helper to set prompt and focus
  function setPromptAndFocus(prompt) {
    textarea.value = prompt;
    textarea.focus();
    textarea.setSelectionRange(prompt.length, prompt.length);
    if (inputGroup) {
      inputGroup.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
    console.log('Prompt set:', prompt);
  }  
  }      
