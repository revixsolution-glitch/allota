import json,re,collections
calls={int(k):v for k,v in json.load(open('calls.json')).items()}
seg={int(k):v for k,v in json.load(open('seg.json')).items()}
T={
 'stock/availability':r'stock|availab|shortage|out of stock|khatam|short hone|aane wale|next week|next month',
 'price/rate':r'\brate|\bmrp|pricing|price|negotiat|discount|mehng|costly|scheme',
 'payment/ledger/dues':r'payment|ledger|\bdues\b|udhaar|udhari|credit|advance|neft|upi|qr|scanner|account',
 'dispatch/bilty/tracking/transport':r'dispatch|bilt|bilty|\blr\b|transport|courier|tracking|delivery|freight|consignment|shipment',
 'bill/invoice/GST':r'\bbill|invoice|gst|e-way|pi\b|proforma|performa',
 'WhatsApp list/catalog/photo':r'whatsapp|catalog|product list|photo|picture|rate list',
 'MOQ/batch/quantity':r'moq|minimum|batch|\b\d+ (box|cases|case|dabbe|petti|units|boxes)',
 'third-party manufacturing':r'third.?party|3rd party|3 party|manufactur',
 'PCD/monopoly/territory':r'\bpcd\b|monopoly|franchise|territory|district',
 'return/expiry/damaged':r'return|expir|damage|replacement',
 'certificates/licence/WHO-GMP':r'who|gmp|certificate|licen|\bdl\b|iso\b',
 'complaint/delay frustration':r'shikayat|complain|frustrat|narazgi|chinta|concern|delay',
 'promo material (visual aid/bag/pen)':r'visual aid|marketing|promotional|\bbag\b|pen\b|diary|literature|reminder',
 'callback/busy':r'callback|call back|busy|baad mein call|dobara call',
}
for name,pat in T.items():
    rx=re.compile(pat,re.I)
    for src,label in (('sum','summary+tags'),('tr','transcript')):
        pass
def hit(c,rx,src):
    txt=(c['sum']+' '+c['tags']) if src=='sum' else c['tr']
    return bool(rx.search(txt))
for segname in ('customer_facing',):
    ns=[n for n in calls if seg[n]==segname and calls[n]['dur']>=30]
    print(segname,'calls>=30s:',len(ns),'all:',sum(1 for n in calls if seg[n]==segname))
    for name,pat in T.items():
        rx=re.compile(pat,re.I)
        a=sum(hit(calls[n],rx,'sum') for n in ns); b=sum(hit(calls[n],rx,'tr') for n in ns)
        print(f'{name:40s} summary {a:4d}  transcript {b:4d}')
