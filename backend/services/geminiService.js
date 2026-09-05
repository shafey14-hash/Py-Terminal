/**
 * geminiService.js
 * -----------------
 * Thin wrapper around the Gemini API. The API key lives only in this
 * process's environment (GEMINI_API_KEY) and is never sent to the browser.
 * If no key is configured, callers get a clear "not configured" error
 * instead of a fake/mocked response.
 */

const fetch = require("node-fetch");

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const GEMINI_URL = (key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;

function isConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

async function askGemini(prompt, { maxOutputTokens = 800 } = {}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    const err = new Error(
      "AI assistant is not configured on this server (GEMINI_API_KEY missing).",
    );
    err.code = "AI_NOT_CONFIGURED";
    throw err;
  }

  const res = await fetch(GEMINI_URL(key), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens, temperature: 0.3 },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gemini API error ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const text =
    data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") ||
    "";
  if (!text) throw new Error("Gemini returned an empty response.");
  return text;
}

const PROMPTS = {
  explainCode: (code) =>
    `You are a concise Python tutor. Explain what the following code does, in plain language, ` +
    `in 3-6 short bullet points. Do not repeat the code back verbatim.\n\nCODE:\n${code}`,

  explainError: (code, error) =>
    `You are a concise Python tutor. A learner ran this code and got this error. ` +
    `Explain in 2-4 sentences what most likely went wrong and why, without yet giving the fix.\n\n` +
    `CODE:\n${code}\n\nERROR:\n${error}`,

  fixError: (code, error) =>
    `You are a Python expert. Given this code and the error it produced, return ONLY a corrected ` +
    `version of the code (no explanation, no markdown fences), fixing the underlying problem.\n\n` +
    `CODE:\n${code}\n\nERROR:\n${error}`,

  suggestImprovement: (code) =>
    `You are a senior Python reviewer. Suggest up to 4 concrete improvements (readability, ` +
    `performance, correctness, or idiomatic style) for this code as short bullet points.\n\nCODE:\n${code}`,

  generateCode: (instruction) =>
    `Write Python code for the following request. Return ONLY the code, no explanation, no markdown fences.\n\n` +
    `REQUEST:\n${instruction}`,

  explainSelection: (selection, context) =>
    `Explain what this specific snippet of Python does, in 2-4 sentences, given the surrounding file for context. ` +
    `Focus only on the snippet.\n\nSNIPPET:\n${selection}\n\nFILE CONTEXT (for reference only):\n${context}`,
};

module.exports = { askGemini, isConfigured, PROMPTS };
