import re,pickle,json,collections
t=open('/Users/kartikchaudhary/revix/pharma-crm/.arena/corpus/savi_summaries.md').read()
rows=re.findall(r'^#(\d+) \| (.*?) \| (\S+ \S+) IST \| (\w+) \| (\d+)s \| tags: (.*)\n(.*)$',t,re.M)
calls=[dict(n=int(r[0]),name=r[1],ts=r[2],dir=r[3],dur=int(r[4]),tags=r[5],sum=r[6]) for r in rows]
d=pickle.load(open('calls.pkl','rb'))
def tr(n):
    m=re.search(r'```text\n(.*?)```',d[n],re.S)
    return m.group(1).strip() if m else ''
def cls(c):
    nm=c['name'].lower(); tg=c['tags'].lower(); s=c['sum'].lower()
    if re.search(r'personal call|audio testing|mic test|wrong number|spam|silent|pocket dial|no conversation|automated|ivr|casual|accidental',tg) and not re.search(r'pcd monopoly',tg): 
        if 'tarun' in nm or re.search(r'kanu|tailor|naresh cnt|masi|meenu|poonm|debu',nm) or True: return 'A_personal_test_wrongno'
    if re.search(r'kartik \(samsung',nm): return 'A_personal_test_wrongno'
    if 'tarun sir' in nm or 'kesrox office' in nm: return 'B_internal_boss'
    if re.search(r'delhivery|courier|transport|tpt|logistic|bigship|cargo|pickup',nm) or re.search(r'bigship|courier service',s): return 'C_logistics_vendor'
    if re.search(r'existing|\(e\)|\[e\]|exsiting|\bex\b|\bim ex',nm) or re.search(r'existing customer|existing distributor|existing chemist',tg+s[:200]): return 'D_existing_customer'
    if re.search(r'google|\bfb\b|inmrt|indiamart|india mart|enquire',nm): return 'E_enquiry_lead_callback'
    return 'F_other'
cc=collections.Counter(cls(c) for c in calls)
print(cc, sum(cc.values()))
json.dump([dict(c,cls=cls(c)) for c in calls],open('calls.json','w'))
for k in ['F_other']:
    for c in calls:
        if cls(c)==k: print(c['n'],c['name'][:40],'|',c['tags'][:70])
