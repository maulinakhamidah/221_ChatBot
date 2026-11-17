const express = require("express");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config();

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

        const geminiApiKey = process.env.GEMINI_API_KEY || (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith("AIza") ? process.env.OPENAI_API_KEY : null);

        // Header untuk streaming teks langsung ke browser
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        // 1. JIKA MENGGUNAKAN GOOGLE GEMINI API
        if (geminiApiKey) {
            try {
                const geminiContents = messages.map(m => ({
                    role: m.role === "assistant" ? "model" : "user",
                    parts: [{ text: m.content }]
                }));

                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        contents: geminiContents,
                        systemInstruction: {
                            parts: [{ text: "Anda adalah asisten AI Chatbot yang cerdas, sopan, serius, dan akurat dalam bahasa Indonesia." }]
                        }
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "Maaf, Gemini tidak dapat memberikan respon.";

                    for (let i = 0; i < reply.length; i += 4) {
                        res.write(reply.slice(i, i + 4));
                        await new Promise(r => setTimeout(r, 15));
                    }
                    return res.end();
                } else {
                    const errText = await response.text();
                    console.error("Gemini API Error:", errText);
                }
            } catch (geminiErr) {
                console.error("Gemini Error:", geminiErr);
            }
        }

        // 2. JIKA GEMINI API KEY BELUM DIMASUKKAN, GUNAKAN ENGINE AI CERDAS LANGSUNG
        try {
            const aiResponse = await fetch("https://text.pollinations.ai/", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messages: [
                        { role: "system", content: "Anda adalah asisten AI Chatbot cerdas dan serius berbahasa Indonesia. Berikan jawaban yang tepat, informatif, dan akurat." },
                        ...messages
                    ]
                })
            });

            if (aiResponse.ok) {
                const aiText = await aiResponse.text();
                for (let i = 0; i < aiText.length; i += 4) {
                    res.write(aiText.slice(i, i + 4));
                    await new Promise(r => setTimeout(r, 15));
                }
                return res.end();
            }
        } catch (freeErr) {
            console.error("AI Error:", freeErr);
        }

        res.write("Maaf, server AI sedang sibuk. Silakan coba kirim pesan Anda kembali.");
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
