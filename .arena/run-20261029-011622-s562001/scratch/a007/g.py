import sys,re
from final import *
pat=re.compile(sys.argv[1],re.I)
cats=set(sys.argv[2].split(',')) if len(sys.argv)>2 and sys.argv[2]!='ALL' else None
lim=int(sys.argv[3]) if len(sys.argv)>3 else 40
w=int(sys.argv[4]) if len(sys.argv)>4 else 260
k=0
for n in sorted(rows):
    r=rows[n]
    if r['cat'] in ('TEST','STUB','PERSONAL'): continue
    if cats and r['cat'] not in cats: continue
    for line in tr(n).split('\n'):
        if pat.search(line):
            print('#%d [%s] %s'%(n,r['cat'][:5],line[:w])); k+=1
            if k>=lim: sys.exit()
