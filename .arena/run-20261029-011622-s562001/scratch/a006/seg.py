import json,re,collections
calls={int(k):v for k,v in json.load(open('calls.json')).items()}
tag=lambda c,x: x.lower() in c['tags'].lower()
seg={}
for n,c in calls.items():
    nm=c['name'].lower()
    if n in (521,529,530,531,532): s='test'
    elif n>=533 or tag(c,'personal call') or (nm.startswith('kanu') and n in(524,525)) or n in (370,): s='personal'
    elif nm in('tarun sir',): s='internal_owner'
    elif 'narendr kumar' in nm: s='internal_ca'
    elif 'spam' in nm and n not in(493,504): s='spam_ivr_vendor'
    elif n in (227,445,457,458,487,313,202): s='spam_ivr_vendor'
    elif any(x in nm for x in ['delhivery','courier','dtdc','transport','tpt','cargo','kesrox office','nathu ram','pawan ambalalocal','nav bharat']) and n not in(482,): s='logistics_contact'
    else: s='customer_facing'
    seg[n]=s
cnt=collections.Counter(seg.values()); print(cnt)
json.dump(seg,open('seg.json','w'))
