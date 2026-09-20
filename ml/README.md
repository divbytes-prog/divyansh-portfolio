# MoodTrip ML training + evaluation

This folder contains the reproducible offline ML pipeline behind MoodTrip's production recommender.

## What is trained

1. **Rule-based baseline** — the original hand-tuned mood/distance/rating formula.
2. **Content-based baseline** — cosine similarity between the 8D mood vector and 8D place-vibe vector.
3. **Random Forest regressor** — nonlinear supervised ranking baseline.
4. **XGBoost ranker/regressor** — boosted-tree supervised baseline.
5. **Neural recommender** — MLP trained on the full context vector.
6. **Teacher ensemble** — 65% neural + 20% Random Forest + 15% XGBoost.
7. **Production distilled neural ranker** — a small 16×8 MLP trained to imitate the teacher ensemble for fast browser inference.

The browser combines the distilled neural score with content similarity, exact-place feedback and a contextual Bayesian score. When Supabase is configured, local feedback is merged with anonymous global priors.

## Feature vector

The learned ranker receives 22 features:

- 8 mood-vector dimensions
- 8 place-vibe dimensions
- normalized distance
- normalized rating
- crowd-fit score
- solo/group flag
- cyclic hour-of-day sine
- cyclic hour-of-day cosine

## Benchmark protocol

The ranking benchmark is a deterministic **controlled preference simulation**, generated with seed `20260920`.

- 1,800 sessions
- 10 candidate places per session
- 18,000 candidate rows
- 450 held-out test sessions

For every test session, the 3 highest latent-utility candidates are treated as relevant and each model is evaluated at K=5 using:

- Precision@5
- Recall@5
- NDCG@5
- MAE
- inference latency per 1,000 candidates

This is intentionally disclosed as a controlled benchmark. It is **not claimed to be a real-user study**.

## Mood-text benchmark

The script also builds a 600-phrase, 12-mood curated text benchmark and evaluates a TF-IDF bigram + multinomial logistic-regression baseline on a stratified 150-phrase holdout. The deeper app path remains the on-demand quantized RoBERTa emotion classifier.

## Online learning

MoodTrip records **Good Pick** and **Not For Me** immediately on-device and can persist the same anonymous events to Supabase. Every recommendation slate is also logged as an impression set for later ranking evaluation. For each `mood × place-category` pair, the browser maintains a Beta posterior:

- positive feedback increments α
- negative feedback increments β
- posterior mean + a small exploration bonus becomes the contextual-bandit score

This score immediately changes the ranking without retraining the offline model. Exact-place feedback adds a stronger item-level boost/demotion. See `ml/MODEL_CARD.md` and `ml/SUPABASE.md` for the global-learning and real-data retraining design.

## Reproduce

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r ml/requirements.txt
python ml/train_moodtrip.py
npm run build
```

The script rewrites `ml/model_artifacts.json`, which is imported by `src/moodtripML.js`.
