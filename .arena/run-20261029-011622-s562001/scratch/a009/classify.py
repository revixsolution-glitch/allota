import re,collections,pickle
calls=pickle.load(open('sum.pkl','rb'))
def cat(n,c):
    nm=c['name'].lower(); tg=c['tags'].lower(); s=c['sum'].lower()
    if n in (529,530,531,532): return 'TEST'
    if n in (526,527,528): return 'TEST'   # Kanu / Naresh scripted
    if n in (126,241,206,504,482,541,493,125): return 'GORAKHPUR_SCRIPTED' if n!=125 else 'MISSED'
    if re.search(r'm masi|meenu|tailor usha|naresh cnt|poonm|kanu di|^kanu$',nm) or 'personal call' in tg or 'personal' in tg and 'tarun' in nm: return 'PERSONAL'
    if 'tarun sir' in nm or 'kesrox office' in nm or 'narendr kumar' in nm: return 'INTERNAL'
    if re.search(r'pawan ambalalocal|shivam enterprises courier|delhivery|nav bharat|baluni|ranjor|awadh chd|a one india|nathu ram|^bharat singh|bigship|\+919319414433|\+918882212526',nm) or n in (313,445,457,458,487): return 'LOGISTICS'
    if re.search(r'3 party|3party|rizwan|ayurda|vicky|neeraj sir|7387238158|9304367645|third-party kanpur|8240447803|dhiraj kumar|98912 76671|jm lab',nm) or ('third-party manufacturing' in tg and not re.search(r'existing|\[e',nm) and 'google' not in nm): return 'TPM_BUYER'
    if re.search(r'google|\bfb\b|inmrt|indiamart|india mart|mau up',nm) and not re.search(r'existing|\[e\]|\(e\)|\[existing\]',nm): return 'NEW_LEAD'
    if re.search(r'existing|\(e\)|\[e\]|exsiting',nm): return 'EXISTING'
    if any(k in tg for k in ['wrong number','spam','no conversation','call disconnected','incomplete','silent']) : return 'NOISE'
    return 'OTHER'
cats=collections.defaultdict(list)
for n,c in calls.items(): cats[cat(n,c)].append(n)
for k,v in cats.items(): print(k,len(v))
pickle.dump(dict(cats),open('cats.pkl','wb'))
print('OTHER',[(n,calls[n]['name']) for n in cats['OTHER']])

ov={}
for n in [11,40,89,90,150,151,178,205,293,294,295,307,308,437,439,357,235]: ov[n]='NEW_LEAD'
for n in [227,248,317,413,466,471,277,6,10,82]: ov[n]='NOISE'
for n in [521]: ov[n]='TEST'
for n in [69]: ov[n]='TPM_BUYER'
for n in [84,22,23,24,25]: ov[n]='VENDOR_OR_MFR'
for n in [62,459,284]: ov[n]='LOGISTICS'
final={}
for n,c in calls.items():
    k=cat(n,c)
    if n in ov: k=ov[n]
    elif k=='OTHER': k='EXISTING'
    final[n]=k
cnt=collections.Counter(final.values()); print(cnt, sum(cnt.values()))
pickle.dump(final,open('final.pkl','wb'))
import statistics
for k in cnt:
    d=[calls[n]['dur'] for n in calls if final[n]==k]; print(k,sum(d)//60,'min', statistics.median(d))
h=collections.Counter(int(calls[n]['time'][:2]) for n in calls); print(sorted(h.items()))
