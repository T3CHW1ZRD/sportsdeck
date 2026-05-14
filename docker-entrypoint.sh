#!/bin/sh
set -e

# Fix uploads directory permissions (volume mounts as root)
mkdir -p /app/public/uploads/avatars
chown -R nextjs:nodejs /app/public/uploads

echo "Running database migrations..."
npx prisma db push --skip-generate

echo "Starting Next.js server..."
exec su-exec nextjs node server.js
