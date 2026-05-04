const fs = require("fs/promises");
const pdfParse = require("pdf-parse");

const PROMPT =
  process.env.AI_SUMMARY_PROMPT ||
  "Hay tom tat noi dung su kien nay trong 150 chu, tieng Viet, ngan gon va de hieu.";
const MAX_CHARS = Number(process.env.AI_SUMMARY_MAX_CHARS || 12000);
const GEMINI_ENDPOINT =
  process.env.GEMINI_API_URL ||
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";
const OPENAI_ENDPOINT =
  process.env.OPENAI_API_URL || "https://api.openai.com/v1/chat/completions";

function normalizeText(rawText) {
  if (!rawText) {
    return "";
  }
  return rawText.replace(/\s+/g, " ").trim();
}

async function extractPdfText(filePath) {
  const buffer = await fs.readFile(filePath);
  const parsed = await pdfParse(buffer);
  return normalizeText(parsed.text || "");
}

async function summarizeWithGemini(text) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  const response = await fetch(`${GEMINI_ENDPOINT}?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `${PROMPT}\n\n${text}`,
              },
            ],
          },
        ],
        generationConfig: {
          maxOutputTokens: Number(process.env.AI_SUMMARY_MAX_TOKENS || 300),
          temperature: Number(process.env.AI_SUMMARY_TEMPERATURE || 0.3),
        },
      }),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini error: ${response.status} ${errorBody}`);
  }

  const payload = await response.json();
  const summary = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!summary) {
    throw new Error("Gemini returned empty summary");
  }

  return summary.trim();
}

async function summarizeWithOpenAI(text) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const response = await fetch(OPENAI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: PROMPT },
        { role: "user", content: text },
      ],
      max_tokens: Number(process.env.AI_SUMMARY_MAX_TOKENS || 300),
      temperature: Number(process.env.AI_SUMMARY_TEMPERATURE || 0.3),
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI error: ${response.status} ${errorBody}`);
  }

  const payload = await response.json();
  const summary = payload?.choices?.[0]?.message?.content;
  if (!summary) {
    throw new Error("OpenAI returned empty summary");
  }

  return summary.trim();
}

async function generateSummaryFromPdf(filePath) {
  const text = await extractPdfText(filePath);
  const trimmed = text.slice(0, MAX_CHARS);
  if (!trimmed) {
    throw new Error("PDF has no readable text");
  }

  if (process.env.GEMINI_API_KEY) {
    return summarizeWithGemini(trimmed);
  }

  if (process.env.OPENAI_API_KEY) {
    return summarizeWithOpenAI(trimmed);
  }

  throw new Error("No AI provider configured");
}

module.exports = {
  generateSummaryFromPdf,
};
