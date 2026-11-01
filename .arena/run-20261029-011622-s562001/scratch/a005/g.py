import sys,re; sys.path.insert(0,'.')
from cls import *
pat=re.compile(sys.argv[1],re.I)
lim=int(sys.argv[2]) if len(sys.argv)>2 else 12
k=0
for x in c:
    if len(sys.argv)>3 and cat(x) not in sys.argv[3].split(','): continue
    for l in x['tr'].split('\n'):
        if pat.search(l):
            print(x['n'],cat(x),'|',l.strip()[:230]); k+=1; break
    if k>=lim: break
