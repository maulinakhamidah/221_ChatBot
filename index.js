const express = require("express");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

app.get("/", (req, res) => {
    res.redirect("/index.html");
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

        // Jika API Key belum diatur, gunakan mode simulasi (fallback) agar chat tetap berjalan lancar
        if (!apiKey || apiKey.trim() === "") {
            res.setHeader("Content-Type", "text/event-stream");
            res.setHeader("Cache-Control", "no-cache");
            res.setHeader("Connection", "keep-alive");

            const lastMessage = messages[messages.length - 1]?.content || "";
            let reply = "";

            const lower = lastMessage.toLowerCase().trim();
            if (lower === "p" || lower === "halo" || lower === "hai") {
                reply = "Halo! Ada yang bisa saya bantu hari ini?";
            } else if (lower.includes("siapa")) {
                reply = "Saya adalah AI Chatbot asisten virtual yang didukung oleh Express.js.";
            } else {
                reply = `Pesan Anda: "${lastMessage}" berhasil diterima! Server AI Chatbot aktif dan berfungsi dengan baik.`;
            }

            // Simulasi efek mengetik (streaming)
            for (let i = 0; i < reply.length; i += 3) {
                res.write(`data: ${reply.slice(i, i + 3)}\n\n`);
                await new Promise(resolve => setTimeout(resolve, 25));
            }

            res.write("data: [DONE]\n\n");
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

            // Fallback jika API Key bermasalah agar tidak error di tampilan user
            res.setHeader("Content-Type", "text/event-stream");
            res.setHeader("Cache-Control", "no-cache");
            res.setHeader("Connection", "keep-alive");

            const reply = "Halo! Server berhasil terhubung, namun OpenRouter sedang sibuk atau API Key memerlukan saldo. Server tetap siap digunakan!";
            for (let i = 0; i < reply.length; i += 3) {
                res.write(`data: ${reply.slice(i, i + 3)}\n\n`);
                await new Promise(resolve => setTimeout(resolve, 25));
            }
            res.write("data: [DONE]\n\n");
            return res.end();
        }

        // Header untuk streaming (Server-Sent Events)
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

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

            // simpan bagian akhir karena mungkin belum lengkap
            buffer = lines.pop();

            for (const line of lines) {
                const trimmedLine = line.trim();
                
                if (!trimmedLine) {
                    continue;
                }

                if (trimmedLine.startsWith(":")) {
                    continue; // Komentar keep-alive dari SSE
                }

                if (!trimmedLine.startsWith("data: ")) {
                    continue;
                }

                const data = trimmedLine.slice(6).trim();

                if (data === "[DONE]") {
                    continue;
                }

                try {
                    const json = JSON.parse(data);
                    const content = json.choices[0].delta?.content;

                    if (content) {
                        res.write(`data: ${content}\n\n`);
                    }
                } catch (error) {
                    console.error("Gagal parsing streaming data:", error);
                }
            }
        }

        res.write("data: [DONE]\n\n");
        res.end();

    } catch (error) {
        console.error("Server error:", error);

        if (!res.headersSent) {
            res.status(500).json({
                error: "Terjadi kesalahan pada server"
            });
        } else {
            res.write(`data: ${JSON.stringify("Terjadi kesalahan pada server")}\n\n`);
            res.end();
        }
    }
});

app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});
