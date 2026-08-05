(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ImageQuality=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const defects={
    'quality/defect_blurry':{name:'Blurry',weight:1.2,fix:'Replace or reshoot the source at native resolution. Avoid enlarging a small asset; sharpen only after the clean source is secured.',check:'Confirm the main entity, logo, and every text edge remain crisp at the delivered size.'},
    'quality/defect_noisy':{name:'Noisy',weight:.9,fix:'Use a cleaner source or reshoot with more light and lower ISO. Apply restrained denoising before final sharpening.',check:'Inspect flat backgrounds, gradients, faces, and small lettering for grain and compression artifacts.'},
    'quality/defect_dark':{name:'Too dark',weight:1,fix:'Lift exposure and shadow detail selectively. Preserve the dark brand treatment, but separate the main entity from the background.',check:'Verify text contrast, logo contrast, and main-entity visibility on desktop and mobile.'},
    'quality/defect_faint':{name:'Faint / low contrast',weight:1,fix:'Increase local contrast, strengthen fine lines, and use clearer typography or icon strokes.',check:'Check diagrams, captions, watermarks, and pale objects at actual display size.'},
    'quality/defect_text_too_small':{name:'Text too small',weight:1.2,fix:'Reduce copy, enlarge the type, and simplify the composition. Featured-image text should stay to two lines.',check:'Test the smallest responsive crop; the logo text and core message must remain readable.'},
    'quality/defect_document_cutoff':{name:'Image cutoff',weight:1.3,fix:'Rebuild the crop with a safe zone. Keep the primary entity centered and preserve it in every responsive crop.',check:'Preview featured images at 1640 × 840 and mobile variants; keep inline content inside its natural canvas.'},
    'quality/defect_text_cutoff':{name:'Text cutoff',weight:1.3,fix:'Move text away from edges, restore safe margins, and reflow it before reducing font size.',check:'Verify the full message, logo, labels, and units are not clipped.'},
    'quality/defect_glare':{name:'Glare / clipped highlights',weight:1.1,fix:'Use a source without reflections or reduce highlights with local retouching. If reshooting, diffuse the light and change the angle.',check:'Ensure highlights do not hide the main entity, text, logo, or diagram labels.'}
  };
  const clamp=n=>Math.max(0,Math.min(1,Number(n)||0));
  function severity(confidence){const c=clamp(confidence);return c>=.75?'critical':c>=.5?'high':c>=.25?'medium':'low'}
  function extract(payload){const found={};(function walk(value){if(Array.isArray(value))return value.forEach(walk);if(!value||typeof value!=='object')return;if(typeof value.type==='string'&&value.type in defects&&value.confidence!=null)found[value.type]=Math.max(found[value.type]||0,clamp(value.confidence));Object.values(value).forEach(walk)})(payload);return found}
  function scoresFromMetrics(m={}){
    const scores={};
    if(Number.isFinite(m.brightness)) scores['quality/defect_dark']=clamp((.42-m.brightness)/.32);
    if(Number.isFinite(m.contrast)) scores['quality/defect_faint']=clamp((.22-m.contrast)/.18);
    if(Number.isFinite(m.sharpness)) scores['quality/defect_blurry']=clamp((.16-m.sharpness)/.13);
    if(Number.isFinite(m.noise)) scores['quality/defect_noisy']=clamp((m.noise-.055)/.13);
    if(Number.isFinite(m.highlights)) scores['quality/defect_glare']=clamp((m.highlights-.12)/.28);
    if(m.mode==='featured'&&m.width&&m.height){const ratio=m.width/m.height,target=1640/840;const undersized=Math.max(0,1-Math.min(m.width/1640,m.height/840));const ratioRisk=Math.min(1,Math.abs(ratio-target)/.55);scores['quality/defect_document_cutoff']=clamp(Math.max(undersized*.72,ratioRisk*.58))}
    if(m.mode==='inline'&&m.width&&m.width<840) scores['quality/defect_document_cutoff']=clamp((840-m.width)/840*.55);
    return scores;
  }
  function assess(scores,mode='featured'){
    const items=Object.entries(defects).map(([type,meta])=>({type,...meta,confidence:clamp(scores[type]),severity:severity(scores[type])})).sort((a,b)=>b.confidence*b.weight-a.confidence*a.weight);
    const penalty=items.reduce((sum,item)=>sum+item.confidence*item.weight,0)/items.reduce((sum,item)=>sum+item.weight,0);
    const score=Math.max(0,Math.round(100-penalty*100)),active=items.filter(x=>x.confidence>=.25),blockers=items.filter(x=>x.confidence>=.75);
    const status=blockers.length?'block':active.some(x=>x.confidence>=.5)?'revise':active.length?'review':'pass';
    return{score,status,title:{block:'Do not publish yet',revise:'Revise before publishing',review:'Review the flagged details',pass:'Technical signals look clean'}[status],items,active,blockers,mode};
  }
  return{defects,severity,extract,scoresFromMetrics,assess};
});
