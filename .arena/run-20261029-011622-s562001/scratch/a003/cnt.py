import pickle,re
d=pickle.load(open('d.pkl','rb')); calls=pickle.load(open('calls.pkl','rb'))
def tr(n):
    x=d[n]; i=x.find('```text'); return x[i+7:].split('```')[0]
ext={c['n'] for c in calls if not c['internal'] and c['dur']>=20}
allc=set(d)
pats={
'bilty/LR/BLT':r'(?i)bilt[iy]|builty|\bLR\b|\bBLT\b',
'rate/price word':r'(?i)\brate\b|\brates\b|\bprice\b|\bMRP\b|\bdaam\b',
'rate too high/pushback':r'(?i)(rate|price|daam|mehang|mehng)[^.\n]{0,40}(zyada|jyada|high|mehang|mehng|badh|kam kar|kam kijiye)|(zyada|jyada|mehang|mehng)[^.\n]{0,30}(rate|ho gaya)|kam kijiye|rate kam',
'advance':r'(?i)advance',
'credit/udhar':r'(?i)udhar|udhaar|udhari|\bcredit\b|baad mein payment|delivery (pe|par) payment|bina advance',
'payment/QR/account':r'(?i)\bQR\b|scanner|account number|khata|NEFT|\bUPI\b|Google ?Pay|PhonePe|screenshot|payment',
'photo/picture':r'(?i)\bphoto|picture|\bpic\b|image',
'WhatsApp':r'(?i)whats ?app',
'stock/availability':r'(?i)\bstock\b|available|availability|khatam|short\b|shortage',
'kab tak/when':r'(?i)kab tak|kab aayega|kab milega|kab bhej|kitne din|kab dispatch|kab nikal',
'scheme/offer':r'(?i)\bscheme\b|offer|free mein|bonus|discount',
'MOQ/minimum/batch':r'(?i)\bMOQ\b|minimum|batch|\bmin\b',
'sample':r'(?i)\bsample',
'license/DL/GST':r'(?i)\blicen[sc]e\b|\bDL\b|\bGST\b|drug license|food license',
'WHO-GMP/certificate':r'(?i)WHO|GMP|certificate|ISO',
'monopoly/territory/district':r'(?i)monopoly|territory|district|area',
'visual aid/bag/literature':r'(?i)visual aid|\bbag\b|literature|reminder card|booklet|catalog|catalogue|product list|rate list|lister',
'expiry/return':r'(?i)expir|return|wapas|replace',
'transport/courier/freight':r'(?i)transport|courier|freight|delivery|dispatch|bhej',
'composition/brand own':r'(?i)composition|formulation|own brand|apna brand|carton|cylinder|monopack|mono pack|softgel|soft gel',
'cylinder/design':r'(?i)cylinder|design|carton',
'MD/sir se baat':r'(?i)\bMD\b|Tarun sir|senior|manager',
}
for k,p in pats.items():
    r=re.compile(p)
    a=sum(1 for n in allc if r.search(tr(n)))
    e=sum(1 for n in ext if r.search(tr(n)))
    print(f'{k:32} all={a:3} ext={e:3}')
print(len(ext))
