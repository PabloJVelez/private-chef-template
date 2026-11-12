import json, os, subprocess
from pathlib import Path
out=Path('/tmp/private-chef-node26-evidence')
env=os.environ.copy()
env.update(DATABASE_URL='postgres://postgres:node26-fixture-only@127.0.0.1:32779/upgrade_main',REDIS_URL='redis://127.0.0.1:32780/6',NODE_ENV='production',FILE_PROVIDER='local',STRIPE_API_KEY='sk_test_fixture',RESEND_API_KEY='re_fixture',RESEND_FROM_EMAIL='fixture@example.invalid',MEDUSA_TELEMETRY_DISABLED='1',JWT_SECRET='node26-fixture-jwt',COOKIE_SECRET='node26-fixture-cookie')
env['PATH']='/tmp/medusa-upgrade-tools/node-v24.22.1-linux-x64/bin:'+env['PATH']
root='/tmp/private-chef-node26-baseline'
records=[]
def run(name,args,cwd=root):
 with (out/(name+'.log')).open('w') as log:
  p=subprocess.run(args,cwd=cwd,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=300)
 records.append(dict(name=name,command=args,exit_code=p.returncode))
 (out/'rehearsal-results.json').write_text(json.dumps(records,indent=2))
 print(name,p.returncode,flush=True)
 if p.returncode: raise SystemExit(p.returncode)
run('create-fixture-db',['docker','exec','chef-node26-postgres','createdb','-U','postgres','upgrade_main'])
run('node24-migrate',['corepack','yarn','workspace','medusa','medusa','db:migrate','--execute-all-links','--execute-safe-search'])
run('node24-init',['corepack','yarn','workspace','medusa','medusa','exec','./src/scripts/init.ts'])
run('node24-seed',['corepack','yarn','workspace','medusa','medusa','exec','./integration-tests/upgrade/seed.ts'])
run('node24-browser-seed',['corepack','yarn','workspace','medusa','medusa','exec','./integration-tests/upgrade/browser-seed.ts'])
run('node24-user',['corepack','yarn','workspace','medusa','medusa','user','--email','fixture@example.invalid','--password','Node26-fixture-only-123!'])
def sql(q):
 return subprocess.check_output(['docker','exec','chef-node26-postgres','psql','-U','postgres','-d','upgrade_main','-Atc',q],text=True)
def capture(name):
 tables=['chef_event','scheduling_reservation','chef_event_acceptance_attempt','product_product_chefeventmodule_chef_event','workflow_execution']
 tables += sql("select tablename from pg_tables where schemaname='public' and tablename like '%migrations%' order by tablename").splitlines()
 result={t:json.loads(sql(f"select coalesce(json_agg(t order by id),'[]') from {t} t")) for t in tables}
 (out/(name+'.json')).write_text(json.dumps(result,indent=2))
 return result
def schema(name):
 data=subprocess.check_output(['docker','exec','chef-node26-postgres','pg_dump','-U','postgres','-d','upgrade_main','--schema-only','--no-owner','--no-privileges'],text=True)
 data='\n'.join(line for line in data.splitlines() if not line.startswith(('\\restrict ', '\\unrestrict ')))
 (out/(name+'.sql')).write_text(data)
 return data
before=capture('rows-ledgers-before')
original_schema=schema('schema-before')
env['PATH']='/tmp/private-chef-node26-tools/node-v26.13.1-linux-x64/bin:'+env['PATH']
for n in ['node26-migrate','node26-migrate-repeat']:
 run(n,['corepack','yarn','workspace','medusa','medusa','db:migrate','--execute-all-links','--execute-safe-search'],cwd='/tmp/private-chef-node26-final')
after=capture('rows-ledgers-after')
assert original_schema==schema('schema-after'), 'Database schema changed'
assert before==after, 'Fixture rows or migration ledgers changed'
print('PASS: all protected fixture rows and migration ledgers exactly unchanged',flush=True)
