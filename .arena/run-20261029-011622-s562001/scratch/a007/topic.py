from final import *
RULES=[
('complaint_damage_wrong',r'shikayat|shikaayat|complaint|damaged|missing promotional|galat bill|mismatch|discrepancy|narazgi|dissatisf'),
('return_expiry_settlement',r'return|expiry|expired|near-expiry|exchange|replacement|credit/debit note|debit note'),
('payment_followup',r'payment|ledger|NEFT|UPI|screenshot|account|dues|settlement|udhar|credit terms|QR|clearance'),
('tracking_bilty_dispatch_status',r'bilty|bilti|LR copy|BLT|tracking|transport|delivery status|consignment|courier|dispatch status|dispatch ke|delivery delay|dispatch hone|dispatch kar'),
('order_placement_confirm',r'order (place|confirm|finalize|diya)|ne order|order ka|orders? (finalize|confirm)|cases|boxes|peti|dabbe'),
('stock_availability',r'stock|availability|available|shortage|out of stock|khatam'),
('price_rate',r'rate|price|pricing|MRP|negotiat'),
('catalog_photo_list',r'catalog|list|photo|picture|WhatsApp'),
]
def topic(n):
    r=rows[n]; s=(r.get('sum','')+' '+r['tags'])
    for k,p in RULES:
        if re.search(p,s,re.I): return k
    return 'other'
if __name__=='__main__':
    for cats in ({'EXISTING'},{'TPM'},{'NEWLEAD_COLD','NEWLEAD_LIVE'}):
        c=collections.Counter(topic(n) for n,r in rows.items() if r['cat'] in cats)
        print(cats,sum(c.values()),c.most_common())
