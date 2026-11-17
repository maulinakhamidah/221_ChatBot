const express = require("express");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Izinkan CORS dari Live Server atau port lain
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "*");
    res.header("Access-Control-Allow-Methods", "*");
    if (req.method === "OPTIONS") return res.sendStatus(200);
    next();
});

// Sajikan folder public secara absolut
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.post("/api/chat", async (req, res) => {
    try {
        const messages = req.body.messages;

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({
                error: "Messages harus berupa array"
            });
        }

        const apiKey = process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY;

        // Header streaming teks langsung ke browser
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        if (apiKey && apiKey.trim() !== "") {
            // Gunakan OpenRouter dengan model canggih openai/gpt-4o-mini
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey.trim()}`
                },
                body: JSON.stringify({
                    model: "openai/gpt-4o-mini",
                    messages: [
                        { role: "system", content: "Anda adalah asisten AI Chatbot yang cerdas, serius, sopan, dan berpengetahuan luas dalam bahasa Indonesia. Berikan jawaban yang tepat, jelas, dan edukatif." },
                        ...messages
                    ],
                    temperature: 0.7,
                    stream: true
                })
            });

            if (response.ok) {
                const reader = response.body.getReader();
                const decoder = new TextDecoder("utf-8");
                let buffer = "";

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split("\n");
                    buffer = lines.pop();

                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed || trimmed.startsWith(":")) continue;

                        if (trimmed.startsWith("data: ")) {
                            const data = trimmed.slice(6).trim();
                            if (data === "[DONE]") continue;

                            try {
                                const json = JSON.parse(data);
                                const text = json.choices[0]?.delta?.content;
                                if (text) {
                                    res.write(text);
                                }
                            } catch (e) {}
                        }
                    }
                }

                return res.end();
            } else {
                const err = await response.text();
                console.error("OpenRouter API Error:", response.status, err);
            }
        }

        // Cadangan jika API Key belum terpasang
        const lastMsg = messages[messages.length - 1]?.content || "";
        res.write(`Halo! Server aktif, namun API Key belum terbaca atau saldo habis. Pertanyaan Anda: "${lastMsg}".`);
        res.end();

    } catch (error) {
        console.error("Server error:", error);
        if (!res.headersSent) {
            res.status(500).json({ error: "Terjadi kesalahan pada server" });
        } else {
            res.write("Terjadi kesalahan pada server");
            res.end();
        }
    }
});

app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});
