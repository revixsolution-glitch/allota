import json,re,collections
c=json.load(open('calls.json'))
S=lambda *a:set(a)
def R(a,b): return set(range(a,b+1))
STUB=S(*[x['n'] for x in c if 'Google Drive Sync' in x['tags'] and x['dur']==25])
TEST=S(521,524,525,526,527,528,529,530,531,532)|S(126,206,241,493,504,541,482)  # test-day + scripted-looking
PERSONAL=S(*[x['n'] for x in c if re.search(r'Personal|Casual Call|Pocket Dial|Wrong Number|Audio Testing|Mic Test|Silent Call|Dead Lead, Call Disconnected',x['tags'])])
SPAMVENDOR=S(313,445,457,458,487,202,227,234,10,82,248,373,317,357,41,405*0)
LOGI_NAMES=r'Pickup Transport|Courier Near|Nav Bharat|TPT|Baluni Cargo|Delhivery|Dtdc|Dispatch$|NATHU RAM|Bharat Singh|Awadh'
INTERNAL=r'^Tarun Sir$|Narendr Kumar|Kesrox Office'
TP=r'3 Party|3party|3rd Party|Third-party|Mfg|RIZWAN|^\+917387238158|Vicky Romas|^\+919304367645|^8240447803|Dhiraj Kumar|Verma Healthcare|^\+91 98912 76671|Shivani'
LEADSRC=r'(?i:google)|\bFb\b|Inmrt|India ?Mart|^9890467519|^9928472561|^8858807623|sonuk|V K Medical|Abdul Saquib|Raipur|Mau Up|Jodhpur|सोनु'
EXIST=r'Exist|Exsiting|\(E\)|EXISTING|\[E'
def cat(x):
    n=x['name']; k=x['n']
    if k in STUB: return 'stub'
    if k in (125,): return 'missed'
    if k in TEST: return 'test_scripted'
    if k in SPAMVENDOR and k not in (41,): return 'vendor_spam_wrong'
    if k in (41,294,36,11,255,261,466,471): return 'cold_outreach'
    if k in (277,413): return 'personal_noise'
    if k in (22,23,84): return 'supplier_chain'
    if k==273: return 'logistics'
    if k in (198,417): return 'customer'
    if k in PERSONAL and not re.search(EXIST,n): return 'personal_noise'
    if re.search(INTERNAL,n): return 'internal'
    if re.search(LOGI_NAMES,n): return 'logistics'
    if re.search(TP,n): return '3p'
    if re.search(LEADSRC,n) and not re.search(EXIST,n): return 'cold_outreach'
    if k in (205,293,294,295,307,308,41,437,439,51,44): return 'cold_outreach'
    return 'customer'
cats=collections.Counter(); byc=collections.defaultdict(list)
for x in c:
    ct=cat(x); cats[ct]+=1; byc[ct].append(x['n'])
if __name__=='__main__':
    print(cats)
    for k,v in byc.items(): print(k,len(v),v if len(v)<120 else v[:60])
