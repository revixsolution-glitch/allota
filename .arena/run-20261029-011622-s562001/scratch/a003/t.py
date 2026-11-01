import pickle,re,sys
d=pickle.load(open('d.pkl','rb'))
def tr(n,m=1500):
    x=d[n]; i=x.find('```text'); s=x[i+7:]; s=s.split('```')[0].strip()
    return s[:m]
for a in sys.argv[2:]:
    print('=== #'+a); print(tr(int(a),int(sys.argv[1])))
