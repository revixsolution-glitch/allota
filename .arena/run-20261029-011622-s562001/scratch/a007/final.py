from classify import *
FIX={11:'EXISTING',40:'STUB',150:'STUB',89:'NEWLEAD_COLD',90:'EXISTING',136:'NEWLEAD_COLD',151:'NEWLEAD_COLD',178:'NEWLEAD_COLD',235:'LOGISTICS',248:'SPAM_WRONG',277:'LOGISTICS',284:'EXISTING',317:'SPAM_WRONG',357:'SPAM_WRONG',413:'EXISTING',459:'EXISTING',471:'SPAM_WRONG'}
for n,r in rows.items():
    if 'Google Drive Sync' in r['tags'] or 'Analyzed by AI' in r['tags']: r['cat']='STUB'
    elif n in FIX: r['cat']=FIX[n]
    if n==125: r['cat']='TEST'
    if n in(107,175): r['cat']='NEWLEAD_COLD'
    if n in(115,183,513,379) : r['cat']={115:'EXISTING',183:'EXISTING',513:'EXISTING',379:'SPAM_WRONG'}[n]
    if n==294: r['cat']='NEWLEAD_LIVE'
# Umesh Pandey Rohtas, Ambesh -> live new lead; 308 is Patan? fine
if __name__=='__main__':
    c=collections.Counter(r['cat'] for r in rows.values()); print(c, sum(c.values()))
    for k in ['NEWLEAD_COLD','NEWLEAD_LIVE','TPM','SPAM_WRONG','VENDOR_SOLICIT','STUB','INTERNAL']:
        print(k,[ (r['n'],r['name'][:22]) for r in rows.values() if r['cat']==k and k!='INTERNAL'][:70])
    print(collections.Counter(r['name'] for r in rows.values() if r['cat']=='INTERNAL'))
