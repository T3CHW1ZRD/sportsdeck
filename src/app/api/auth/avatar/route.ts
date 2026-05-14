import { writeFile, mkdir } from "fs/promises";
import path from "path";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { jsonResponse, errorResponse } from "@/lib/helpers";

/**
 * POST /api/auth/avatar
 * Upload a profile picture. Accepts multipart form data with a "file" field.
 */
export async function POST(request: Request) {
  const authUser = await requireAuth(request);
  if (!authUser) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    // Check if user is banned
    const currentUser = await prisma.user.findUnique({ where: { id: authUser.userId } });
    if (currentUser?.isBanned) {
      return errorResponse("You are banned and cannot upload avatars", 403);
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return errorResponse("No file uploaded", 400);
    }

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return errorResponse("Invalid file type. Allowed: JPEG, PNG, GIF, WebP", 400);
    }

    // Validate file size (2MB max)
    if (file.size > 5 * 1024 * 1024) {
      return errorResponse("File too large. Maximum 5MB", 400);
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Validate magic bytes to ensure it's actually an image
    const header = buffer.slice(0, 12);
    const isJpeg = header[0] === 0xFF && header[1] === 0xD8 && header[2] === 0xFF;
    const isPng = header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47;
    const isGif = header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46;
    const isWebp = header[8] === 0x57 && header[9] === 0x45 && header[10] === 0x42 && header[11] === 0x50;

    if (!isJpeg && !isPng && !isGif && !isWebp) {
      return errorResponse("File is not a valid image", 400);
    }

    // Sanitize and validate extension
    const allowedExts = ["jpg", "jpeg", "png", "gif", "webp"];
    const rawExt = (file.name.split(".").pop() || "").toLowerCase().replace(/[^a-z]/g, "");
    const ext = allowedExts.includes(rawExt) ? rawExt : "jpg";
    const filename = `${authUser.userId}_${Date.now()}.${ext}`;

    // Ensure directory exists
    const uploadDir = path.join(process.cwd(), "public", "uploads", "avatars");
    await mkdir(uploadDir, { recursive: true });

    // Save file
    const filepath = path.join(uploadDir, filename);
    await writeFile(filepath, buffer);

    // Update user avatar URL
    const avatarUrl = `/uploads/avatars/${filename}`;
    await prisma.user.update({
      where: { id: authUser.userId },
      data: { avatar: avatarUrl },
    });

    return jsonResponse({ avatar: avatarUrl });
  } catch (error) {
    console.error("Avatar upload error:", error);
    return errorResponse("Upload failed: " + (error as Error).message, 500);
  }
}
