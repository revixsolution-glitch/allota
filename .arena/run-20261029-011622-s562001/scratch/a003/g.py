import pickle,re,sys
d=pickle.load(open('d.pkl','rb'))
def tr(n):
    x=d[n]; i=x.find('```text'); return x[i+7:].split('```')[0]
p=re.compile(sys.argv[1]); lim=int(sys.argv[2]); rng=range(int(sys.argv[3]),int(sys.argv[4])+1) if len(sys.argv)>4 else sorted(d)
k=0
for n in rng:
    for l in tr(n).split('\n'):
        if p.search(l):
            print(n,'|',l.strip()[:230]); k+=1
            break
    if k>=lim: break
