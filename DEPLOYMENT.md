# MEDRIPPLE Deployment Guide

## 🚀 Quick Deploy to Railway (15 minutes)

Railway is the fastest way to get MEDRIPPLE live with persistent MySQL + AI service.

### Step 1: Create Railway Account
1. Go to https://railway.app
2. Click "Login with GitHub"
3. Authorize Railway to access your repositories

### Step 2: Create New Project
1. Click "New Project"
2. Select "Deploy from GitHub repo"
3. Choose: `HealthCare---Inventory-Management-System`
4. Railway will detect the configuration automatically

### Step 3: Add MySQL Database
1. In your Railway project, click "+ New"
2. Select "Database" → "MySQL"
3. Railway will create a MySQL instance and set `DATABASE_URL` automatically

### Step 4: Configure Environment Variables
Click on your service → "Variables" tab, add:

```
NODE_ENV=production
PORT=3000
AI_SERVICE_URL=http://localhost:8000
JWT_SECRET=medripple_jwt_secret_2026_railway
```

(DATABASE_URL is auto-set by Railway)

### Step 5: Deploy
1. Click "Deploy"
2. Wait 3-5 minutes for build
3. Railway will give you a public URL like: `medripple-production.up.railway.app`

### Step 6: Initialize Database
1. Open Railway's MySQL database
2. Click "Query" tab
3. Run these SQL files in order:
   - Copy content from `database/schema.sql` → Execute
   - Copy content from `database/golden-scenario.sql` → Execute

### Step 7: Update Frontend
1. Go to Vercel dashboard: https://vercel.com
2. Open your `frontend` project
3. Settings → Environment Variables
4. Update `VITE_API_BASE_URL` to your Railway URL + `/api`
   Example: `https://medripple-production.up.railway.app/api`
5. Redeploy frontend

### ✅ Done!
Your frontend will now use the Railway backend with persistent MySQL + AI service.

---

## 🔄 Oracle Cloud Alternative (When Available)

The Oracle VM deployment is ready in `deploy/compose.production.yaml`.

Once Oracle access is working:
1. Terminate the failed `medripple-ops` VM
2. Create new VM with cloud-init from `deploy/cloud-init.yaml`
3. Wait 5 minutes for auto-bootstrap
4. Update Vercel env to use Oracle IP

---

## 🎯 Current Status

✅ **Code**: 100% complete, all tests passing
✅ **Frontend**: Live on Vercel (https://frontend-psi-plum-56.vercel.app)
✅ **Railway Config**: Ready to deploy (this commit)
⏳ **Oracle Config**: Ready but blocked by free-tier quota

**Recommended**: Deploy to Railway now, keep Oracle as backup option.

---

## 💰 Cost Comparison

| Platform | Monthly Cost | Setup Time | Persistence |
|----------|--------------|------------|-------------|
| Railway  | $5 free credit/month | 15 min | ✅ Full |
| Oracle   | $0 forever | 30 min (when working) | ✅ Full |
| Vercel (current) | $0 | Already done | ❌ Fixtures only |

---

## 🆘 Troubleshooting

### Railway build fails?
- Check logs in Railway dashboard
- Ensure all `package.json` dependencies are correct

### Can't connect to MySQL?
- Railway auto-sets `DATABASE_URL`
- Check "Variables" tab to verify it's there

### AI service not responding?
- Check Railway logs: `uvicorn` should show startup
- Both services run in same container on ports 3000 and 8000

### Frontend still shows fixture data?
- Verify `VITE_API_BASE_URL` in Vercel settings
- Must end with `/api`
- Redeploy frontend after changing

---

## 📞 Support

Issues? Check:
1. Railway logs (click on deployment → "Logs")
2. Backend health: `https://your-railway-url.up.railway.app/health`
3. AI health: `https://your-railway-url.up.railway.app:8000/health`

