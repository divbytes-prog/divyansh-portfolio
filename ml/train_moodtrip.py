from __future__ import annotations
import json, math, time
from pathlib import Path
from itertools import product

import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score, mean_absolute_error
from sklearn.model_selection import train_test_split
from sklearn.neural_network import MLPRegressor
from xgboost import XGBRegressor

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"ml"/"model_artifacts.json"
SEED=20260920

MOOD_VECTORS={
"happy":[.9,.82,.25,.55,.55,.72,.9,.8],"sad":[.18,.12,.98,.3,.25,.74,.25,.12],
"stressed":[.12,.18,1,.22,.25,.92,.2,.16],"energetic":[.62,1,.16,.58,.28,.78,.35,.95],
"bored":[.72,.78,.2,.95,.52,.62,.58,.86],"romantic":[.52,.34,.68,.5,.5,.66,.76,.25],
"curious":[.36,.45,.42,1,.62,.42,.25,.38],"peaceful":[.18,.14,1,.4,.34,.95,.2,.15],
"social":[1,.72,.2,.45,.54,.5,.92,.76],"adventurous":[.42,.96,.22,.88,.08,1,.18,.98],
"lonely":[.14,.12,.98,.42,.28,.86,.22,.1],"angry":[.2,.82,.38,.32,.18,.9,.14,.92]}

CATEGORY_FEATURES={
"cafe":[.74,.35,.48,.32,.82,.18,1,.25],"restaurant":[.8,.42,.34,.28,.82,.18,1,.32],
"cinema":[.72,.42,.48,.62,1,.05,.38,.52],"library":[.08,.05,1,.86,1,.04,.06,.02],
"park":[.22,.42,.92,.48,.02,1,.12,.48],"garden":[.16,.28,.98,.5,.04,1,.08,.3],
"viewpoint":[.18,.58,.82,.82,.02,1,.08,.62],"museum":[.22,.26,.72,1,1,.08,.08,.2],
"gallery":[.28,.25,.72,1,.92,.12,.12,.2],"arcade":[.92,.92,.08,.5,.94,.08,.4,1],
"sports":[.68,1,.12,.4,.16,.84,.16,1],"mall":[.92,.62,.18,.38,.82,.18,.92,.62],
"attraction":[.66,.68,.28,.9,.32,.68,.34,.72],"historic":[.28,.42,.72,1,.18,.8,.08,.38],
"playground":[.74,.86,.18,.24,.06,.94,.18,.9]}

MOOD_CATEGORIES={
"happy":["cafe","arcade","mall","restaurant","attraction","cinema"],
"sad":["park","garden","library","viewpoint","cafe"],
"stressed":["park","garden","library","viewpoint"],
"energetic":["sports","arcade","playground","park","attraction"],
"bored":["arcade","cinema","mall","museum","attraction","cafe"],
"romantic":["cafe","restaurant","garden","viewpoint","park"],
"curious":["museum","gallery","historic","attraction","library"],
"peaceful":["park","garden","library","viewpoint"],
"social":["cafe","restaurant","mall","arcade","cinema"],
"adventurous":["viewpoint","sports","attraction","park","historic"],
"lonely":["library","park","garden","cafe","viewpoint"],
"angry":["sports","park","viewpoint","garden"]}

CROWD_DEFAULT={"happy":"lively","sad":"quiet","stressed":"quiet","energetic":"balanced","bored":"lively",
"romantic":"balanced","curious":"balanced","peaceful":"quiet","social":"lively",
"adventurous":"balanced","lonely":"quiet","angry":"quiet"}

def cosine(a,b):
    a,b=np.asarray(a,float),np.asarray(b,float)
    return float(a@b/(np.linalg.norm(a)*np.linalg.norm(b)+1e-9))

def crowd_for(cat):
    if cat in {"library","garden"}: return "quiet"
    if cat in {"arcade","mall","restaurant","cinema"}: return "lively"
    return "balanced"

def crowd_fit(pref,actual):
    if pref==actual: return 1.
    if pref=="balanced" or actual=="balanced": return .68
    return .28

