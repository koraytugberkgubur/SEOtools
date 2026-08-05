const test=require('node:test'),assert=require('node:assert/strict'),{extract,assess,severity}=require('../quality-engine');
test('extracts supported defects from nested API payloads',()=>assert.deepEqual(extract({pages:[{imageQualityScores:{detectedDefects:[{type:'quality/defect_blurry',confidence:.8}]}}]}),{'quality/defect_blurry':.8}));
test('keeps the highest duplicate confidence',()=>assert.equal(extract([{type:'quality/defect_dark',confidence:.4},{type:'quality/defect_dark',confidence:.7}])['quality/defect_dark'],.7));
test('classifies severity bands',()=>{assert.equal(severity(.8),'critical');assert.equal(severity(.6),'high');assert.equal(severity(.3),'medium');assert.equal(severity(.1),'low')});
test('blocks publishing for a critical defect',()=>{const r=assess({'quality/defect_text_cutoff':.9});assert.equal(r.status,'block');assert.equal(r.blockers.length,1)});
test('passes a clean image',()=>{const r=assess({});assert.equal(r.status,'pass');assert.equal(r.score,100)});
