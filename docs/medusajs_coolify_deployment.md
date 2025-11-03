# MedusaJS v2 Deployment on Coolify – Full Game Plan

## 0) What you need up front
- **A VPS** (Ubuntu/Debian preferred) with at least **2 vCPU / 4 GB RAM / 40 GB disk**.
- **Root or sudo** access + ports **22, 80, 443** open.
- **Two or three domains/subdomains** you control:
  - `api.example.com` (Medusa server / API)
  - `admin.example.com` (Medusa admin UI if you host it separately)
  - optionally `store.example.com` (your storefront)
- A **git repo** for your Medusa v2 project.

> Tip: If you only want to deploy to the same machine that runs Coolify, you’ll add a single “Local Docker” server. If you want a separate app box, you’ll add a “Remote (Agent/SSH) server.”

---

## 1) Stand up Coolify itself
1) Point a domain to the machine that will run Coolify (e.g., `coolify.example.com` → your VPS IP).
2) Install Coolify on that machine (it runs via Docker and ships with Traefik + Let’s Encrypt).
3) In the Coolify onboarding wizard:
   - Set your **base domain** (the domain you just pointed).
   - Enable **automatic SSL** (Let’s Encrypt).  
   - Create your **team** / first **project**.

---

## 2) Add at least one Server (this is what the video skips)
In Coolify: **Servers → Add**. You have two common choices:

- **This server (Local Docker Engine)**  
  Use this if you want to deploy apps on the same machine that runs Coolify. Coolify will talk directly to its own Docker.

- **Remote server (via Agent / SSH)**  
  Use this if your apps should run on a different VPS. Coolify will show you a one-liner to run on the remote box; it installs the agent and registers the server.

> After adding, you should no longer see “No servers found.” You’ll see your new server listed and “Healthy”.

---

## 3) Create your databases inside Coolify (or use managed)
Coolify can spin up Dockerized services for you.

**PostgreSQL**
- Add **PostgreSQL** service.
- Set a **strong password** and a **database name** (e.g., `medusa`).
- Note the **connection URL** like:  
  `postgresql://postgres:<pass>@<service-host>:5432/<db>`  
  Use it as `DATABASE_URL`.

**Redis**
- Add a **Redis** service.
- Set a password if offered.
- Note the **connection URL** like:  
  `redis://default:<pass>@<service-host>:6379`  
  Use it as `REDIS_URL`.

---

## 4) Decide how you’ll run your Medusa apps
You’ll deploy **two app resources** from the same repo:

- **Medusa Server (API)** — handles HTTP requests.
- **Medusa Worker** — processes background jobs.

Both resources will share most env vars; the Worker gets a couple of different ones.

---

## 5) Environment variables (Medusa v2 essentials)

**Required / Common**
```
NODE_ENV=production
PORT=9000
DATABASE_URL=postgresql://postgres:<pass>@<host>:5432/<db>
REDIS_URL=redis://default:<pass>@<host>:6379
JWT_SECRET=<long-random-string>
COOKIE_SECRET=<long-random-string>
BACKEND_URL=https://api.example.com
MEDUSA_ADMIN_URL=https://admin.example.com
ADMIN_CORS=https://admin.example.com,http://localhost:5173
STORE_CORS=https://store.example.com,http://localhost:8000
```

**Server vs Worker**
- **Server app**
  ```
  WORKER_MODE=server
  DISABLE_ADMIN=false
  ```
- **Worker app**
  ```
  WORKER_MODE=worker
  DISABLE_ADMIN=true
  ```

**Optional (S3/file storage)**
```
FILE_PROVIDER=s3
S3_ENDPOINT=<endpoint>
S3_REGION=<region>
S3_BUCKET=<bucket-name>
S3_ACCESS_KEY_ID=<key>
S3_SECRET_ACCESS_KEY=<secret>
```

---

## 6) Build & start commands

**If using Dockerfile**
- Define your install, build, expose 9000, and CMD.  
- Create **two app resources**: one starting the server, one starting the worker.

**If using Node/Buildpack**
- **Build command:** `npm ci && npm run build`
- **Start (Server):** `npm run start`
- **Start (Worker):** `npm run start:worker`
- **Expose Port:** `9000`

---

## 7) Domains & SSL
For each app:
- Server → `api.example.com`
- Admin UI (if separate) → `admin.example.com`
- DNS A records → server’s public IP.
- Enable **auto SSL** (Let’s Encrypt).

---

## 8) First deploy (order matters)
1) Databases first.
2) Deploy **Server app** → run DB migrations if needed.
3) Deploy **Worker app**.

---

## 9) Create the admin user
Inside the **Server container**:
```
node ./node_modules/@medusajs/cli/bin/medusa.js user -e you@example.com -p "supersecure"
```
(or a script like `npm run create-admin`).

---

## 10) Verify & monitor
- Logs → server should say “listening on :9000”.
- Hit `https://api.example.com/store/regions` to test.
- Health checks should return HTTP 200.

---

## 11) (Optional) Admin UI & Storefront
- Deploy separately if you have them (static/Next/Vite).
- Domains: `admin.example.com`, `store.example.com`.
- Update `ADMIN_CORS` / `STORE_CORS` envs.

---

## 12) Common pitfalls
- **No servers found** → Add a Server first.
- **App unreachable** → Check port (must be 9000), DNS, or SSL wait time.
- **Migrations not applied** → Run manually.
- **Worker idle** → Ensure `WORKER_MODE=worker` + same secrets.
- **CORS errors** → Ensure correct domains in CORS env vars.
- **File uploads fail** → Configure S3 provider vars.

---
