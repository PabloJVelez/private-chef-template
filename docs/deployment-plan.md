# Medusa Monorepo Deployment Plan

## Overview
This document outlines the step-by-step deployment plan for the Medusa monorepo to Railway (backend) and Vercel (storefront), following the official Medusa deployment documentation.

## Project Structure
- **Backend**: Medusa v2 API with custom modules (menu, chef-event, resend)
- **Storefront**: React Router v7 (Remix) application
- **Database**: PostgreSQL (Railway)
- **Cache**: Redis (Railway)
- **File Storage**: Local (can be upgraded to S3)
- **Email**: Resend integration

## Pre-Deployment Checklist

### ✅ Environment Setup
- [ ] Node.js 26.13.1 LTS installed
- [ ] Yarn package manager configured
- [ ] Git repository ready
- [ ] Railway CLI installed (`npm install -g @railway/cli`)
- [ ] Vercel CLI installed (`npm install -g vercel`)

### ✅ Code Preparation
- [ ] All changes committed to main branch
- [ ] Tests passing locally
- [ ] Build process working (`yarn build`)
- [ ] Environment variables documented

## Phase 1: Backend Configuration Updates ✅ COMPLETED

### Checkpoint 1.1: Update Medusa Configuration
**Status**: ✅ Completed
**Estimated Time**: 30 minutes

**Tasks**:
- [x] Update `apps/medusa/medusa-config.ts` with worker mode configuration
- [x] Add admin disable configuration
- [x] Verify Redis configuration for production
- [x] Test configuration locally

**Files to Modify**:
- `apps/medusa/medusa-config.ts`

**Commands**:
```bash
cd apps/medusa
yarn typecheck
yarn build
```

### Checkpoint 1.2: Add Predeploy Script
**Status**: ✅ Completed
**Estimated Time**: 15 minutes

**Tasks**:
- [x] Add predeploy script to `apps/medusa/package.json`
- [x] Test migration script locally
- [x] Verify database sync works

**Files to Modify**:
- `apps/medusa/package.json`

**Commands**:
```bash
cd apps/medusa
yarn predeploy
```

### Checkpoint 1.3: Health Check Implementation
**Status**: ✅ Completed
**Estimated Time**: 20 minutes

**Tasks**:
- [x] Create health check endpoint
- [x] Add database connectivity test
- [x] Test health endpoint locally

**Files to Create**:
- `apps/medusa/src/api/health.ts`

**Commands**:
```bash
cd apps/medusa
yarn dev
# Test: curl http://localhost:9000/health
```

## Phase 2: Railway Backend Deployment

### Checkpoint 2.1: Create Railway Project
**Status**: ⏳ Pending
**Estimated Time**: 30 minutes

**Tasks**:
- [ ] Create new Railway project
- [ ] Add PostgreSQL database service
- [ ] Add Redis database service
- [ ] Configure database connection strings

**Railway Steps**:
1. Go to Railway dashboard
2. Click "New Project"
3. Choose "Deploy PostgreSQL"
4. Add Redis service

### Checkpoint 2.2: Deploy Medusa Server
**Status**: ⏳ Pending
**Estimated Time**: 45 minutes

**Tasks**:
- [ ] Create Medusa server service
- [ ] Configure environment variables (server mode)
- [ ] Set start command for server mode
- [ ] Deploy and verify

**Environment Variables (Server Mode)**:
```bash
COOKIE_SECRET=your-super-secure-cookie-secret
JWT_SECRET=your-super-secure-jwt-secret
STORE_CORS=https://your-storefront-domain.vercel.app
ADMIN_CORS=https://your-railway-server-domain.railway.app
AUTH_CORS=https://your-storefront-domain.vercel.app,https://your-railway-server-domain.railway.app
DISABLE_MEDUSA_ADMIN=false
MEDUSA_WORKER_MODE=server
PORT=9000
HOST=0.0.0.0
DATABASE_URL=${{Postgres.DATABASE_PUBLIC_URL}}
REDIS_URL=${{Redis.REDIS_PUBLIC_URL}}
STRIPE_API_KEY=sk_live_...
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=noreply@yourdomain.com
STOREFRONT_URL=https://your-storefront-domain.vercel.app
ADMIN_BACKEND_URL=https://your-railway-server-domain.railway.app
```

