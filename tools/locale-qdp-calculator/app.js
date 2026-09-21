const $ = s => document.querySelector(s);
const branchSets = {
  'small-neighbor': [['smallPopulation','The candidate market is small'],['nearlyIdenticalLanguage','The language is nearly identical'],['neighborServesSerp','The existing locale already serves its SERP']],
  'city-country': [['cityOutranksCountry','The city query has more demand'],['cityIsHeaviestTerm','The city is the main term in the query']]
};
const metricLabels={demand:'Independent demand',localizedSerp:'Location-specific SERP evidence',entities:'Different entities',pattern:'Repeatable query pattern'};
function checkbox(id,label){return `<label><input type="checkbox" id="${id}"><span>${label}</span></label>`}
function renderBranch(){const qs=branchSets[$('#scenario').value]||[],branch=$('#branchQuestions');branch.innerHTML=qs.length?`<h3>Special-case check</h3>${qs.map(x=>checkbox(...x)).join('')}`:'';branch.hidden=!qs.length}
function queryLines(){return $('#queries').value.split('\n').map(x=>x.trim()).filter(Boolean)}
function num(id){return Math.max(0,+$(id).value||0)}
function radio(name){return document.querySelector(`input[name="${name}"]:checked`)?.value}
function updateLabels(){const p=$('#parentLocale').value||'Existing locale',c=$('#candidateLocale').value||'Candidate locale';$('#parentDemandLabel').textContent=`${p} demand`;$('#candidateDemandLabel').textContent=`${c} demand`}
function read(){
  const parentDemand=num('#parentDemand'),candidateDemand=num('#candidateDemand'),combined=parentDemand+candidateDemand,candidateShare=combined?candidateDemand/combined:0;
  const intent=radio('intent'),entities=radio('entities'),queries=queryLines();
  const strongEvidence=[...document.querySelectorAll('[data-serp="strong"]:checked')].map(el=>el.value),supportingEvidence=[...document.querySelectorAll('[data-serp="supporting"]:checked')].map(el=>el.value),localizedEvidence=[...strongEvidence,...supportingEvidence];
  const localizedSerp=strongEvidence.length>=1||supportingEvidence.length>=2;
  const metrics={demand:candidateShare>=.2,localizedSerp,entities:entities==='yes',pattern:queries.length>=3};
  const input={scenario:$('#scenario').value,hasReliableData:$('#hasReliableData').checked,populatedQueries:(queries.length||combined)?1:0,complete:combined>0&&Boolean(intent)&&Boolean(entities)&&queries.length>0,candidateShare,intent,strongEvidence,supportingEvidence,localizedEvidence,metrics};
  Object.values(branchSets).flat().forEach(([id])=>input[id]=Boolean(document.querySelector(`#${id}`)?.checked));
  return {input,parentDemand,candidateDemand,candidateShare,intent,strongEvidence,supportingEvidence,localizedEvidence,entities,queries};
}
function signalState(label,pass,known=true){return `<div class="signal-row" data-pass="${known?pass:'unknown'}"><i>${known?(pass?'✓':'×'):'—'}</i><span>${label}</span></div>`}
function update(){
  updateLabels();const data=read(),{input}=data;const result=QDP.calculate(input);
  const demandKnown=data.parentDemand+data.candidateDemand>0,serpKnown=Boolean(data.intent),entitiesKnown=Boolean(data.entities),patternKnown=data.queries.length>0;
  $('#demandSignal').textContent=demandKnown?`${(data.candidateShare*100).toFixed(1)}% of combined demand — ${input.metrics.demand?'passes':'does not pass'} QDP.`:'Candidate must reach 20% of combined demand.';
  $('#serpSignal').textContent=serpKnown?`${data.intent[0].toUpperCase()+data.intent.slice(1)} intent · ${data.strongEvidence.length} strong + ${data.supportingEvidence.length} supporting signals — ${input.metrics.localizedSerp?'passes QDP':'needs 1 strong or 2 supporting'}.`:'Choose the intent, then select the visible SERP evidence.';
  $('#patternSignal').textContent=`${data.queries.length} representative ${data.queries.length===1?'query':'queries'} added${input.metrics.pattern?' — pattern passes.':'.'}`;
  $('#score').textContent=result.score;$('#status').textContent=result.status;$('#status').dataset.status=result.status;$('#resultTitle').textContent=result.title;$('#action').textContent=result.action;
  $('#signalList').innerHTML=signalState(metricLabels.demand,input.metrics.demand,demandKnown)+signalState(metricLabels.localizedSerp,input.metrics.localizedSerp,serpKnown)+signalState(metricLabels.entities,input.metrics.entities,entitiesKnown)+signalState(metricLabels.pattern,input.metrics.pattern,patternKnown);
  $('#rationale').innerHTML=result.rationale.map(x=>`<li>${x}</li>`).join('');$('#guardrails').innerHTML=result.safeguards.length?`<div class="why"><h3>After launch</h3><ul>${result.safeguards.map(x=>`<li>${x}</li>`).join('')}</ul></div>`:'';
  window.currentDecision={data,result};
}
$('#calculator').addEventListener('input',update);$('#calculator').addEventListener('change',e=>{if(e.target.id==='scenario')renderBranch();update()});
$('#copy').addEventListener('click',async()=>{const {data,result}=window.currentDecision;const text=`${result.title}\nQDP score: ${result.score}/4\nCandidate demand share: ${(data.candidateShare*100).toFixed(1)}%\nQuery intent: ${data.intent||'Not entered'}\nLocalized SERP evidence: ${data.localizedEvidence.join('; ')||'None selected'}\nAction: ${result.action}`;await navigator.clipboard.writeText(text);$('#copyState').textContent='Decision copied.'});
renderBranch();update();
