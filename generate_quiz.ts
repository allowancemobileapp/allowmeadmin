import { GoogleGenAI, Type } from "@google/genai";
import fetch from "node-fetch"; // Might be native in node 18+

export async function generateQuizQuestions(file_url: string, numQuestions: number = 30) {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    let contents: any[] = [
        { text: `You are an expert professor. Generate a ${numQuestions}-question pop quiz based on the course material provided. For each question provide exactly 3 options (option_a, option_b, option_c) and one correct_option ('A', 'B', or 'C'). Make the questions challenging and relevant.` }
    ];

    if (file_url) {
        console.log("Downloading file from:", file_url);
        const fileResponse = await fetch(file_url);
        const arrayBuffer = await fileResponse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64 = buffer.toString('base64');
        const mimeType = fileResponse.headers.get('content-type') || 'application/pdf';
        
        contents.push({
            inlineData: {
                mimeType,
                data: base64
            }
        });
    } else {
        contents.push({ text: "Generate general knowledge questions since no material was provided."});
    }

    const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        question_text: { type: Type.STRING },
                        option_a: { type: Type.STRING },
                        option_b: { type: Type.STRING },
                        option_c: { type: Type.STRING },
                        correct_option: { type: Type.STRING }
                    },
                    required: ['question_text', 'option_a', 'option_b', 'option_c', 'correct_option']
                }
            }
        }
    });

    return JSON.parse(response.text.trim());
}
