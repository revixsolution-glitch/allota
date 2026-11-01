import pickle,re,collections
calls=pickle.load(open('calls.pkl','rb'))
SYN={126,206,241,482,493,504,526,527,528,531,541}
for c in calls:
    n=c['n']; txt=(c['tags']+' '+c['sum']).lower()
    if n in SYN: c['seg']='synthetic?'
    elif c['internal']: c['seg']='internal/personal/vendor/ops'
    elif re.search(r'Google|\bFb\b',c['name']) or n==168: c['seg']='form-lead callback (Savi cold call)'
    elif c['existing']: c['seg']='existing customer'
    else: c['seg']='other'
    if c['seg']=='other':
        if c['dur']<20 or 'google drive sync' in txt or 'analyzed by ai' in txt: c['seg']='other:stub/short/failed'
        elif re.search(r'third.party|3 party|3rd party|3party|manufactur',txt) : c['seg']='other:manufacturing (either side)'
        elif re.search(r'wrong number|spam|courier service|logistics vendor|software promo',txt): c['seg']='other:junk/vendor-pitch'
        else: c['seg']='other:trade customers not labelled existing'
cnt=collections.Counter(c['seg'] for c in calls)
for k,v in cnt.most_common(): print(v,k)
print(sum(cnt.values()))
pickle.dump(calls,open('calls2.pkl','wb'))
# topics in existing+trade other
topics={
 'payment/ledger/QR':r'payment|ledger|udhaar|neft|qr|clearance|settlement|dues',
 'dispatch/bilty/tracking/transport':r'dispatch|bilt|bilty|lr copy|blt|tracking|transport|courier|delivery|consignment|parcel',
 'stock availability/shortage':r'stock|availability|available|shortage|out of stock|short ',
 'order placed/confirmed':r'order (place|confirm|finaliz)|order diya|order manga|naya order|bulk order|order confirmed',
 'rate/price/negotiation':r'rate|price|pricing|mrp|negotiat',
 'return/expiry':r'return|expir',
 'complaint/dissatisfaction':r'shikayat|complain|frustrat|narazgi|damaged|chinta|dissatisf|issue',
 'bill/invoice/GST/docs':r'bill|invoice|gst|pan card|e-way|kyc',
 'photo/list/catalog on WhatsApp':r'whatsapp',
}
grp=[c for c in calls if c['seg'] in ('existing customer','other:trade customers not labelled existing')]
print('trade n',len(grp))
for k,p in topics.items():
    print(f"{sum(1 for c in grp if re.search(p,(c['tags']+' '+c['sum']).lower())):4}  {k}")
form=[c for c in calls if c['seg'].startswith('form')]
print('form',len(form), 'whatsapp mention',sum('whatsapp' in c['sum'].lower() for c in form))
