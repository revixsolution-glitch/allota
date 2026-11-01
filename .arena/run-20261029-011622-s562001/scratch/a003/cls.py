import re,pickle,json,collections
t=open('c.txt').read().split('\n')
calls=[]
i=0
while i<len(t):
    m=re.match(r'#(\d+)\|(.*?)\|(.*?)\|(\d+)s\|(.*)',t[i])
    if m:
        calls.append(dict(n=int(m[1]),name=m[2],ts=m[3],dur=int(m[4]),tags=m[5],sum=t[i+1] if i+1<len(t) else ''))
        i+=2
    else: i+=1
INTERNAL=r"Tarun Sir|AmbalaLocal|Shivam Enterprises|Delhivery|Narendr Kumar|^Kanu|Kartik \(Samsung|M Masi|Meenu|Tailor Usha|Naresh Cnt|Poonm|Suspected Spam|Potential Fraud|Kesrox Office|Baluni|NATHU|Nav Bharat|A One India|Ph Kartik|Bharat Singh|Sashvan|Shivani Product|Awadh|Pardeep|Debu"
for c in calls:
    c['internal']=bool(re.search(INTERNAL,c['name']))
    c['existing']=bool(re.search(r'(?i)existing|exsiting|\(E\)|\[E\]|\(E\b',c['name']+c['tags']))
    c['formlead']=bool(re.search(r'Google|\bFb\b|Inmrt|IndiaMART|India Mart|INDIAMART',c['name'])) and not c['existing']
print(len(calls))
ext=[c for c in calls if not c['internal']]
print('external',len(ext))
print('existing',sum(c['existing'] for c in ext),'formlead',sum(c['formlead'] for c in ext))
pickle.dump(calls,open('calls.pkl','wb'))
