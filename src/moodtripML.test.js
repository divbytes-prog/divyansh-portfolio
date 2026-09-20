import {describe,it,expect} from'vitest';
import{
  buildRankFeatures,
  predictDistilledRanker,
  integratedGradientsRanker,
  contextualBanditScore,
  placeFeedbackAdjustment,
  mergeFeedbackMaps
}from'./moodtripML';

const mood=[.9,.82,.25,.55,.55,.72,.9,.8];
const place=[.74,.35,.48,.32,.82,.18,1,.25];

describe('MoodTrip ML runtime',()=>{
  it('builds the 22-feature production vector',()=>{
    const f=buildRankFeatures({
      moodVector:mood,categoryVector:place,distanceNorm:.2,ratingNorm:.8,
      crowdFit:1,groupMode:false,hour:18
    });
    expect(f).toHaveLength(22);
    expect(f.every(Number.isFinite)).toBe(true);
  });

  it('keeps distilled neural predictions bounded',()=>{
    const f=buildRankFeatures({
      moodVector:mood,categoryVector:place,distanceNorm:.15,ratingNorm:.9,
      crowdFit:.8,groupMode:false,hour:18
    });
    const score=predictDistilledRanker(f);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('Integrated Gradients approximately satisfies completeness',()=>{
    const f=buildRankFeatures({
      moodVector:mood,categoryVector:place,distanceNorm:.25,ratingNorm:.75,
      crowdFit:.68,groupMode:true,hour:20
    });
    const ig=integratedGradientsRanker(f,96);
    expect(ig.attributions).toHaveLength(22);
    expect(Math.abs(ig.completenessResidual)).toBeLessThan(.08);
  });

  it('negative exact-place feedback creates an immediate demotion',()=>{
    const feedback={'place|happy|p1':{pos:0,neg:1}};
    const item=placeFeedbackAdjustment(feedback,'happy','p1');
    expect(item.state).toBe('negative');
    expect(item.adjustment).toBeLessThan(-.1);
  });

  it('merges population and local feedback priors',()=>{
    const merged=mergeFeedbackMaps(
      {'happy|cafe':{pos:8,neg:2}},
      {'happy|cafe':{pos:1,neg:1}}
    );
    const bandit=contextualBanditScore(merged,'happy','cafe');
    expect(merged['happy|cafe']).toEqual({pos:9,neg:3});
    expect(bandit.mean).toBeGreaterThan(.6);
  });
});
