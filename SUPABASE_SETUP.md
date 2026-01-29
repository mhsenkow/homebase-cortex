# Supabase Setup Guide

> **AI Note**: Complete Supabase setup for production. See [DEPLOYMENT.md](./DEPLOYMENT.md) for deployment context.

**Complete guide for Supabase Storage and database setup (free tier).**

This project uses Supabase for:
- **PostgreSQL Database** - Production database hosting
- **Storage** - Image hosting for site images, library images, and floor plans

---

## Table of Contents

1. [Quick Setup](#quick-setup-automated)
2. [Storage Buckets](#storage-buckets)
3. [Vercel Deployment](#vercel-deployment)
4. [Troubleshooting](#troubleshooting)

---

## Quick Setup (Automated)

### Step 1: Get Your Supabase Credentials

1. **Go to https://supabase.com** and sign in (or create an account)
2. **Create a new project** (or use existing):
   - Click "New Project"
   - Choose organization
   - Enter project name (e.g., "homebase-cortex")
   - Enter database password (save this!)
   - Choose region
   - Click "Create new project"
   - Wait 2-3 minutes for setup to complete

3. **Get your API keys**:
   - In your project dashboard, go to **Settings** → **API**
   - Copy these values:
     - **Project URL** (e.g., `https://xxxxx.supabase.co`)
     - **anon public** key (starts with `eyJ...`)
     - **service_role** key (starts with `eyJ...`) - **Keep this secret!**

### Step 2: Add Credentials to .env File

Add these to your `.env` file in the project root:

```env
# Supabase Storage (for image hosting)
NEXT_PUBLIC_SUPABASE_URL=<your_supabase_url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your_anon_key>
SUPABASE_SERVICE_ROLE_KEY=<your_service_role_key>
```

**For Vercel deployment**, also add these in:
- Vercel Dashboard → Your Project → Settings → Environment Variables

### Step 3: Run the Setup Script

Once credentials are in your `.env` file, run:

```bash
npm run setup:supabase
```

This will automatically:
- ✅ Create `site-images` bucket (public)
- ✅ Create `library-images` bucket (public)
- ✅ Create `map-data` bucket (public)
- ✅ Verify the setup

### Step 4: Verify Setup

1. Go to **Storage** in your Supabase dashboard
2. You should see three buckets:
   - `site-images` (public)
   - `library-images` (public)
   - `map-data` (public)

If they're not marked as "public", click on each bucket → Settings → Toggle "Public bucket" to ON.

### Step 5: Run Database Migration

```bash
npx prisma db push
```

Or create a migration:
```bash
npx prisma migrate dev --name use_image_urls
```

---

## Storage Buckets

The application requires three Supabase storage buckets:

| Bucket | Purpose | Size Limit | MIME Types |
|--------|---------|------------|------------|
| `site-images` | Site/store images | 2MB | image/jpeg, image/png |
| `library-images` | Library component images | 2MB | image/jpeg, image/png |
| `map-data` | Floor plan/map images | 50MB | image/jpeg, image/png, application/pdf |

### Manual Bucket Creation

If the setup script doesn't work, create buckets manually:

1. Go to your Supabase project dashboard: https://supabase.com/dashboard
2. Navigate to **Storage** in the left sidebar
3. Click **"New bucket"** for each bucket:

**For each bucket:**
- **Name**: Use exact names above (case-sensitive)
- **Public bucket**: ✅ **ON** (important!)
- **File size limit**: See table above
- **Allowed MIME types**: See table above
- Click **"Create bucket"**

### Verify Buckets Are Public

After creating each bucket:
1. Click on the bucket name
2. Go to **Settings** tab
3. Ensure **"Public bucket"** toggle is **ON**

---

## Vercel Deployment

### ⚠️ Important: Use Connection Pooler

When deploying to Vercel, you **MUST** use Supabase's connection pooler, not the direct connection.

**Why?**
- Vercel functions are serverless and short-lived
- Direct connections (port 5432) don't work well with serverless
- Connection pooler (port 6543) manages connections efficiently

### Get the Correct Connection String

1. Open your Supabase project dashboard
2. Go to **Settings** → **Database**
3. Scroll to **"Connection string"** section
4. **IMPORTANT**: Check the box **"Use connection pooling"**
5. Select **"Transaction mode"** (recommended for serverless)
6. Copy the connection string

The connection string should look like:
```
postgresql://postgres.[PROJECT_REF]:[YOUR_PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
```

**Key differences from direct connection:**
- Port: `6543` (not `5432`)
- Host: `aws-0-[region].pooler.supabase.com` (not `db.[ref].supabase.co`)
- Username format: `postgres.[PROJECT_REF]` (not just `postgres`)

### Update Vercel Environment Variable

1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Find `DATABASE_URL`
3. Replace it with the **pooler connection string** (port 6543)
4. Save and redeploy

### Example

**❌ Wrong (Direct Connection - Won't work on Vercel):**
```
postgresql://postgres:password@db.xxxxx.supabase.co:5432/postgres
```

**✅ Correct (Connection Pooler - Works on Vercel):**
```
postgresql://postgres.xxxxx:password@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true
```

---

## Troubleshooting

### Connection Issues

#### "Can't reach database server" error
- ✅ Make sure you're using the **pooler connection** (port 6543)
- ✅ Check "Use connection pooling" is enabled in Supabase
- ✅ Verify the password is correct
- ✅ Make sure the region matches your project

#### Circuit Breaker / Connection Limit
If you're hitting connection limits:
1. Wait 5-10 minutes for connections to close
2. Check connection count in Supabase dashboard (Settings → Database → Connection Pooling)
3. Circuit breaker resets automatically

#### Check Connection Pooling Settings
**Location:** Settings → Database → Connection Pooling

- **Pool Size:** Should show available connections (free tier: 15)
- **Max Client Connections:** Free tier: 200
- **Current Connections:** Check if it's at the limit

### Storage Issues

#### "Bucket not found" error
- Verify bucket names match exactly (case-sensitive): `site-images`, `library-images`, `map-data`
- Check that buckets are marked as **Public**
- Verify Supabase credentials are set correctly

#### Images not uploading
- Check Supabase credentials in `.env`
- Verify buckets are created and public
- Check server logs for upload errors

#### Images not displaying
- Verify bucket is set to **Public**
- Check that URLs are being saved to database
- Check browser console for CORS errors

#### Still using base64?
- Supabase not configured → using fallback
- Check environment variables are set correctly
- Check server logs for "Supabase upload failed" messages

### Network Restrictions

**Location:** Settings → Database → Network Restrictions

Should say: "Your database can be accessed by all IP addresses"

If there are restrictions and Vercel IPs are blocked:
- Click "Add restriction" or remove restrictions to allow all IPs

### Quick Check Commands

```bash
# Verify Supabase credentials are set
npx tsx scripts/check-supabase-env.ts

# Run setup script
npm run setup:supabase
```

---

## How It Works

1. **Image Upload**: When an image is uploaded:
   - Client compresses image (400px max, 0.6 quality, 200KB max)
   - Sends base64 to server
   - Server uploads to Supabase Storage
   - Server saves URL in database (or base64 if Supabase not configured)

2. **Image Retrieval**: 
   - Server returns URL from database
   - Frontend displays image from URL (or base64 fallback)
   - Images are served via Supabase CDN

3. **Fallback**: If Supabase is not configured, images are stored as base64 in the database (old behavior)

## Free Tier Limits

- **Storage**: 1GB free
- **Bandwidth**: 2GB/month free
- **Files**: Unlimited
- **Database Connections**: 15 pooled, 200 max

For most use cases, this is sufficient. Images are optimized to ~50-150KB each.

---

## Additional Resources

- [Supabase Connection Pooling Docs](https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler)
- [Vercel + Supabase Guide](https://vercel.com/guides/nextjs-prisma-postgres)
- [Supabase Storage Docs](https://supabase.com/docs/guides/storage)
