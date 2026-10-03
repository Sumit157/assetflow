FROM node:24-alpine

RUN corepack enable

WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/config/package.json packages/config/
COPY packages/shared/package.json packages/shared/
COPY packages/types/package.json packages/types/

RUN pnpm install --frozen-lockfile

COPY . .

EXPOSE 5175

CMD ["sh", "-c", "pnpm dev:web -- --host 0.0.0.0"]
