import pickle,re,sys
d=pickle.load(open('calls.pkl','rb'))
def tr(n):
    m=re.search(r'```text\n(.*?)```',d[n],re.S)
    return m.group(1).strip() if m else ''
def show(n,a=0,b=1500):
    t=tr(n).replace('\n',' | ')
    print(f'--#{n} [{len(t)}]:',t[a:b]); print()
if __name__=='__main__':
    for arg in sys.argv[1:]:
        p=arg.split(':'); n=int(p[0]); a=int(p[1]) if len(p)>1 else 0; b=int(p[2]) if len(p)>2 else a+1500
        show(n,a,b)
