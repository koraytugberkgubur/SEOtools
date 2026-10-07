# Optional: pip install sqlglot duckdb. This is a dialect-translated fixture check,
# not a replacement for a BigQuery dry run against the actual source.
import json, subprocess
from pathlib import Path
import sqlglot, duckdb
base = Path(__file__).resolve().parent.parent
script = r'''const fs=require('fs'),vm=require('vm'),e=require('./query-engine.js');
const c={window:{}};vm.runInNewContext(fs.readFileSync('queries.js','utf8'),c);
console.log(JSON.stringify(['site','url'].flatMap(mode=>(mode==='site'?c.window.QUERY_CATALOG:c.window.URL_QUERY_CATALOG).map(q=>({mode,id:q.id,sql:e.buildSql(q,{mode,projectId:'test-project',dataset:'data',tableName:'source',positionBase:'1',columns:e.columnsFor(mode)})})))));'''
queries = json.loads(subprocess.check_output(['node', '-e', script], cwd=base, text=True))
from sqlglot import exp
con=duckdb.connect()
con.execute('''CREATE TABLE source(date DATE, domain VARCHAR, page VARCHAR, query VARCHAR, clicks BIGINT, impressions BIGINT, position DOUBLE, ctr DOUBLE, site_id VARCHAR, vertical_id VARCHAR, network_id VARCHAR, country VARCHAR, device VARCHAR, resource_id VARCHAR, resource_type VARCHAR, site_language VARCHAR, site_country VARCHAR)''')
rows=[]
for day in ['2024-01-01','2024-02-01','2024-03-01','2024-04-01','2024-05-01']:
 for domain,page,clicks,impressions,position in [('a.test','https://a.test/one',0,1000,8),('a.test','https://a.test/two',100,1000,8),('b.test','https://b.test/one',300,1000,8)]:
  rows.append((day,domain,page,'shared term',clicks,impressions,position,clicks/impressions,'s','v','n','usa','DESKTOP','r','Page','en','US'))
con.executemany('INSERT INTO source VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',rows)
results={}
for q in queries:
 ast=sqlglot.parse_one(q['sql'],read='bigquery')
 for table in ast.find_all(exp.Table):
  if table.name=='source': table.replace(exp.to_table('source'))
 sql=ast.sql(dialect='duckdb')
 try:
  result=con.execute(sql)
  results[q['mode']+q['id']]=[dict(zip([d[0] for d in result.description],r)) for r in result.fetchall()]
 except Exception as e: print(q['mode'],q['id'],e); raise
assert len(results['urlq14'])==3
assert results['urlq11'][0]['domain']=='a.test'
assert len(results['urlq11'])==1, results['urlq11']
assert results['urlq11'][0]['clicks_missed']==150, results['urlq11']
assert {r['domain'] for r in results['urlq16']}=={'a.test'}
assert all(r['urls_on_query']==2 for r in results['urlq16'])
assert len(results['urlq17'])==2
print('Executed all 30 transpiled reports on synthetic rows; verified page metrics, per-domain CTR bands, shared-query isolation, and per-domain anchor ownership.')
