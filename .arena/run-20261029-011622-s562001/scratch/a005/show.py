import json,sys
c=json.load(open('calls.json'))
lim=int(sys.argv[1])
for a in sys.argv[2:]:
    x=c[int(a)-1]
    print('=====',x['n'],x['name'],x['t'],x['dur'],x['tags']); print(x['tr'][:lim]); print()
