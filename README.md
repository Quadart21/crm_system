# App Template

Full-stack React application template with TypeScript, Vite, Hono, and Prisma ORM.

## Tech Stack

**Frontend:**

- React 19
- TypeScript
- Vite
- Tailwind CSS 4
- TanStack Query
- shadcn/ui components
- [typed-rpc](https://github.com/fgnass/typed-rpc) client
- Client-side Adaptive AI SDK

**Backend:**

- Hono web framework
- typed-rpc for type-safe API
- Prisma ORM
- SQLite database (via better-sqlite3)
- Server-side Adaptive AI SDK

## Installation

```bash
npm install
```

## Development

Start the development server (runs migrations, Vite dev server, and API server):

```bash
npm run dev
```

This runs:

- Database migrations via Prisma
- Vite dev server on port `PORT` (auto-assigned by the adaptive AI runtime)
- API server on port `PORT + 1`

## Code Quality

```bash
npm run check    # Type check
npm run lint     # Lint code
npm run format   # Format code with Prettier
```

## How It Works

Your app runs as two separate processes that work together:

1. **Vite Dev Server** (port specified in `.env.development` as `PORT`)
   - Serves your React frontend with hot module replacement
   - Provides fast refresh during development
   - Handles static assets

2. **API Server** (automatically runs on `PORT + 1`)
   - Runs your backend procedures
   - Handles RPC requests from the frontend
   - Processes server-side logic

The Vite dev server automatically proxies API requests (anything starting with `/api/`) to your backend server, so from your frontend's perspective, everything appears to run on a single origin.

**Port Configuration**: The development server port is set via `PORT` in `.env.development`. We strongly recommend keeping the default port unless you have a very specific and good reason to change it. If you need to change the port, simply update `PORT` in `.env.development` - never edit `vite.config.ts` directly for port changes.

You have **full flexibility** to create new files and organize your code however makes sense for your project.

## Development Workflow

### Debugging with Log Files

This template writes development logs to two files in your project root:

- **`vite-dev.log`**: Contains Vite frontend server logs
  - Module loading and hot reload events
  - Build errors and warnings
  - Asset serving issues

- **`api-dev.log`**: Contains backend server logs
  - Database migration output
  - API server startup and errors
  - RPC endpoint execution logs
  - Your custom `console.log()` statements

```bash
# View recent logs
tail -n 50 vite-dev.log    # Last 50 lines of frontend logs
tail -n 50 api-dev.log     # Last 50 lines of backend logs

# Search for errors
grep -i error vite-dev.log
grep -i error api-dev.log
```

### Making Changes

1. **Backend changes** (`src/api/procedures.ts`):
   - Add or modify exported functions
   - The API server restarts automatically
   - Frontend can immediately call new functions

2. **Frontend changes** (`src/App.tsx`):
   - Edit React components
   - Vite provides instant hot module replacement
   - See changes immediately without full page reload

3. **Adding dependencies**:
   - Just import any npm package in your code
   - Packages are auto-installed during the build

### Testing RPC Endpoints

**When to test:**

- After creating or modifying any backend procedure in `src/api/procedures.ts`
- Before considering a backend change complete
- When debugging unexpected behavior in your app
- After database schema changes that affect backend logic

**How to test:**

Use the `run_rpc_endpoint` tool — do not make direct HTTP requests via curl:

```typescript
// ✅ Correct way: Use the run_rpc_endpoint tool
// This handles authentication, request context, and proper routing
run_rpc_endpoint({
  methodName: "createPost",
  params: [{ title: "Test Post", content: "Hello World" }],
  onBehalfOfCurrentUser: true,
});
```

**Why not use curl or direct HTTP requests?**

The API server requires specific headers (`x-request-id`, `x-channel-id`) and proper request context that the `run_rpc_endpoint` tool handles automatically. Direct curl requests will fail with a 400 error as a result.

### File Organization

Create files to keep your code organized:

```typescript
// src/lib/format.ts (you create this)
export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

// src/api/procedures.ts
import { formatCurrency } from "@/lib/format";

export async function getFormattedPrice() {
  return formatCurrency(99.99);
}
```

## Environment Variables

Environment mode behavior is:

- **Default state (expected):** only development exists, and requests route to development.
- **After enabling Production Mode in app settings:** a production environment is introduced and becomes the default environment that traffic routes to. The existing development environment becomes a draft environment for staging changes.
- **After Production Mode is enabled:** requests route to production by default, while development holds unpublished changes.

Environment variables are managed through `.env.development` during development.
When production mode is enabled for the app, a separate `.env.production` is created and used for production scripts:

```bash
# .env.development
# ... platform variables like PORT and VITE_APP_ID are auto-assigned

# Your custom variables
MY_API_KEY=secret_key_here
VITE_MY_CUSTOM_VARIABLE=some_value
```

### Variable Access

**Backend** (can access all variables):

```typescript
import { env } from "@/lib/env";
// src/api/procedures.ts
const apiKey = env.MY_API_KEY;
```

**Frontend** (only VITE\_ prefixed variables):

```typescript
import { env } from "@/lib/env";
// src/App.tsx
const myVar = env.VITE_MY_CUSTOM_VARIABLE;
```

### Validation

Validate and expose required variables in `src/lib/env.ts`:

```typescript
import { z } from "zod";

const publicSchema = z.object({
  VITE_MY_CUSTOM_VARIABLE: z.string().min(1),

  // ... rest of the VITE_ variables
});

const serverSchema = z.object({
  MY_API_KEY: z.string().min(1),

  // ... rest of the variables
});
```

## Database

This template uses SQLite with Prisma ORM for persistent data storage.

### Schema Definition

Define your data models in `schema.prisma`:

```prisma
model User {
  // Adaptive AI platform columns (do not change)
  id     String  @id
  name   String?
  image  String?
  handle String?

  // Add your custom columns here
  email     String?  @unique
  createdAt DateTime @default(now())
  posts     Post[]
}

model Post {
  id        String   @id @default(cuid())
  title     String
  content   String
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  createdAt DateTime @default(now())
}
```

### Querying Data

Use the Prisma Client in your backend procedures:

```typescript
// src/api/procedures.ts
import { db } from "@/api/db";

export async function getPosts() {
  return await db.post.findMany({
    include: {
      user: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function createPost(
  title: string,
  content: string,
  userId: string,
) {
  return await db.post.create({
    data: { title, content, userId },
  });
}
```

### Migrations

Migrations should be run automatically.
If needed, you can run them manually as follows:

```bash
# Development (creates migration and applies it)
npm run dev:migrations

# Production (applies pending migrations; only available after production mode is enabled for the app)
npm run prod:migrations
```

For more information on Prisma queries and schema design, see: https://www.prisma.io/docs

## SDK

The Adaptive AI SDK is integrated for both client and server usage. Use the provided utility functions to interact with the Adaptive AI services:

- Client example: `import { getBaseUrl } from '@adaptive-ai/sdk/client'`
- Server example: `import { getAuth } from '@adaptive-ai/sdk/server'`

More details can be found in the [Adaptive AI documentation]($INTERNAL_PLATFORM_URL/llms.md).

## Development Docs

### Frontend Development

- **[Frontend Guidelines](./docs/frontend.md)**: React with TanStack Query, data fetching patterns, mutations, optimistic updates, loading states, and file handling
- **[Design System](./docs/design.md)** ⭐ **Read this first** before creating or updating UI: Responsive patterns, dark mode system, component usage, and UX best practices

### Backend Development

- **[Backend Guidelines](./docs/backend.md)**: Typed-RPC procedures, Hono server framework, type safety, private functions, error handling, and code organization patterns
- **[Database Documentation](./docs/database.md)**: Prisma ORM with SQLite, schema design, migrations, and query patterns
