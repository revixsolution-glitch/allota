import json,sys
calls={int(k):v for k,v in json.load(open('calls.json')).items()}
for a in sys.argv[1:]:
    if '-' in a: lo,hi=map(int,a.split('-')); ns=range(lo,hi+1)
    else: ns=[int(a)]
    for n in ns:
        c=calls[n]; print(f"--- #{n} {c['name'][:40]} {c['when']} {c['dur']}s\n{c['tr']}\n")