def make_rank_data():
    rng=np.random.default_rng(SEED)
    rows=[]
    moods=list(MOOD_VECTORS); cats=list(CATEGORY_FEATURES)
    sessions=1800
    for sid in range(sessions):
        mood=rng.choice(moods); group=int(rng.random()<.32); hour=int(rng.integers(8,23))
        crowd=CROWD_DEFAULT[mood] if rng.random()<.75 else rng.choice(["quiet","balanced","lively"])
        mv=np.array(MOOD_VECTORS[mood])
        for _ in range(10):
            cat=rng.choice(cats); cv=np.array(CATEGORY_FEATURES[cat])
            dist=float(np.clip(rng.gamma(1.6,1.4),.08,10)); dn=min(dist/10,1)
            rating=float(np.clip(rng.normal(4.05,.48),2.4,5)); rn=np.clip((rating-2.5)/2.5,0,1)
            cf=crowd_fit(crowd,crowd_for(cat))
            hs=(math.sin(2*math.pi*hour/24)+1)/2; hc=(math.cos(2*math.pi*hour/24)+1)/2
            mf=(cosine(mv,cv)+1)/2; preferred=int(cat in MOOD_CATEGORIES[mood])
            y=np.clip(.37*mf+.18*(1-dn)+.10*rn+.08*cf+.11*preferred+
                      .035*group*cv[6]+.025*(1-group)*cv[2]+
                      .025*hs*cv[6]+.025*hc*cv[2]+
                      .035*mv[1]*cv[1]+.035*mv[3]*cv[3]+rng.normal(0,.045),0,1)
            x=[*mv,*cv,dn,rn,cf,group,hs,hc]
            rows.append((sid,x,float(y)))
    sids=np.array([r[0] for r in rows])
    X=np.array([r[1] for r in rows],float); y=np.array([r[2] for r in rows],float)
    return X,y,sids,sessions

def rule_predict(X):
    mv,cv=X[:,:8],X[:,8:16]
    mf=np.sum(mv*cv,axis=1)/(np.linalg.norm(mv,axis=1)*np.linalg.norm(cv,axis=1)+1e-9)
    mf=(mf+1)/2
    return .56*mf+.24*(1-X[:,16])+.12*X[:,17]+.08*X[:,18]

def content_predict(X):
    mv,cv=X[:,:8],X[:,8:16]
    mf=np.sum(mv*cv,axis=1)/(np.linalg.norm(mv,axis=1)*np.linalg.norm(cv,axis=1)+1e-9)
    return (mf+1)/2

def ranking_metrics(y,score,sids,k=5,rel_n=3):
    P=[];R=[];N=[]
    for sid in np.unique(sids):
        idx=np.where(sids==sid)[0]; yt=y[idx]; yp=score[idx]
        rel=set(np.argsort(-yt)[:rel_n]); top=np.argsort(-yp)[:k]
        hits=sum(i in rel for i in top)
        P.append(hits/k); R.append(hits/rel_n)
        dcg=sum((1 if i in rel else 0)/math.log2(rank+2) for rank,i in enumerate(top))
        ideal=sum(1/math.log2(rank+2) for rank in range(min(rel_n,k)))
        N.append(dcg/ideal)
    return float(np.mean(P)),float(np.mean(R)),float(np.mean(N))

def median_latency(fn,X):
    sample=X[:1000]; vals=[]
    for _ in range(15):
        t=time.perf_counter(); fn(sample); vals.append((time.perf_counter()-t)*1000)
    return float(np.median(vals))

def mood_text_benchmark():
    lex={
    "happy":["happy","cheerful","great","joyful","excited in a good way","in a really good mood","celebratory","positive"],
    "sad":["sad","low","down","heartbroken","upset","gloomy","emotionally heavy","like crying"],
    "stressed":["stressed","anxious","overwhelmed","burnt out","under pressure","mentally tired","tense","exhausted"],
    "energetic":["energetic","active","restless","full of energy","ready to move","hyper","pumped","physically active"],
    "bored":["bored","unstimulated","tired of doing nothing","looking for something new","stuck","restless from boredom","done with routine","needing entertainment"],
    "romantic":["romantic","in a date mood","wanting couple time","feeling affectionate","looking for a nice date","in love","wanting a cozy evening","planning time with my partner"],
    "curious":["curious","eager to learn","wanting to discover something","interested in history","in an exploring mood","wanting culture","wanting to learn something new","interested in museums"],
    "peaceful":["peaceful","calm","quiet","relaxed","wanting silence","wanting a slow evening","looking for a calm place","needing some peace"],
    "social":["social","wanting to meet friends","in a group mood","wanting people around","ready to hang out","wanting to chat","planning a group outing","wanting a lively hangout"],
    "adventurous":["adventurous","wanting a thrill","ready to explore outdoors","wanting something wild","up for an adventure","wanting a hike","looking for excitement","ready to discover a new place"],
    "lonely":["lonely","wanting solo time","wanting to be by myself","needing me time","wanting a quiet solo place","not wanting a crowd","wanting some space","comfortable being alone"],
    "angry":["angry","frustrated","mad","annoyed","irritated","needing to cool off","wanting to release frustration","needing a reset"]}
    prefix=["I feel","I am","Right now I am","Today I feel","Honestly I am","This evening I feel"]
    suffix=["and want somewhere that fits","so suggest a place","and I want to go out","and need somewhere nearby","so help me pick somewhere","and want a place for this mood"]
    rng=np.random.default_rng(123); texts=[]; labels=[]
    for mood,terms in lex.items():
        combos=list(product(prefix,terms,suffix)); rng.shuffle(combos)
        for a,b,c in combos[:42]: texts.append(f"{a} {b} {c}."); labels.append(mood)
        texts.extend(terms); labels.extend([mood]*len(terms))
    a,b,c,d=train_test_split(texts,labels,test_size=.25,random_state=42,stratify=labels)
    vec=TfidfVectorizer(ngram_range=(1,2),max_features=300)
    clf=LogisticRegression(max_iter=1000,C=4.).fit(vec.fit_transform(a),c)
    pred=clf.predict(vec.transform(b))
    return {"dataset":"curated 12-mood phrase benchmark","samples":len(texts),"holdout":len(b),
            "macro_f1":round(float(f1_score(d,pred,average="macro")),4),
            "accuracy":round(float(accuracy_score(d,pred)),4),
            "model":"TF-IDF bigram + multinomial logistic regression"}

