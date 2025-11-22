# Deployment Guide - Relojes BV Beni API

## 📋 Environment Variables Configuration

### Local Development

1. Copy the example file:
   \`\`\`bash
   cp .env.example .env
   \`\`\`

2. Fill in the required variables (see `.env.example` for details)

3. Use **Stripe test keys**:
   - `STRIPE_SECRET_KEY=sk_test_...`
   - `STRIPE_PUBLISHABLE_KEY=pk_test_...`

### Production (Railway)

#### Initial Setup:

1. **Create Railway project:**
   - Connect GitHub repository
   - Railway automatically detects Node.js/Strapi

2. **Add PostgreSQL:**
   - Click "+ New" → "Database" → "PostgreSQL"
   - Railway automatically generates `DATABASE_URL`

3. **Configure environment variables:**

   **Required variables:**
   \`\`\`
   NODE_ENV=production
   HOST=0.0.0.0
   PORT=1337
   URL=https://your-project.up.railway.app
   
   # Strapi Secrets
   APP_KEYS=...
   API_TOKEN_SALT=...
   ADMIN_JWT_SECRET=...
   TRANSFER_TOKEN_SALT=...
   JWT_SECRET=...
   ENCRYPTION_KEY=...
   
   # Database
   DATABASE_CLIENT=postgres
   DATABASE_SSL=false
   DATABASE_URL=${{Postgres.DATABASE_URL}}  # Automatic reference
   
   # Stripe (TEST for staging, LIVE for production)
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_PUBLISHABLE_KEY=pk_test_...
   
   # Cloudinary
   CLOUDINARY_NAME=...
   CLOUDINARY_KEY=...
   CLOUDINARY_SECRET=...
   \`\`\`

4. **Generate public domain:**
   - Settings → Public Networking → "Generate Domain"

#### Deployment:
- Railway auto-deploys on every push to `main`
- Monitor logs in "Deployments" tab

## 🔒 Security

### Stripe Keys by Environment:

| Environment | Secret Key     | Publishable Key | Webhooks          |
|-------------|----------------|-----------------|-------------------|
| Development | `sk_test_*`    | `pk_test_*`     | `whsec_*` (test)  |
| Production  | `sk_live_*`    | `pk_live_*`     | `whsec_*` (live)  |

⚠️ **NEVER use `sk_live_*` keys in development**

### Automatic Validation:
- System automatically validates keys on startup
- Throws error if production keys detected in development
- Warns if test keys detected in production

## 🚀 Deployment Checklist

- [ ] Environment variables configured
- [ ] PostgreSQL connected
- [ ] Correct Stripe keys for environment
- [ ] Public domain generated
- [ ] Strapi admin accessible
- [ ] Integration tests passing
- [ ] Stripe webhooks configured (if applicable)

## 📝 Troubleshooting

### Error: `DATABASE_URL` not found
- Verify PostgreSQL is in "Add Reference" in variables
- Use syntax: `${{Postgres.DATABASE_URL}}`

### Error: 403 Forbidden on endpoints
- Configure public permissions in Strapi admin
- Settings → Users & Permissions → Roles → Public

### Build fails during deploy
- Verify `config/database.ts` handles `DATABASE_URL` correctly
- Check Railway logs for specific errors

## 🔄 Migration from Render to Railway

If migrating from Render:
1. Update `URL` variable to new Railway domain
2. Verify all environment variables are copied
3. Update frontend API URLs to point to Railway
4. Test all endpoints before switching DNS
5. Keep Render service active during transition (optional)

## 📊 Monitoring

- **Railway Dashboard**: Real-time logs and metrics
- **Deployments Tab**: Build and deploy history
- **Metrics Tab**: CPU, memory, and request metrics
- **Logs Tab**: Filter by error level, search patterns

## 🔐 Environment-Specific Configuration

### Development
- Uses local PostgreSQL (Docker)
- Stripe test mode
- Debug logging enabled
- No SSL required

### Production (Railway)
- Managed PostgreSQL
- Stripe live mode (when ready)
- Production logging
- Automatic HTTPS

## 📞 Support

For Railway-specific issues:
- Documentation: https://docs.railway.app
- Community: https://discord.gg/railway

For Strapi issues:
- Documentation: https://docs.strapi.io
- Forum: https://forum.strapi.io