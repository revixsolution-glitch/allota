import pickle,re,sys
d=pickle.load(open('calls.pkl','rb'))
def tr(n):
    p=d[n]; i=p.find('```text'); s=p[i+7:].rsplit('```',1)[0].strip(); return re.sub(r'\n+',' / ',s)
if __name__=='__main__':
    cap=int(sys.argv[1])
    for a in sys.argv[2:]:
        n=int(a); print(f"#{n}: {tr(n)[:cap]}\n")
