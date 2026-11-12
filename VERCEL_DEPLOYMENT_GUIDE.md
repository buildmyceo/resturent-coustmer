# Zovo Customer Portal — Vercel Deployment Guide

This guide details how to deploy the Zovo Customer Portal (`resturent-coustmer`) to Vercel in less than 2 minutes.

---

## 1. Quick One-Click Deploy (GitHub / GitLab / Bitbucket)

1. Push this repository (`resturent-coustmer`) to GitHub / GitLab / Bitbucket.
2. Go to [vercel.com/new](https://vercel.com/new) and select your repository.
3. In **Project Settings**:
   - **Framework Preset**: `Next.js` (automatically detected)
   - **Root Directory**: `./` (leave default)
   - **Build Command**: `npm run build` (or leave default)
   - **Output Directory**: `.next` (leave default)
4. Add the **Environment Variables** (see below).
5. Click **Deploy**.

---

## 2. Environment Variables Configuration

Configure these in the Vercel Dashboard under **Settings > Environment Variables**:

| Variable Name | Required | Example / Recommended Value | Description |
| :--- | :---: | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | **Yes** | `https://uxnswzyljpwenpinxqee.supabase.co` | Shared Zovo Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Yes** | `eyJhbGciOiJIUzI1NiIsInR5c...` | Supabase public anonymous key |
| `NEXT_PUBLIC_APP_URL` | Optional | `https://customer.zovo.com` | Production customer portal domain |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | Optional | `rzp_test_zovo_demo` | Razorpay key ID for guest checkout |
| `RAZORPAY_KEY_SECRET` | Optional | `your_razorpay_secret` | Razorpay webhook & verification secret |
| `RESEND_API_KEY` | Optional | `re_...` | Resend API key for digital invoice email dispatch |

*(Note: The app includes resilient build-time defaults so missing keys will never cause build failures on Vercel).*

---

## 3. Alternative: Deploy via Vercel CLI

From this project directory:

```bash
# 1. Login to Vercel
npx vercel login

# 2. Deploy Preview
npx vercel

# 3. Deploy Production
npx vercel --prod
```

---

## 4. Key Configurations Included

- **`vercel.json`**: Pre-configured with Next.js framework preset, security headers (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`), and clean URLs.
- **`eslint.config.mjs`**: ESLint 9 configuration compatible with Next.js 16 and React 19 rules.
- **`next.config.ts`**: Turbopack & Webpack dual-build support and wildcard remote image patterns.
- **Dynamic API Routes**: All GET API routes marked with `export const dynamic = 'force-dynamic'` to prevent stale cache hits on Serverless Functions.
