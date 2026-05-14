import { InferenceClient } from "@huggingface/inference";
import crypto from "crypto";
import { getCached, setCached, CACHE_KEYS, STATIC_TTL } from "./cache";
import { getErrorMessage } from "@/types/api";

/**
 * Hugging Face Inference API client for AI-powered features.
 * - Sentiment analysis
 * - Content moderation (toxicity detection)
 * - Translation
 * - Text generation (daily digest)
 */

const HF_TOKEN = process.env.HUGGINGFACE_API_TOKEN;
const client = new InferenceClient(HF_TOKEN);

/**
 * Analyze sentiment of text.
 * Returns: positive, negative, or neutral with a score.
 */
async function analyzeSentiment(text: string) {
  try {
    const result = await client.textClassification({
      model: "distilbert-base-uncased-finetuned-sst-2-english",
      inputs: text,
    });
    // Result format: [{label: "POSITIVE", score: 0.99}, {label: "NEGATIVE", score: 0.01}]
    if (Array.isArray(result) && result.length > 0) {
      const sorted = [...result].sort((a, b) => b.score - a.score);
      const top = sorted[0];
      return {
        label: top.label.toLowerCase(),
        score: top.score,
        details: sorted,
      };
    }
    return { label: "neutral", score: 0.5, details: result };
  } catch (error) {
    const message = getErrorMessage(error);
    console.error("Sentiment analysis error:", message);
    return { label: "neutral", score: 0.5, error: message };
  }
}

/**
 * Detect toxicity/inappropriateness in text.
 * Returns a toxicity verdict with score.
 */
async function detectToxicity(text: string) {
  try {
    // Check cache first
    const hash = crypto.createHash("sha256").update(text.trim()).digest("hex");
    const cacheKey = CACHE_KEYS.TOXICITY(hash);
    const cached = await getCached(cacheKey);
    if (cached) return cached;

    const result = await client.textClassification({
      model: "unitary/toxic-bert",
      inputs: text,
    });
    if (Array.isArray(result) && result.length > 0) {
      const toxicLabel = result.find((r) => r.label === "toxic");
      const score = toxicLabel ? toxicLabel.score : 0;
      // Higher threshold for sports forums — trash talk is normal,
      // only flag genuinely harmful content (hate speech, slurs, threats)
      const response = {
        isToxic: score > 0.5,
        score: score,
        details: result,
      };
      await setCached(cacheKey, response, STATIC_TTL);
      return response;
    }
    const response = { isToxic: false, score: 0, details: result };
    await setCached(cacheKey, response, STATIC_TTL);
    return response;
  } catch (error) {
    const message = getErrorMessage(error);
    console.error("Toxicity detection error:", message);
    return { isToxic: false, score: 0, error: message };
  }
}

/**
 * Translate text to English.
 */
async function translateToEnglish(text: string, sourceLang = "auto") {
  try {
    void sourceLang;
    const result = await client.translation({
      model: "Helsinki-NLP/opus-mt-mul-en",
      inputs: text,
    });
    if (result && result.translation_text) {
      return { translatedText: result.translation_text };
    }
    return { translatedText: text, note: "Translation unavailable" };
  } catch (error) {
    const message = getErrorMessage(error);
    console.error("Translation error:", message);
    return { translatedText: text, error: message };
  }
}

/**
 * Generate text using a language model (for daily digest).
 */
async function generateText(content: string) {
  try {
    const result = await client.chatCompletion({
      model: "meta-llama/Llama-3.1-8B-Instruct",
      messages: [{ 
        role: "user", 
        content: `You are a sports journalist writing a daily digest for a football fan community called SportsDeck. Using the data below, write an engaging summary in **Markdown format** that helps users catch up on the week's events.

Structure your response with these Markdown sections:

## Match Recap
Highlight notable results, upsets, or high-scoring games from the recent matches. Use bullet points for individual results.

## Standings Snapshot
Comment on the current top of the table — who's leading, any tight races, or noteworthy positions.

## Community Buzz
Summarize the hottest discussions happening on the platform, noting which topics are generating the most engagement.

**Rules:**
- Use proper Markdown: headers (##), bold (**text**), bullet points (- ), etc.
- Keep the tone conversational and enthusiastic but professional.
- Do not mention any users or admins by username.
- Do not invent any facts — only reference the data provided.
- If a section has no data, skip it entirely.
- Keep it concise — aim for 200-400 words.

--- RAW DATA ---
${content}
--- END DATA ---

Write the digest now in Markdown:`
      }],
      max_tokens: 500,
      temperature: 0.7,
    });
    if (result?.choices?.[0]?.message?.content) {
      return { text: result.choices[0].message.content };
    }
    return { text: "", note: "Generation failed" };
  } catch (error) {
    const message = getErrorMessage(error);
    console.error("Text generation error:", message);
    return { text: "", error: message };
  }
}

export {
  analyzeSentiment,
  detectToxicity,
  translateToEnglish,
  generateText,
};
