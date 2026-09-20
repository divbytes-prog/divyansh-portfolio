# MoodTrip model & data card

## Production objective

MoodTrip ranks nearby places for a user's current mood while keeping physical distance as a strong product constraint. The production score combines:

1. distilled neural suitability score,
2. content similarity between mood and place-vibe vectors,
3. contextual Bayesian preference learning,
4. exact-place feedback adjustment.

## Production model

The browser model is a compact 16×8 multilayer perceptron distilled from a teacher ensemble:

- Neural recommender: 65%
- Random Forest: 20%
- XGBoost: 15%

The student receives 22 contextual features and is small enough to run synchronously in the browser.

## Cold-start data

The initial ranking benchmark uses a deterministic controlled preference simulation:

- 1,800 recommendation sessions
- 18,000 candidate rows
- 450 held-out sessions
- fixed seed: 20260920

It is used to compare model families and bootstrap the student. It is **not presented as real-user evidence**.

## Real interaction data

MoodTrip now logs anonymous recommendation events through `api/feedback.js` when Supabase is configured.

### Impression events

For every result slate, the system records:

- anonymous session ID,
- recommendation/slate ID,
- rank position,
- mood and category,
- place identifier,
- 22-feature rank vector,
- model/neural score,
- distance/rating context,
- model version.

### Explicit feedback events

Good Pick and Not For Me record explicit positive/negative outcomes against the same recommendation ID.

No account identity, exact home address, email, or raw free-text mood entry is stored in the feedback table.

## Transition to real-data training

`ml/train_moodtrip.py` automatically checks for Supabase data.

- Fewer than 120 explicit labels: synthetic pretraining remains the production model.
- 120+ explicit labels with both classes: real explicit feedback is split by recommendation/session and used to fine-tune the distilled student.
- Real recommendation slates are evaluated separately using implicit-feedback Precision@5, Recall@5 and NDCG@5.
- Synthetic and real-data metrics remain separate in the artifact.

This threshold prevents the first handful of users from overfitting the global model.

## Explainability

Production explanations use **Integrated Gradients** through the actual distilled neural network.

- neutral contextual baseline,
- 48 integration steps by default,
- per-feature attributions,
- grouped into Mood, Place Vibe, Distance, Rating, Crowd, Group Mode and Time Context,
- completeness residual exposed internally for testing.

The UI does not claim SHAP. Counterfactual mood analysis reruns the actual production scorer with the mood vector changed while holding the rest of the context fixed.

## Online learning

Immediate personalization uses two levels:

- mood × category Beta posterior,
- exact-place positive/negative adjustment.

Local feedback always works. When Supabase is configured, aggregated anonymous population feedback is merged as a global prior.

## Evaluation

The project reports:

- Precision@5
- Recall@5
- NDCG@5
- MAE
- inference latency
- mood-text macro F1 / accuracy
- real-feedback holdout MAE/F1 when enough labels exist

## Limitations

- External map/review/street-photo coverage is provider-dependent.
- Synthetic benchmark results demonstrate relative model behavior, not population-level real-world performance.
- Real-world ranking metrics are meaningful only after enough interaction diversity accumulates.
- Feedback can reflect selection bias because users only react to items the current model exposes.

## Reproducibility

Dependencies are exact-version pinned and committed in `package-lock.json`. CI runs unit tests, production build and Chromium E2E. The retraining workflow verifies a regenerated model before committing it.
