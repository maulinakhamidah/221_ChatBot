const express = require("express");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// CORS middleware agar bisa diakses dari Live Server (port 5500) maupun direct port 3000
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(200);
    next();
});

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

        // Header streaming teks murni ke browser
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        // Jika API Key belum diset, fallback ke simulasi respons ramah
        if (!apiKey || apiKey.trim() === "") {
            const lastMessage = messages[messages.length - 1]?.content || "";
            const reply = `Halo! Pesan Anda "${lastMessage}" telah diterima. Server Chatbot aktif dan siap digunakan.`;
            for (let i = 0; i < reply.length; i += 3) {
                res.write(reply.slice(i, i + 3));
                await new Promise(resolve => setTimeout(resolve, 25));
            }
            return res.end();
        }

        // System prompt agar AI selalu ramah, cerdas, dan berbahasa Indonesia yang baik
        const systemPrompt = {
            role: "system",
            content: "Kamu adalah asisten AI yang cerdas, sopan, dan ramah. Berikan jawaban yang akurat, jelas, dan mudah dipahami dalam bahasa Indonesia."
        };

        const chatPayload = [systemPrompt, ...messages];

        // Fungsi pemanggilan OpenRouter
        const callOpenRouter = async (modelName) => {
            return fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey.trim()}`
                },
                body: JSON.stringify({
                    model: modelName,
                    messages: chatPayload,
                    max_tokens: 1000,
                    temperature: 0.7,
                    stream: true
                })
            });
        };

        // Prioritaskan model Google Gemini 2.5 Flash, fallback ke OpenAI GPT-4o Mini
        let response = await callOpenRouter("google/gemini-2.5-flash");
        if (!response.ok) {
            console.warn(`Model gemini-2.5-flash status ${response.status}, mencoba fallback ke openai/gpt-4o-mini...`);
            response = await callOpenRouter("openai/gpt-4o-mini");
        }

        if (!response.ok) {
            const errorText = await response.text();
            console.error("OpenRouter Error:", errorText);
            res.write("Maaf, layanan AI saat ini sedang sibuk. Silakan coba kirim pesan kembali.");
            return res.end();
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop(); // simpan sisa baris yang belum selesai

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith(":") || !trimmed.startsWith("data: ")) {
                    continue;
                }

                const data = trimmed.slice(6).trim();
                if (data === "[DONE]") {
                    continue;
                }

                try {
                    const json = JSON.parse(data);
                    const deltaContent = json.choices?.[0]?.delta?.content;
                    if (deltaContent) {
                        // Tulis langsung delta teks murni ke client (tanpa tambahan data: atau newline ganda)
                        res.write(deltaContent);
                    }
                } catch (e) {
                    // JSON parsing partial chunk - abaikan
                }
            }
        }

        res.end();

    } catch (error) {
        console.error("Server error:", error);
        if (!res.headersSent) {
            res.status(500).send("Terjadi kesalahan pada server.");
        } else {
            res.write("\n\n[Terjadi kesalahan saat memproses jawaban]");
            res.end();
        }
    }
});

app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});
