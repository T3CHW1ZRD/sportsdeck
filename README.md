# SportsDeck

A full-stack sports discussion platform built around the English Premier League. Fans can spin up threads on matches and teams, run polls, follow each other, track standings, and read AI-generated match digests; backed by live data from [football-data.org](https://www.football-data.org) and the [HuggingFace Inference API](https://huggingface.co/inference-api).

## Stack

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript 5, Tailwind CSS 4
- **Backend:** Next.js API routes (~48 handlers), Prisma 6
- **Database:** PostgreSQL in production, SQLite for local dev
- **Auth:** JWT access + refresh (`jsonwebtoken`, `bcryptjs`) and Google OAuth via `@react-oauth/google`
- **Cache:** Redis + `node-cache` in-memory fallback to respect upstream rate limits
- **AI:** HuggingFace Inference API for match digests
- **Deploy:** Docker Compose with Caddy and nginx; Postgres in a sibling container

## Features

- Email / password and Google OAuth sign-in with refresh-token rotation
- Auto-created discussion threads per match and per team
- Polls with single- and multi-vote modes; per-user vote tracking
- Match feed, league standings, team pages, user profiles, follow graph
- Moderation flow: reports, appeals, ban / unban, admin panel
- AI-generated post-match digests
- Server-side caching of upstream API responses to stay within free-tier limits

## Data model

`User`, `Team`, `Match`, `Thread`, `Post`, `Poll`, `PollVote`, `PostLike`, `ThreadLike`, `Report`, `Appeal`, `Follow`. Full schema in `prisma/schema.prisma`.

## API surface

REST under `/api`:

| Group | Purpose |
|---|---|
| `auth/` | login, signup, refresh, OAuth callback |
| `users/` | profile CRUD, follow / unfollow |
| `teams/` | team listings and pages |
| `matches/` | fixtures, results, live score sync |
| `standings/` | league table |
| `threads/`, `posts/`, `polls/` | discussions and voting |
| `reports/`, `appeals/`, `admin/` | moderation |
| `feed/` | personalized timeline |
| `stats/` | aggregate metrics |
| `ai/` | HuggingFace-backed digests |

OpenAPI spec at `openapi.yaml`; Postman collection at `postman_collection.json`.

## Local setup

```bash
cp .env.example .env       # fill in football-data, HuggingFace, JWT secrets
npm install
npx prisma migrate dev
npm run dev                # http://localhost:3000
```

Or run the bundled containerized stack:

```bash
docker compose up --build
```

## Production deploy

`Dockerfile` builds a slim Next.js image. `nginx.conf` and `Caddyfile` provide two reverse-proxy options. `docker-entrypoint.sh` runs migrations on boot.

## Notes

- All upstream API calls (football-data.org, HuggingFace) are cached server-side.
- Default admin credentials live in `.env.example`; rotate before any non-local deployment.
