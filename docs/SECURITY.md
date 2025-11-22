# Security Guidelines - Relojes BV Beni

## 🔐 Security Measures Implemented

### 1. HTTPS Enforcement
- All sensitive API routes require HTTPS in production
- HTTP requests to `/api/orders`, `/api/payments`, `/api/stripe` return 403
- HSTS headers force browsers to use HTTPS for 1 year

### 2. Stripe Key Protection
- Automatic validation prevents wrong keys in wrong environment
- Development must use `sk_test_*` keys
- Production must use `sk_live_*` keys
- System throws error on misconfiguration

### 3. Security Headers
- Strict-Transport-Security (HSTS)
- X-Frame-Options (clickjacking protection)
- Content-Security-Policy (XSS protection)

### 4. Environment Isolation
- Railway provides environment isolation
- Secrets never committed to Git
- `.env` files in `.gitignore`

### 5. Database Security
- PostgreSQL on private Railway network
- Not exposed to public internet
- SSL connection enforced in production

## 🚨 Security Incidents

If you suspect a security issue:

1. **Do NOT commit sensitive data** (keys, passwords, tokens)
2. **Rotate compromised keys immediately:**
   - Stripe: https://dashboard.stripe.com/apikeys
   - Cloudinary: https://cloudinary.com/console
   - Strapi: Regenerate in Railway environment variables
3. **Check Railway logs** for suspicious activity
4. **Review recent commits** for accidentally committed secrets

## ✅ Security Best Practices

### Development
- Use test mode Stripe keys only
- Never use production database locally
- Keep `.env` in `.gitignore`
- Use strong, unique passwords

### Production
- Rotate secrets regularly (every 90 days recommended)
- Monitor Railway logs for errors
- Keep dependencies updated
- Use live Stripe keys only when ready to accept real payments

### Code Review
- Never hardcode secrets
- Validate all user inputs
- Use parameterized database queries (Strapi does this)
- Review third-party dependencies

## 📋 Security Checklist

### Before First Production Deploy
- [ ] All secrets in Railway environment variables
- [ ] `.env` file not committed to Git
- [ ] HTTPS working on Railway domain
- [ ] Security headers verified
- [ ] Stripe keys validated
- [ ] CORS configured for production frontend

### Regular Maintenance
- [ ] Review Railway logs weekly
- [ ] Update dependencies monthly
- [ ] Rotate secrets quarterly
- [ ] Test security headers quarterly
- [ ] Review CORS settings when adding new frontends

## 🔗 Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Railway Security](https://docs.railway.app/reference/security)
- [Strapi Security](https://docs.strapi.io/dev-docs/security)
- [Stripe Security](https://stripe.com/docs/security)