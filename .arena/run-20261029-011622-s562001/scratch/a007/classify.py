import re,json,collections
from show import calls,tr
rows={}
for line in open('/Users/kartikchaudhary/revix/pharma-crm/.arena/corpus/savi_summaries.md'):
    m=re.match(r'#(\d+) \| (.*?) \| (\d{4}-\d\d-\d\d) (\d\d:\d\d) IST \| (\w+) \| (\d+)s \| tags: (.*)',line.strip())
    if m:
        n=int(m.group(1)); rows[n]=dict(n=n,name=m.group(2),date=m.group(3),time=m.group(4),dir=m.group(5),dur=int(m.group(6)),tags=m.group(7))
summ={}
cur=None
for line in open('/Users/kartikchaudhary/revix/pharma-crm/.arena/corpus/savi_summaries.md'):
    m=re.match(r'#(\d+) \|',line)
    if m: cur=int(m.group(1)); continue
    if cur and line.strip() and cur in rows and 'sum' not in rows[cur]: rows[cur]['sum']=line.strip()
TEST={125,126,206,241,482,493,504,521,526,527,528,529,530,531,532,541}
def cat(r):
    n=r['n'];nm=r['name'];t=r['tags'];low=nm.lower()
    if n in TEST: return 'TEST'
    if 'Personal Call' in t or re.search(r'^(Kanu|Kanu Di|Tailor Usha|Naresh Cnt|M Masi|Meenu|Poonm Cnt)$',nm): return 'PERSONAL'
    if nm in('Tarun Sir','Kesrox Office','Narendr Kumar Ca Accin','Shivani Product Status','Deepak Rao Shivani Pharma Baddi','Ph Kartik Gautam Dispatch','Shubham Sashvan Healthcare','Sashvan Sumit Gupta Mfg') : return 'INTERNAL'
    if re.search(r'Pickup Transport|Courier|Delhivery|Transport|TPT|Cargo|Bharat Singh|NATHU RAM|Dtdc',nm) and not 'Aakash' in nm: return 'LOGISTICS'
    if nm in('+919319414433','+918882212526','+918037812840'): return 'VENDOR_SOLICIT'
    if nm in('Suspected Spam','Potential Fraud'): return 'SPAM_WRONG'
    if re.search(r'Wrong Number|Spam|Audio Testing|Mic Test|IVR|Pocket Dial|Call Disconnected|No Response|Silent|Call Initiation|Call Dropped',t) and r['dur']<30: return 'SPAM_WRONG'
    if re.search(r'3 ?party|3rd Party|Third-party|Mfg|^RIZWAN|\+917387238158|\+919304367645|Vicky Romas|^8240447803|Dhiraj Kumar Singh|Verma Healthcare|\+91 98912 76671|Jadish',nm,re.I): return 'TPM'
    if re.search(r'Existing|\(E\)|\[E|EXISTING|Exsiting',nm) or re.search(r'Raj Kamal Drug|Raj Laxmi|Niraj Medical|Pawan Pandey|Aakash|Sumit Kumar Arti|Krishna Bannerjee|Jai Maha Laxmi|Gomti|SUMAN|Maa Tara|Kalyani|Spandan|Taj Medical|Shree Hari|Jayanta|Navkar|Balrampur|Bijay|RAJAN|Umang|Koderma|Limrax|Maveer|Dhanwantri|Rameshwari|Shanti Pharma|Paul Medicine|Janta|Jyoti Medical|Manab Gosh|Govind Medical|Rimedile|Man Care|Tamana|Sa Pharma|Krishna Enterprise|Nasir|Ashirwad|Purushottam|Saket|Shubh Pharma|Dr Deepak Sagar|Apr Shivam|Tiwari Ji|Dharmendra|Sumit Gupta|Dr Saurabh|Himanshu|Assam +Health|Rajesh Kumar Pandey|RAJESH KUMAR PANDAY|Mahadev|Maa Pharma',nm): return 'EXISTING'
    if re.search(r'Google|\bFb\b|Inmrt|INDIAMART|Indiamart|India Mart|IndiaMART',nm) or nm in('9928472561','8858807623'): return 'NEWLEAD_COLD'
    if re.search(r'Umesh Pandey|Ambesh|Dr\. Sandeep|Debu|Kanu',nm): return 'NEWLEAD_LIVE'
    return 'OTHER'
for n,r in rows.items(): r['cat']=cat(r)
if __name__=='__main__':
    c=collections.Counter(r['cat'] for r in rows.values()); print(len(rows),c)
    for k in ('OTHER',):
        for r in rows.values():
            if r['cat']==k: print(r['n'],r['name'],r['tags'][:60],r['dur'])
