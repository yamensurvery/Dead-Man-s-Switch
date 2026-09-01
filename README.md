# Dead Man's Switch

Make an encrypted message with/without files that are
released to recipients of the user's choice ONLY once
the user has not checked in within the set interval.

Recipients are notified via email as soon as a user has made a switch designated for them, however they CANNOT access it immediately. That is only possible if the user has failed to check in within the set interval. 
If that DOES happen, then if the required amount of recipients choose the unlock option on their end, then the message can be viewed and any files can be downloaded.

## How it works

1. **Create a switch.** In your browser, a random AES-256 key is generated and used to encrypt your message and any attached files.
2. **Split the key.** That key is split with [Shamir's Secret Sharing] into one share per recipient, requiring a configurable threshold to reconstruct.
3. **Distribute shares.** Each recipient gets an email with a unique link containing a secret that only exists in that link — never sent to or stored on the server. That secret decrypts their individual share.
4. **Check in.** As long as you check in before your interval elapses, the switch stays locked and recipients can't do anything with their links.
5. **Trigger.** If you miss a check-in (past the grace period), the switch triggers. Recipients can then submit their shares; once threshold-many are in, any recipient can reconstruct the key client-side and decrypt the message and files.


## Tech stack

- [Next.js](https://nextjs.org/) (App Router) + React + TypeScript
- [Supabase](https://supabase.com/) — Auth, Postgres, and Storage
- Web Crypto API (AES-GCM, PBKDF2/HKDF) for client-side encryption
- Rust compiled to WebAssembly for Shamir's Secret Sharing ([`wasm/dms-shamir-wasm`](./wasm/dms-shamir-wasm))
- [Resend](https://resend.com/) for transactional email

## Getting started

(If you want to run project locally)*

*This is NOT intended

### Prerequisites

- Node.js
- A [Supabase](https://supabase.com/) project
- A [Resend](https://resend.com/) API key

### Environment variables

Create a `.env.local` with:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=
RESEND_API_KEY=
RESEND_FROM_EMAIL=
ADMIN_EMAIL=
CRON_SECRET=
```

### Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project structure

```
app/                  Next.js routes (dashboard, recipient portal, server actions)
lib/                  Client-side crypto, Shamir bindings, Supabase clients
wasm/dms-shamir-wasm/ Rust/WASM Shamir's Secret Sharing implementation
supabase/functions/   Edge functions (switch evaluation / triggering)
```
