# Frontend Setup Guide

## Quick Start

### Prerequisites
- Node.js 16+ installed
- Backend API running on `http://localhost:4000`
- Google OAuth credentials (optional, but required for login)

### Installation Steps

#### 1. Install Dependencies
```bash
cd client
npm install
```

#### 2. Create .env.local
```bash
cp .env.example .env.local
```

Edit `.env.local`:
```
VITE_API_URL=http://localhost:4000
VITE_GOOGLE_CLIENT_ID=your_google_client_id_here
```

#### 3. Get Google OAuth Client ID (Optional for Development)

**Option A: Skip Google (Development Only)**
- Login won't work without this, but you can mock it

**Option B: Setup Real Google OAuth**

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Enable "Google+ API"
4. Create OAuth 2.0 credentials (Web application)
5. Add authorized redirect URIs:
   - `http://localhost:5173/login` (development)
   - `https://yourdomain.com/login` (production)
6. Copy Client ID to `.env.local`

#### 4. Run Development Server
```bash
npm run dev
```

Opens at `http://localhost:5173`

#### 5. Build for Production
```bash
npm run build
```

Output in `dist/` folder

## Pages & Features

### Public Pages
- `/login` - Google OAuth login

### Student Pages (after login)
- `/workshops` - Browse all workshops
- `/workshops/:id` - Workshop details
- `/register/:workshopId` - Register for workshop
- `/registration/:registrationId/payment` - Confirm payment

### Admin Pages (admin role only)
- `/admin` - Dashboard with statistics
- `/admin/workshops/new` - Create new workshop
- `/admin/workshops/:id/edit` - Edit workshop

## Testing

### Manual Testing Checklist

#### Login Flow
- [ ] Can see Google login button at `/login`
- [ ] Clicking button redirects to Google
- [ ] After Google callback, redirected to `/workshops`
- [ ] User info displayed in navbar
- [ ] Logout button works

#### Workshop List
- [ ] Can see list of workshops
- [ ] Can click workshop to see details
- [ ] Pagination/filtering (if implemented)
- [ ] Admin sees "+ Create Workshop" button
- [ ] Student sees "Register" button

#### Workshop Detail
- [ ] Full workshop info displayed
- [ ] Thumbnail image loads
- [ ] Admin sees Edit/Delete buttons
- [ ] Student sees Register button
- [ ] Available slots calculated correctly

#### Registration
- [ ] Form fields present (name, email, phone, etc.)
- [ ] Required fields validated
- [ ] Submitting creates registration
- [ ] Redirects to payment page
- [ ] Registration ID displayed

#### Payment
- [ ] Shows registration details
- [ ] Amount pre-filled
- [ ] Can enter transaction reference
- [ ] Success message after submit
- [ ] Returns to /workshops

#### Admin Dashboard
- [ ] Can see statistics (workshops, registrations, revenue)
- [ ] Workshop table displays all workshops
- [ ] Can navigate to create/edit/delete

## Troubleshooting

### Issue: API calls failing (CORS errors)
**Solution**: Ensure backend is running on port 4000 and CORS is enabled

### Issue: Google login not working
**Solution**: 
- Check VITE_GOOGLE_CLIENT_ID is set correctly
- Verify redirect URI matches in Google Console
- Check that backend `/api/auth/login` endpoint works

### Issue: Pages not loading
**Solution**:
- Check console for errors (F12)
- Verify all files created in src/ folder
- Ensure imports are correct

### Issue: Styling looks broken
**Solution**:
- Rebuild Tailwind: might need `npm run dev` restart
- Check that Tailwind CSS is imported in main.jsx
- Verify node_modules installed: `npm install`

## Environment Variables Reference

| Variable | Default | Required |
|----------|---------|----------|
| VITE_API_URL | http://localhost:4000 | Yes |
| VITE_GOOGLE_CLIENT_ID | - | For OAuth (optional for dev) |

## Build & Deploy

### Development
```bash
npm run dev
```

### Staging/Production
```bash
npm run build          # Creates optimized dist/
npm run preview        # Test production build locally

# Or deploy dist/ folder to your hosting:
# - Vercel: `vercel deploy`
# - Netlify: `netlify deploy --prod --dir=dist`
# - nginx: Copy dist/* to /var/www/html/
# - AWS S3: `aws s3 sync dist/ s3://bucket-name`
```

### Nginx Config Example
```nginx
server {
  listen 80;
  server_name yourdomain.com;
  
  root /var/www/html;
  index index.html;
  
  location / {
    try_files $uri /index.html;  # Required for SPA routing
  }
}
```

## Performance Tips

1. **Code Splitting**: Routes automatically lazy-loaded by React Router
2. **Image Optimization**: Use responsive img with srcset
3. **Bundle Analysis**: `npm run build -- --profile`
4. **Lighthouse**: Check DevTools → Lighthouse tab

## File Structure After Build
```
dist/
├── index.html
├── assets/
│   ├── index-xxxxx.js
│   ├── index-xxxxx.css
│   └── vendor-xxxxx.js
└── vite.svg
```

## Common Commands

```bash
# Development
npm run dev              # Start dev server

# Production
npm run build            # Build for production
npm run preview          # Preview production build
npm run lint             # Run ESLint

# Cleaning
rm -rf node_modules dist/  # Clean dependencies & build
npm install             # Reinstall everything
```

## Project Stats
- 6 main pages
- 7+ API service methods
- 1 auth context
- 1 layout component
- ~600 lines of component code

## Next Steps

1. ✅ Install dependencies
2. ✅ Setup .env.local
3. ✅ Run `npm run dev`
4. ✅ Test login flow
5. ✅ Test workshop browsing
6. ✅ Test admin features
7. ✅ Deploy to production

## Support

Check files:
- Frontend README: `client/README.md`
- Backend specs: `blueprint/specs/`
- Acceptance tests: `blueprint/specs/acceptance_tests.md`
