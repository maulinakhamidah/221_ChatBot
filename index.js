const express = require("express");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Izinkan akses dari Live Server (port 5500) atau origin lain (CORS)
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "*");
    res.header("Access-Control-Allow-Methods", "*");
    if (req.method === "OPTIONS") return res.sendStatus(200);
    next();
});

// Sajikan folder public secara absolut agar index.html selalu ditemukan
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

        const apiKey = process.env.OPENAI_API_KEY;

        // Header untuk streaming teks
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        // Jika API Key belum diatur, gunakan mode simulasi (fallback) agar chat tetap berjalan lancar
        if (!apiKey || apiKey.trim() === "") {
            const lastMessage = messages[messages.length - 1]?.content || "";
            let reply = "";

            const lower = lastMessage.toLowerCase().trim();
            if (lower === "p" || lower === "halo" || lower === "hai" || lower === "hi") {
                reply = "Halo! Senang mengobrol dengan Anda. Ada yang bisa saya bantu?";
            } else if (lower.includes("siapa")) {
                reply = "Saya adalah asisten AI Chatbot virtual yang didukung oleh Express.js.";
            } else {
                reply = `Pesan Anda: "${lastMessage}" berhasil diterima! Server AI Chatbot aktif dan berfungsi dengan baik.`;
            }

            // Streaming teks per suku kata agar efek mengetik terlihat halus
            for (let i = 0; i < reply.length; i += 3) {
                res.write(reply.slice(i, i + 3));
                await new Promise(resolve => setTimeout(resolve, 25));
            }

            return res.end();
        }

        // Jika API Key ada, gunakan OpenRouter
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "inclusionai/ling-3.0-tiny",
                messages: messages,
                temperature: 0.7,
                stream: true
            })
        });

        if (!response.ok) {
            const errorData = await response.text();
            console.error("OpenRouter Error:", errorData);

            const reply = "Halo! Server berhasil terhubung, namun OpenRouter sedang sibuk atau API Key memerlukan saldo. Server tetap siap digunakan!";
            for (let i = 0; i < reply.length; i += 3) {
                res.write(reply.slice(i, i + 3));
                await new Promise(resolve => setTimeout(resolve, 25));
            }
            return res.end();
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");

        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();

            if (done) {
                break;
            }

            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split("\n");
            buffer = lines.pop();

            for (const line of lines) {
                const trimmedLine = line.trim();
                
                if (!trimmedLine || trimmedLine.startsWith(":")) {
                    continue;
                }

                if (trimmedLine.startsWith("data: ")) {
                    const data = trimmedLine.slice(6).trim();
                    if (data === "[DONE]") continue;

                    try {
                        const json = JSON.parse(data);
                        const content = json.choices[0].delta?.content;
                        if (content) {
                            res.write(content);
                        }
                    } catch (error) {
                        // ignore parse error on partial lines
                    }
                }
            }
        }

        res.end();

    } catch (error) {
        console.error("Server error:", error);

        if (!res.headersSent) {
            res.status(500).json({
                error: "Terjadi kesalahan pada server"
            });
        } else {
            res.write("Terjadi kesalahan pada server");
            res.end();
        }
    }
});

app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});
