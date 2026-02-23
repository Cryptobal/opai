import OpenAI from "openai";

// Placeholder para build (Vercel): evita fallo si OPENAI_API_KEY no está en build-time
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "sk-build-placeholder",
});
