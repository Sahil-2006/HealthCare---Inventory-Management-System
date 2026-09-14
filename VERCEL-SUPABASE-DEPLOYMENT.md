# MEDRIPPLE - Vercel + Supabase Deployment Guide

## 🎯 Overview
This guide deploys MEDRIPPLE with:
- **Frontend**: Vercel (already deployed)
- **Backend API**: Vercel Serverless Functions
- **Database**: Supabase PostgreSQL (free tier)
- **AI Service**: Vercel Serverless Python Functions

**Cost**: 100% FREE - No payment method required!

---

## 📋 Prerequisites
- GitHub account with access to: plipplop66/HealthCare---Inventory-Management-System
- Vercel account (you already have this)
- Supabase account (free signup)

---

## Step 1: Create Supabase Database (5 minutes)

### 1.1 Sign up for Supabase
1. Go to: https://supabase.com
2. Click "Start your project"
3. Sign in with GitHub (free tier, no credit card)

### 1.2 Create a new project
1. Click "New Project"
2. **Organization**: Choose your org or create one
3. **Name**: `medripple-db`
4. **Database Password**: Create a strong password (SAVE THIS!)
5. **Region**: Choose closest to you (e.g., `Southeast Asia (Singapore)`)
6. Click "Create new project" (takes ~2 minutes)

### 1.3 Get your connection string
1. Once project is ready, click "Connect" (top right)
2. Choose "Connection string" tab
3. Select "URI" mode
4. Copy the connection string that looks like:
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.xxx.supabase.co:5432/postgres
   ```
5. Replace `[YOUR-PASSWORD]` with your actual database password
6. **SAVE THIS** - you'll need it for environment variables

### 1.4 Run the database schema
1. In Supabase dashboard, click "SQL Editor" (left sidebar)
2. Click "New query"
3. Open file: `database/schema-postgres.sql` (from this repo)
4. Copy the ENTIRE contents and paste into the SQL editor
5. Click "Run" (bottom right)
6. You should see "Success. No rows returned"

### 1.5 Load seed data (optional but recommended)
1. Still in SQL Editor, create a new query
2. Copy this modified seed data:

```sql
-- Deterministic MEDRIPPLE golden flow for PostgreSQL
DO $$
DECLARE
  scenario_date DATE := '2026-09-11';
  insulin_id INT;
  vellore_phc_id INT;
BEGIN
  -- Get insulin medicine ID
  SELECT medicine_id INTO insulin_id FROM medicines
  WHERE generic_name = 'Human Insulin' AND strength_value = 100 AND form = 'Vial'
  LIMIT 1;

  -- Get Vellore PHC facility ID
  SELECT facility_id INTO vellore_phc_id FROM facilities 
  WHERE facility_code = 'PHC-VLR-001' LIMIT 1;

  -- Update inventory for critical scenario
  UPDATE inventory i
  SET quantity_on_hand = CASE
    WHEN b.batch_number LIKE '%-B01-26' THEN 12
    ELSE 22
  END,
  status = 'AVAILABLE'
  FROM batches b
  WHERE i.batch_id = b.batch_id
    AND i.facility_id = vellore_phc_id
    AND b.medicine_id = insulin_id;

  -- Update replenishments to delayed
  UPDATE replenishments
  SET expected_arrival_date = scenario_date + INTERVAL '8 days',
      actual_arrival_date = NULL,
      status = 'DELAYED'
  WHERE facility_id = vellore_phc_id
    AND medicine_id = insulin_id
    AND expected_arrival_date >= scenario_date;
END $$;
```

3. Click "Run"
4. You should see "Success"

---

## Step 2: Deploy Backend to Vercel (3 minutes)

### 2.1 Import backend repository
1. Go to: https://vercel.com/new
2. Click "Import Git Repository"
3. Select: `plipplop66/HealthCare---Inventory-Management-System`
4. Click "Import"

### 2.2 Configure backend deployment
1. **Framework Preset**: Other
2. **Root Directory**: Click "Edit" → Select `backend`
3. **Build Command**: `npm install`
4. **Output Directory**: Leave empty
5. **Install Command**: `npm install`

### 2.3 Add environment variables
Click "Environment Variables" and add:

| Name | Value |
|------|-------|
| `DATABASE_URL` | Your Supabase connection string from Step 1.3 |
| `JWT_SECRET` | Generate random 32+ chars: `openssl rand -hex 32` |
| `NODE_ENV` | `production` |
| `PORT` | `10000` |

> **Important**: Make sure `DATABASE_URL` is the full PostgreSQL connection string!

### 2.4 Deploy
1. Click "Deploy"
2. Wait 2-3 minutes
3. Copy your backend URL (e.g., `https://medripple-backend.vercel.app`)
4. Test it: Visit `https://your-backend-url.vercel.app/health`
   - Should return: `{"status":"ok","timestamp":"..."}`

---

## Step 3: Deploy AI Service to Vercel (Optional - 5 minutes)

The AI service requires Python. Vercel supports Python serverless functions.

### 3.1 Create AI service wrapper
The AI service needs to be adapted for Vercel's serverless format. Files are already prepared in `intelligence/api/`.

### 3.2 Deploy AI service
1. Go to: https://vercel.com/new
2. Import same repository
3. **Root Directory**: Click "Edit" → Select `intelligence`
4. Add environment variables:

| Name | Value |
|------|-------|
| `DATABASE_URL` | Your Supabase connection string |
| `ENVIRONMENT` | `production` |

5. Click "Deploy"
6. Copy AI service URL (e.g., `https://medripple-ai.vercel.app`)

---

## Step 4: Update Frontend Environment Variables (2 minutes)

### 4.1 Go to your frontend Vercel project
1. Visit: https://vercel.com/dashboard
2. Click on your frontend project (`frontend-psi-plum-56`)

