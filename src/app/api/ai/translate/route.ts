import { requireAuth } from "@/lib/auth";
import { translateToEnglish } from "@/lib/ai";
import prisma from "@/lib/prisma";
import { jsonResponse, errorResponse } from "@/lib/helpers";
import crypto from "crypto";

function hashText(text: string) {
  return crypto.createHash("sha256").update(text.trim()).digest("hex");
}

/**
 * POST /api/ai/translate
 * Translate text to English using AI. Requires authentication.
 * Caches translations in the database so repeated requests reuse existing results.
 */
export async function POST(request: Request) {
  const authUser = await requireAuth(request);
  if (!authUser) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const body = await request.json();
    const { text } = body;

    if (!text || text.trim().length === 0) {
      return errorResponse("Text is required", 400);
    }

    if (text.length > 5000) {
      return errorResponse("Text too long (max 5000 characters)", 400);
    }

    // Check DB cache first
    const textHash = hashText(text);
    const cached = await prisma.translation.findUnique({
      where: { textHash },
    });

    if (cached) {
      return jsonResponse({
        original: text,
        translated: cached.translatedText,
        cached: true,
      });
    }

    // No cache hit — call AI
    const result = await translateToEnglish(text);

    // Store in DB for future lookups
    await prisma.translation.create({
      data: {
        originalText: text,
        translatedText: result.translatedText,
        textHash,
      },
    }).catch((e) => console.error("Translation cache write error:", e));

    return jsonResponse({
      original: text,
      translated: result.translatedText,
      cached: false,
    });
  } catch (error) {
    console.error("Translation error:", error);
    return errorResponse("Translation failed: " + (error instanceof Error ? error.message : String(error)), 500);
  }
}
