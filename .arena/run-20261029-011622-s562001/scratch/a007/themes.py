from final import *
T={
'rate_price':r'\brate\b|\bprice\b|\bMRP\b|rupaye|rupay|kitne ka|kitna pad|\bPTR\b|\bPTS\b',
'price_pushback':r'rate (kam|zyada|high|bahut)|kam kar|kam karo|kam kijiye|mehenga|mehnga|rate high|rate badh|rate increase|discount|best rate|jyada hai|zyada hai|neeche|rate down',
'stock_avail':r'\bstock\b|available|availability|khatam|short hai|nahi hai|aa jayega|aayega|aa gaya|mil jayega|nahi mil',
'dispatch_tracking':r'dispatch|bilty|bilti|\bLR\b|tracking|nikal gaya|nikla|nikal gayi|pahunch|pahuch|kab tak aa|transport|courier|consignment|\bBLT\b',
'payment':r'payment|screenshot|\bQR\b|scanner|\bNEFT\b|\bUPI\b|account number|bank|ledger|advance|Google Pay|PhonePe|GPay',
'credit_udhar':r'udhar|udhari|\bcredit\b|credit period|limit',
'advance_terms':r'advance|50 ?%|30 ?%|bina advance|pehle payment',
'scheme_offer':r'scheme|offer|free mein|free hai|bonus|gift',
'territory_monopoly':r'monopoly|territory|district|\barea\b|jila|zila',
'license_gst':r'license|licence|\bDL\b|\bGST\b|drug licen|GSTIN|\bPAN\b',
'moq_batch':r'\bMOQ\b|minimum|batch|\bmin\b|kam se kam|minimum order|300 box|200 box',
'catalog_list_photo':r'\blist\b|catalog|catalogue|photo|\bpic\b|picture|image|\blister\b',
'whatsapp':r'whatsapp|whats app|WhatsApp',
'marketing_material':r'visual aid|\bbag\b|literature|reminder|promotional|\bpen\b|diary|sample|booklet|marketing',
'cert_quality':r'WHO|GMP|certificate|\bISO\b|quality|approval|food license|food|drug license',
'return_expiry':r'expiry|expire|return|exchange|near.expiry|wapas',
'complaint':r'shikayat|shikaayat|complain|damaged|toot|kharab|galat|short aaya|nahi mila|mila nahi',
'bill_invoice':r'\bbill\b|invoice|e-way|eway|proforma|\bPI\b|billing',
'callback_time':r'baad mein|baad me|callback|call back|call karna|call karta|call karunga|busy|kal (subah|sham)|sham ko|shaam ko',
'packing_pack':r'packing|pack\b|carton|mono|strip|\bml\b|100ml|200ml|foil|alu|aloo',
'new_product':r'naya|new product|naye products|launch',
'third_party_brand':r'third.party|brand|cylinder|inventory|apna brand|own brand|composition|formulation|molecule',
}
def counts(cats):
    ns=[n for n,r in rows.items() if r['cat'] in cats]
    out={}
    for k,p in T.items():
        rx=re.compile(p,re.I)
        out[k]=sum(1 for n in ns if rx.search(tr(n)))
    return len(ns),out
if __name__=='__main__':
    for name,cats in [('EXISTING',{'EXISTING'}),('TPM',{'TPM'}),('NEWLEAD',{'NEWLEAD_COLD','NEWLEAD_LIVE'}),('LOGISTICS',{'LOGISTICS'}),('INTERNAL',{'INTERNAL'})]:
        n,o=counts(cats); print(name,n); print({k:v for k,v in o.items()})
