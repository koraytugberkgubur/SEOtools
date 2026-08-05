const test=require('node:test'),assert=require('node:assert/strict'),{extract,assess,severity,scoresFromMetrics}=require('../quality-engine');
test('extracts supported defects from nested API payloads',()=>assert.deepEqual(extract({pages:[{imageQualityScores:{detectedDefects:[{type:'quality/defect_blurry',confidence:.8}]}}]}),{'quality/defect_blurry':.8}));
test('keeps the highest duplicate confidence',()=>assert.equal(extract([{type:'quality/defect_dark',confidence:.4},{type:'quality/defect_dark',confidence:.7}])['quality/defect_dark'],.7));
test('classifies severity bands',()=>{assert.equal(severity(.8),'critical');assert.equal(severity(.6),'high');assert.equal(severity(.3),'medium');assert.equal(severity(.1),'low')});
test('blocks publishing for a critical defect',()=>assert.equal(assess({'quality/defect_text_cutoff':.9}).status,'block'));
test('passes a clean image',()=>assert.equal(assess({}).score,100));
test('maps dark low-contrast images to defects',()=>{const s=scoresFromMetrics({brightness:.1,contrast:.05,sharpness:.3,noise:.01,highlights:0});assert.ok(s['quality/defect_dark']>.75);assert.ok(s['quality/defect_faint']>.75)});
test('flags undersized featured images as crop risk',()=>assert.ok(scoresFromMetrics({mode:'featured',width:600,height:300})['quality/defect_document_cutoff']>.25));
