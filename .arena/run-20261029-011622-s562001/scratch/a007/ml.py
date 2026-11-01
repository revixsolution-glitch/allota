from final import *
import random
ML={
'payment_pending_or_confirm':r'payment|NEFT|UPI|screenshot|ledger|dues|settlement|QR|scanner|udhar|clearance|account mein|new account|naye account',
'order_status_bilty_tracking':r'bilty|bilti|LR copy|BLT|tracking|consignment|delivery status|dispatch status|shipment|transport',
'order_placement':r'order (place|confirm|finalize|diya|lagane|dene)|ne .{0,40}order|order ka|naya order|new order|bill banakar',
'stock_out_or_arrival':r'stock|availability|available|shortage|out of stock|khatam|aa jayega|next week|next month|raw material',
'price_rate_negotiation':r'\brate|price|pricing|MRP|negotiat|discount|rate zyada|rate kam',
'return_expiry':r'return|expiry|expired|near-expiry|exchange|replacement|debit note|credit note',
'complaint':r'shikayat|shikaayat|complain|damaged|missing|mismatch|galat|narazgi|frustrat|dissatisf|chinta|concern',
'photo_list_whatsapp':r'photo|picture|list|catalog|WhatsApp|whatsapp',
'transport_choice_freight':r'freight|transport charges|courier charges|Trackon|Spot ?On|A1|Golden|Shree Azad|Awadh|Balooni|Jetline|TrackOn',
'credit_terms':r'credit|udhar|advance',
'delay_reason_external':r'barish|baarish|rain|strike|Diwali|Dussehra|Durga|puja|Puja|festival|accident|bimar|illness|mela|kheti|season|landslide|holiday|chutti',
'bill_invoice_gst':r'\bbill|invoice|GST|e-way',
'new_product_inquiry':r'naye products|new product|naya product|product inquiry|new arrivals',
}
def mlcount(cats,sel=None):
    ns=[n for n,r in rows.items() if r['cat'] in cats]
    out={}
    for k,p in ML.items():
        rx=re.compile(p,re.I|re.U)
        hit=[n for n in ns if rx.search(rows[n].get('sum','')+' '+rows[n]['tags'])]
        out[k]=hit
    return ns,out
if __name__=='__main__':
    ns,out=mlcount({'EXISTING'})
    print(len(ns))
    for k,h in out.items(): print(k,len(h), round(100*len(h)/len(ns)))
    random.seed(1)
    for k in ('credit_terms','delay_reason_external','complaint'):
        print('---',k)
        for n in random.sample(out[k],8): print(n,rows[n]['sum'][:200])
