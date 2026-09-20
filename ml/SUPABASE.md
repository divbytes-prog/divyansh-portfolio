# Supabase feedback storage

MoodTrip supports a hybrid feedback system:

- **Local**: instant personalization stays in the browser and works offline.
- **Global**: anonymous Good Pick / Not For Me interactions are stored in Supabase and returned as population priors.
- **Safe fallback**: if Supabase is missing or down, the API returns local mode instead of breaking recommendations.

## Setup

1. Apply `ml/supabase_schema.sql` to the Supabase project.
2. Add these server-side Vercel environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. Redeploy.

The service-role key is used only by `api/feedback.js`; it is never exposed to the browser.

Every row stores the 22-feature production rank vector, model score, outcome, mood/category/place context, and anonymous session ID. That makes the table directly usable for later retraining and offline evaluation.