**Start Command (Server Mode)**:
```bash
cd .medusa/server && yarn install && yarn run predeploy && yarn run start
```

### Checkpoint 2.3: Deploy Medusa Worker
**Status**: ⏳ Pending
**Estimated Time**: 30 minutes

**Tasks**:
- [ ] Create Medusa worker service
- [ ] Configure environment variables (worker mode)
- [ ] Set start command for worker mode
- [ ] Deploy and verify

**Environment Variables (Worker Mode)**:
```bash
COOKIE_SECRET=your-super-secure-cookie-secret
JWT_SECRET=your-super-secure-jwt-secret
DISABLE_MEDUSA_ADMIN=true
MEDUSA_WORKER_MODE=worker
PORT=9000
HOST=0.0.0.0
DATABASE_URL=${{Postgres.DATABASE_PUBLIC_URL}}
REDIS_URL=${{Redis.REDIS_PUBLIC_URL}}
STRIPE_API_KEY=sk_live_...
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=noreply@yourdomain.com
```

**Start Command (Worker Mode)**:
```bash
cd .medusa/server && yarn install && yarn run start
```

### Checkpoint 2.4: Verify Backend Deployment
**Status**: ⏳ Pending
**Estimated Time**: 20 minutes

**Tasks**:
- [ ] Test health endpoint
- [ ] Verify admin dashboard access
- [ ] Test API endpoints
- [ ] Check database connectivity
- [ ] Verify Redis connectivity

**Test Commands**:
```bash
# Health check
curl https://your-railway-server-domain.railway.app/health

# Admin dashboard
open https://your-railway-server-domain.railway.app/app

# Store API
curl https://your-railway-server-domain.railway.app/store/products
```

## Phase 3: Storefront Deployment (Vercel)

### Checkpoint 3.1: Configure Vercel
**Status**: ⏳ Pending
**Estimated Time**: 30 minutes

**Tasks**:
- [ ] Create `vercel.json` configuration
- [ ] Set up environment variables
- [ ] Configure build settings
- [ ] Test build locally

**Files to Create**:
- `apps/storefront/vercel.json`

**Environment Variables**:
```bash
MEDUSA_BACKEND_URL=https://your-railway-server-domain.railway.app
STRIPE_PUBLISHABLE_KEY=pk_live_...
GOOGLE_MAPS_API_KEY=your-google-maps-api-key
NODE_ENV=production
```

### Checkpoint 3.2: Deploy Storefront
**Status**: ⏳ Pending
**Estimated Time**: 30 minutes

**Tasks**:
- [ ] Connect repository to Vercel
- [ ] Configure build settings
- [ ] Deploy to production
- [ ] Verify deployment

**Commands**:
```bash
cd apps/storefront
vercel --prod
```

### Checkpoint 3.3: Verify Storefront
**Status**: ⏳ Pending
**Estimated Time**: 20 minutes

**Tasks**:
- [ ] Test homepage loading
- [ ] Verify API connectivity
- [ ] Test product pages
- [ ] Check checkout flow
- [ ] Verify cart functionality

## Phase 4: Post-Deployment Setup

### Checkpoint 4.1: Create Admin User
**Status**: ⏳ Pending
**Estimated Time**: 15 minutes

**Tasks**:
- [ ] Install Railway CLI
- [ ] Link to Railway project
- [ ] Create admin user
- [ ] Test admin login

**Commands**:
```bash
npm install -g @railway/cli
railway login
railway link
railway run npx medusa user -e admin@yourdomain.com -p your-secure-password
```

### Checkpoint 4.2: Seed Production Data
**Status**: ⏳ Pending
**Estimated Time**: 30 minutes

**Tasks**:
- [ ] Run production seed script
- [ ] Verify menu data
- [ ] Verify chef event data
- [ ] Test email functionality

**Commands**:
```bash
cd apps/medusa
railway run yarn seed:prod
```

