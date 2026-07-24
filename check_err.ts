import { GoogleGenAI } from "@google/genai";
const ai = new GoogleGenAI({ apiKey: "invalid" });
async function run() {
    try {
        await ai.models.generateContent({ model: "gemini-3.5-flash", contents: "test" });
    } catch (err: any) {
        console.log("Keys:", Object.keys(err));
        console.log("Message:", err.message);
        console.log("Status:", err.status);
    }
}
run();
