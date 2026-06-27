# Portfolio Notes

## Project Summary

BeatPlug is a full-stack beat marketplace that lets customers browse tracks, stream previews, purchase licenses through Stripe, and receive secure delivery links for licensed audio files.

## Showcase Strategy

The production repository remains private because the product is intended to be monetized. This public showcase repo exposes curated implementation samples without publishing the full commercial codebase or private asset repository.

## Technical Highlights

- Migrated media delivery away from a vendor-specific storage sidecar to a private GitHub-backed media proxy
- Adapted an Express app to Vercel serverless runtime
- Kept preview MP3s public while protecting purchased masters behind signed download tokens
- Used Neon Postgres + Drizzle to manage beats, orders, carts, and producers
- Wired Stripe webhooks into server-side order reconciliation and digital fulfillment
- Used Resend for transactional email delivery

## What Reviewers Should Notice

- Candidate-path asset resolution for messy legacy media paths
- Server-side verification of webhook payloads and payment amounts
- Idempotent order creation around Stripe events
- Frontend pagination logic that avoids duplicate cards during repeated fetches
- API responses that remap internal storage paths to safe public proxy routes

## Intentionally Excluded

- Secrets, tokens, and environment files
- Full route surface area
- Private media repository contents
- Commercial content, prices, and operations details beyond what is needed to evaluate the code