def main():
    X,y,sids,sessions=make_rank_data()
    train_s,test_s=train_test_split(np.arange(sessions),test_size=.25,random_state=42)
    tr=np.isin(sids,train_s); te=np.isin(sids,test_s)
    Xtr,Xte,ytr,yte=X[tr],X[te],y[tr],y[te]; test_ids=sids[te]

    rf=RandomForestRegressor(n_estimators=72,max_depth=10,min_samples_leaf=3,max_features=.85,random_state=42,n_jobs=-1).fit(Xtr,ytr)
    xgb=XGBRegressor(n_estimators=140,max_depth=4,learning_rate=.035,subsample=.85,colsample_bytree=.9,
                     objective="reg:squarederror",reg_lambda=1.5,reg_alpha=.02,random_state=42,n_jobs=4).fit(Xtr,ytr)
    nn=MLPRegressor(hidden_layer_sizes=(18,8),activation="relu",alpha=.002,learning_rate_init=.006,
                    max_iter=500,early_stopping=True,validation_fraction=.15,random_state=42).fit(Xtr,ytr)

    teacher=.65*nn.predict(Xtr)+.20*rf.predict(Xtr)+.15*xgb.predict(Xtr)
    student=MLPRegressor(hidden_layer_sizes=(16,8),activation="relu",alpha=.002,learning_rate_init=.004,
                         max_iter=500,early_stopping=True,validation_fraction=.15,random_state=7).fit(Xtr,teacher)

    preds={"Rule Based":rule_predict(Xte),"Content Based":content_predict(Xte),
           "Random Forest":rf.predict(Xte),"XGBoost Ranker":xgb.predict(Xte),
           "Neural Recommender":nn.predict(Xte)}
    preds["Teacher Ensemble"]=.65*preds["Neural Recommender"]+.20*preds["Random Forest"]+.15*preds["XGBoost Ranker"]
    preds["Production Distilled NN"]=student.predict(Xte)

    fns={"Rule Based":rule_predict,"Content Based":content_predict,"Random Forest":rf.predict,
         "XGBoost Ranker":xgb.predict,"Neural Recommender":nn.predict,
         "Teacher Ensemble":lambda z:.65*nn.predict(z)+.20*rf.predict(z)+.15*xgb.predict(z),
         "Production Distilled NN":student.predict}

    metrics={}
    for name,p in preds.items():
        p5,r5,n5=ranking_metrics(yte,p,test_ids)
        metrics[name]={"precision_at_5":round(p5,4),"recall_at_5":round(r5,4),"ndcg_at_5":round(n5,4),
                       "mae":round(float(mean_absolute_error(yte,p)),4),
                       "latency_ms_per_1000":round(median_latency(fns[name],Xte),3)}

    names=[f"mood_{i}" for i in range(8)]+[f"place_{i}" for i in range(8)]+[
        "distance_norm","rating_norm","crowd_fit","group_mode","hour_sin","hour_cos"]

    artifact={"benchmark":metrics,"ranking_meta":{"feature_names":names,"training_sessions":sessions,
              "samples":len(X),"test_sessions":len(test_s),"seed":SEED,
              "teacher_weights":{"Neural Recommender":.65,"Random Forest":.20,"XGBoost Ranker":.15},
              "dataset":"controlled synthetic preference simulation","production_model":"distilled neural ranker"},
              "mood_benchmark":mood_text_benchmark(),
              "student":{"coefs":[np.round(x,6).tolist() for x in student.coefs_],
                         "intercepts":[np.round(x,6).tolist() for x in student.intercepts_]}}
    OUT.write_text(json.dumps(artifact,separators=(",",":")),encoding="utf-8")
    print(json.dumps(metrics,indent=2))

if __name__=="__main__":
    main()