### Checkpoint 4.3: Configure Custom Domains
**Status**: ⏳ Pending
**Estimated Time**: 45 minutes

**Tasks**:
- [ ] Configure custom domain for Railway backend
- [ ] Configure custom domain for Vercel storefront
- [ ] Update DNS settings
- [ ] Update environment variables with new domains
- [ ] Redeploy with new domains

## Phase 5: Monitoring and Testing

### Checkpoint 5.1: Set Up Monitoring
**Status**: ⏳ Pending
**Estimated Time**: 30 minutes

**Tasks**:
- [ ] Configure Railway monitoring
- [ ] Set up Vercel analytics
- [ ] Configure error tracking (Sentry)
- [ ] Set up uptime monitoring

### Checkpoint 5.2: End-to-End Testing
**Status**: ⏳ Pending
**Estimated Time**: 60 minutes

**Tasks**:
- [ ] Test complete user journey
- [ ] Test admin functionality
- [ ] Test payment processing
- [ ] Test email notifications
- [ ] Test file uploads
- [ ] Performance testing

### Checkpoint 5.3: Security Review
**Status**: ⏳ Pending
**Estimated Time**: 30 minutes

**Tasks**:
- [ ] Verify HTTPS is enabled
- [ ] Check CORS configuration
- [ ] Verify environment variables are secure
- [ ] Test authentication flows
- [ ] Review access controls

## Phase 6: Documentation and Handover

### Checkpoint 6.1: Update Documentation
**Status**: ⏳ Pending
**Estimated Time**: 45 minutes

**Tasks**:
- [ ] Document deployment URLs
- [ ] Update environment variable documentation
- [ ] Create troubleshooting guide
- [ ] Document monitoring setup
- [ ] Create rollback procedures

### Checkpoint 6.2: Team Handover
**Status**: ⏳ Pending
**Estimated Time**: 30 minutes

**Tasks**:
- [ ] Share deployment credentials
- [ ] Provide access to monitoring tools
- [ ] Document common issues and solutions
- [ ] Create maintenance schedule

## Risk Mitigation

### High-Risk Items
- [ ] Database migration failures
- [ ] Environment variable misconfiguration
- [ ] CORS issues between services
- [ ] Payment processing setup
- [ ] Email service configuration

### Rollback Plan
1. **Backend Rollback**: Use Railway rollback feature
2. **Storefront Rollback**: Use Vercel rollback feature
3. **Database Rollback**: Restore from backup if needed
4. **Environment Variables**: Revert to previous values

## Success Criteria

### Technical Success
- [ ] All services deployed and accessible
- [ ] Health checks passing
- [ ] Database migrations completed
- [ ] Admin user created and accessible
- [ ] Storefront loading correctly
- [ ] API endpoints responding

### Business Success
- [ ] Users can browse products
- [ ] Cart functionality works
- [ ] Checkout process completes
- [ ] Admin can manage content
- [ ] Email notifications sent
- [ ] Payment processing works

## Timeline Estimate

- **Phase 1**: 1-2 hours
- **Phase 2**: 2-3 hours
- **Phase 3**: 1-2 hours
- **Phase 4**: 1-2 hours
- **Phase 5**: 2-3 hours
- **Phase 6**: 1-2 hours

**Total Estimated Time**: 8-14 hours

## Notes and Decisions

### Environment Variables
- Use Railway template syntax for database URLs
- Generate secure secrets for JWT and cookies
- Configure CORS for production domains

### Custom Modules
- Menu module: ✅ Ready for production
- Chef Event module: ✅ Ready for production
- Resend module: ✅ Ready for production

### Dependencies
- All Medusa v2.7.0 packages aligned
- React Router v7 configured
- Tailwind CSS configured
- TypeScript strict mode enabled

## Next Steps

1. **Start with Phase 1**: Update Medusa configuration
2. **Set up Railway project**: Create database services
3. **Deploy backend**: Server and worker modes
4. **Deploy storefront**: Vercel configuration
5. **Verify deployment**: End-to-end testing
6. **Document everything**: Update team documentation

---

**Last Updated**: December 2024
**Status**: Planning Phase
**Next Review**: After Phase 1 completion 