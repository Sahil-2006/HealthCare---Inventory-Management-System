# 🚀 MEDRIPPLE Quick Start - Vercel + Supabase

**Time to Deploy**: ~15 minutes  
**Cost**: 100% FREE (no credit card needed!)

---

## 📋 What You Need

1. ✅ GitHub account (you have this - `plipplop66/HealthCare---Inventory-Management-System`)
2. ✅ Vercel account (you have this - frontend already deployed)
3. ⏳ Supabase account (free signup - no credit card)

---

## 🎯 3 Simple Steps

### Step 1: Create Supabase Database (5 min)

1. Go to: **https://supabase.com** → Sign in with GitHub
2. Click **"New Project"**
   - Name: `medripple-db`
   - Password: Create a strong one (save it!)
   - Region: Choose closest to you
3. Wait ~2 minutes for project to be ready
4. Click **"SQL Editor"** (left sidebar)
5. Open file: `database/schema-postgres.sql` from the repo
6. Copy ALL the content → Paste into SQL Editor → Click **"Run"**
7. Click **"Connect"** button (top right)
   - Choose "URI" tab
   - Copy the connection string
   - Replace `[YOUR-PASSWORD]` with your actual password
   - **SAVE THIS** - you'll need it next!

---

### Step 2: Deploy Backend to Vercel (5 min)

1. Go to: **https://vercel.com/new**
2. Click **"Import Git Repository"**
3. Select: `plipplop66/HealthCare---Inventory-Management-System`
4. **Root Directory**: Click "Edit" → Select `backend` folder
5. **Environment Variables** - Add these:

| Name | Value |
|------|-------|
| `DATABASE_URL` | Your Supabase connection string from Step 1 |
| `JWT_SECRET` | `medripple-prod-secret-2026-change-this-to-random-string` |
| `NODE_ENV` | `production` |

6. Click **"Deploy"** → Wait 2-3 minutes
7. **Copy your backend URL** (e.g., `medripple-backend.vercel.app`)

---

### Step 3: Connect Frontend to Backend (3 min)

1. Go to: **https://vercel.com/dashboard**
2. Click on your **frontend** project (`frontend-psi-plum-56`)
3. Click **"Settings"** → **"Environment Variables"**
4. Find `VITE_API_BASE_URL` → Click "Edit"
5. Change value to: `https://your-backend-url.vercel.app` (from Step 2)
6. Click **"Save"**
7. Go to **"Deployments"** tab → Click "..." on latest → **"Redeploy"**

---

## ✅ Test It!

### Test Backend
```bash
curl https://your-backend-url.vercel.app/health
```
Should return: `{"status":"ok",...}`

### Test Frontend
1. Visit: **https://frontend-psi-plum-56.vercel.app**
2. Click **"Sign Up"**
3. Create account: 
   - Name: Your name
   - Email: your-email@example.com
   - Password: Strong password
   - Role: ADMIN
4. After login, you should see:
   - ✅ Real facility data (not "Demo Facility")
   - ✅ Dashboard with cards
   - ✅ Navigation working

---

## 🎉 Done!

Your MEDRIPPLE system is now **LIVE** with:
- ✅ **Frontend**: https://frontend-psi-plum-56.vercel.app
- ✅ **Backend**: Your Vercel URL
- ✅ **Database**: Supabase PostgreSQL (persistent!)
- ✅ **Authentication**: Sign-up/sign-in working
- ✅ **100% FREE**: No payment method needed

---

## 🆘 Troubleshooting

### Backend shows 500 error
**Fix**: Check `DATABASE_URL` is correct in Vercel backend settings

### Frontend shows blank page
**Fix**: Make sure `VITE_API_BASE_URL` points to your backend URL, then redeploy

### Can't sign up
**Fix**: Make sure backend health endpoint works first

---

## 📚 Full Documentation

For detailed info, see:
- **Complete Guide**: `VERCEL-SUPABASE-DEPLOYMENT.md`
- **Status**: `DEPLOYMENT-STATUS.md`
- **API Docs**: `docs/api-contract.md`

---

## 🔐 Security Note

The JWT_SECRET provided above is just a placeholder. For production, generate a secure random string:

```bash
# On Windows PowerShell:
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))

# Or online: https://generate.plus/en/base64
```

Then update it in Vercel backend environment variables.

---

## 💡 What's Next?

1. **Custom Domain** (optional): Add in Vercel settings
2. **More Data**: Add facilities/medicines via API
3. **AI Service**: Deploy intelligence service for forecasting (optional)
4. **Monitoring**: Enable Vercel Analytics (free tier)

---

**Deployment Date**: September 14, 2026  
**Version**: 1.0.0  
**All Code Pushed**: ✅ Commit `0fc92e4`
