import json,sys,re
calls={int(k):v for k,v in json.load(open('calls.json')).items()}
pat=re.compile(sys.argv[1],re.I); mx=int(sys.argv[2]) if len(sys.argv)>2 else 60
seen=set();out=[]
for n in sorted(calls):
    c=calls[n]
    for l in c['tr'].split('\n'):
        if pat.search(l): out.append((n,l.strip()[:230])); 
ns=sorted({n for n,_ in out})
print(len(ns),'calls',len(out),'lines:',ns)
for n,l in out[:mx]: print(n,'|',l)
