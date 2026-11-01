import json,re,collections
calls={int(k):v for k,v in json.load(open('calls.json')).items()}
def cat(n,c):
    nm=c['name'].lower(); tg=c['tags'].lower(); sm=c['sum'].lower()
    if n in (529,530,531,532,521): return 'test'
    if n>=533 or 'personal call' in tg or nm.startswith('kanu') and n>=524: return 'personal'
    if 'spam' in nm or 'fraud' in nm and n not in(241,): return 'spam'
    if nm=='tarun sir': return 'internal_tarun'
    if 'narendr kumar' in nm: return 'internal_ca'
    if any(x in nm for x in ['delhivery','courier','dtdc','transport','tpt','cargo','kesrox office']) : return 'logistics_contact'
    if 'bigship' in sm or n in(457,458,487,313): return 'vendor_pitch'
    if 'third' in nm or '3 party' in nm or '3party' in nm or 'rizwan' in nm or 'vicky' in nm or '7387238158' in nm or 'ayurda' in nm or 'neeraj sir ultra' in nm or 'shivani' in nm or 'sashvan' in nm or 'dhiraj' in nm or 'dhirj' in nm or n in (438,): return 'thirdparty'
    if any(x in nm for x in ['existing','exsiting','(e)','[e]','exting']) or 'existing' in tg: return 'existing'
    return 'other'
cats=collections.Counter()
for n,c in calls.items():
    c['cat']=cat(n,c); cats[c['cat']]+=1
print(cats)
for n,c in calls.items():
    if c['cat']=='other': print(n,c['name'],'|',c['tags'][:80])
json.dump(calls,open('calls2.json','w'),ensure_ascii=False)
