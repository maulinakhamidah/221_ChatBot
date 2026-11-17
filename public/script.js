const chatForm = document.getElementById('chat-form');
const userInput = document.getElementById('user-input');
const chatBox = document.getElementById('chat-box');
const submitBtn = chatForm.querySelector('button');

let messages = [];

chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = userInput.value.trim();
    if (!text) return;

    // Tampilkan pesan user di chat box
    appendMessage('user', text);
    messages.push({ role: 'user', content: text });
    userInput.value = '';

    // Nonaktifkan form saat bot sedang merespons
    userInput.disabled = true;
    if (submitBtn) submitBtn.disabled = true;

    try {
        const apiUrl = (window.location.origin.includes(':5500') || window.location.protocol === 'file:')
            ? 'http://localhost:3000/api/chat'
            : '/api/chat';

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages })
        });

        if (!response.ok) {
            throw new Error('Gagal terhubung ke server');
        }

        const botMessageDiv = appendMessage('bot', '');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let botReply = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            botReply += chunk;
            botMessageDiv.textContent = botReply;
            chatBox.scrollTop = chatBox.scrollHeight;
        }

        messages.push({ role: 'assistant', content: botReply });

    } catch (error) {
        appendMessage('bot', `Maaf, terjadi kesalahan: ${error.message}`);
    } finally {
        userInput.disabled = false;
        if (submitBtn) submitBtn.disabled = false;
        userInput.focus();
    }
});

function appendMessage(role, text) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', role);

    const contentDiv = document.createElement('div');
    contentDiv.classList.add('message-content');
    contentDiv.textContent = text;

    messageDiv.appendChild(contentDiv);
    chatBox.appendChild(messageDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
    return contentDiv;
}