### 4.2 Update environment variables
1. Click "Settings" → "Environment Variables"
2. Find `VITE_API_BASE_URL`
3. Update its value to your backend URL from Step 2.4
4. If you deployed AI service, add:
   - Name: `VITE_AI_SERVICE_URL`
   - Value: Your AI service URL from Step 3.2

### 4.3 Redeploy frontend
1. Go to "Deployments" tab
2. Click "..." on the latest deployment → "Redeploy"
3. Wait 1-2 minutes

---

## Step 5: Test Your Deployment (3 minutes)

### 5.1 Test backend health
```bash
curl https://your-backend-url.vercel.app/health
```
Expected: `{"status":"ok",...}`

### 5.2 Test database connection
```bash
curl https://your-backend-url.vercel.app/api/facilities
```
Expected: JSON array of facilities

### 5.3 Test frontend
1. Visit: https://frontend-psi-plum-56.vercel.app
2. You should see the MEDRIPPLE dashboard
3. Click "Sign Up" to create an account
4. After signup, you should see facility data, not fixture data

### 5.4 Create test user
```bash
curl -X POST https://your-backend-url.vercel.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "full_name": "Test Admin",
    "email": "admin@medripple.test",
    "password": "SecurePassword123!",
    "role": "ADMIN"
  }'
```

---

## 🎉 Deployment Complete!

Your MEDRIPPLE system is now fully deployed:

- ✅ **Frontend**: https://frontend-psi-plum-56.vercel.app
- ✅ **Backend**: Your Vercel backend URL
- ✅ **Database**: Supabase PostgreSQL (persistent)
- ✅ **AI Service**: Your Vercel AI URL (optional)

---

## 📊 What You Get (Free Tier Limits)

### Vercel Free Tier
- ✅ Unlimited deployments
- ✅ 100 GB bandwidth/month
- ✅ Serverless function execution
- ✅ Automatic HTTPS
- ✅ Global CDN

### Supabase Free Tier
- ✅ 500 MB database space
- ✅ Unlimited API requests
- ✅ Up to 2 GB data transfer
- ✅ Automatic backups (7 days)
- ✅ Connection pooling

---

## 🔧 Troubleshooting

### Backend returns 500 error
**Cause**: Database connection issue
**Fix**:
1. Check `DATABASE_URL` in Vercel environment variables
2. Make sure password is correct (no special URL characters unescaped)
3. Test connection in Supabase SQL Editor

### Frontend shows blank/fixture data
**Cause**: `VITE_API_BASE_URL` not set correctly
**Fix**:
1. Go to Vercel → Frontend project → Settings → Environment Variables
2. Update `VITE_API_BASE_URL` to your backend URL
3. Redeploy frontend

### Database schema errors
**Cause**: PostgreSQL syntax differs from MySQL
**Fix**: Use `database/schema-postgres.sql` (NOT `schema.sql`)

### "Module not found" errors on backend
**Cause**: Missing dependencies
**Fix**:
1. Check `backend/package.json` includes all dependencies
2. Redeploy (Vercel runs `npm install` automatically)

---

## 🔐 Security Recommendations

### Before going to production:
1. **Change default passwords**: Update JWT_SECRET
2. **Enable Row Level Security** in Supabase:
   ```sql
   ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
   -- Add policies for authenticated users only
   ```
3. **Add rate limiting**: Use Vercel's edge config or Upstash Redis
4. **Enable CORS**: Restrict to your frontend domain only
5. **Review user roles**: Audit ADMIN/APPROVER access

---

## 📝 Environment Variables Reference

### Backend (`backend/.env` or Vercel)
```bash
DATABASE_URL=postgresql://postgres:PASSWORD@db.xxx.supabase.co:5432/postgres
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
NODE_ENV=production
PORT=10000
```

### Frontend (`frontend/.env.production` or Vercel)
```bash
VITE_API_BASE_URL=https://your-backend.vercel.app
VITE_AI_SERVICE_URL=https://your-ai.vercel.app
```

### AI Service (`intelligence/.env` or Vercel)
```bash
DATABASE_URL=postgresql://postgres:PASSWORD@db.xxx.supabase.co:5432/postgres
ENVIRONMENT=production
```

---

## 🚀 Next Steps

1. **Custom domain** (optional): Add your own domain in Vercel settings
2. **Monitoring**: Set up Vercel Analytics (free tier available)
3. **Backups**: Supabase auto-backs up, but consider exporting weekly
4. **Scale**: If you exceed free tier, upgrade Supabase (~$25/month)

---

## 💡 Why Vercel + Supabase?

| Feature | Vercel + Supabase | Railway | Render | Oracle Cloud |
|---------|-------------------|---------|--------|--------------|
| **Cost** | FREE forever | Trial expired | FREE with sleep | FREE (quota issues) |
| **Setup time** | 15 min | 10 min | 15 min | 60+ min |
| **Always-on** | ✅ Yes | ❌ Needs paid | ❌ Sleeps | ✅ Yes |
| **Database** | PostgreSQL (Supabase) | PostgreSQL | PostgreSQL | MySQL |
| **Auto-scaling** | ✅ Yes | ✅ Yes | ⚠️ Limited | ❌ No |
| **Serverless** | ✅ Yes | ❌ No | ⚠️ Limited | ❌ No |
| **No payment method** | ✅ Yes | ❌ Requires card | ❌ Requires card | ✅ Yes |

---

## ❓ Need Help?

- **Vercel Docs**: https://vercel.com/docs
- **Supabase Docs**: https://supabase.com/docs
- **GitHub Issues**: plipplop66/HealthCare---Inventory-Management-System/issues

---

**Deployment Date**: 2026-09-14  
**Version**: 1.0.0  
**Status**: Production Ready ✅
