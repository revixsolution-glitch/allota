import sys; sys.path.insert(0,'.')
from cls import *
T={
'whatsapp':r'whatsapp|watsapp',
'list_catalog_rate':r'list|catalog|catalogue|lister|excel',
'photo_pic':r'photo|picture|\bpic\b|image|tasveer',
'mrp':r'\bmrp\b',
'rate_price':r'\brate|\bprice|rupaye|rs\b|₹',
'discount_cut':r'kam kar|kam kij|less kar|discount|sasta|mahanga|high lag|zyada lag|rate badh|rate increase',
'stock_avail':r'stock|available|availab|khatam|short|aa jayega|aayega|nahi hai',
'expiry':r'expiry|expire',
'payment':r'payment|\bqr\b|scanner|screenshot|neft|gpay|google pay|phonepe|ledger|balance|dues|baki|bakaya',
'advance':r'advance',
'credit':r'udhar|udhaar|udhari|credit|cash pe|cash par|cash mein',
'bilty_track':r'bilty|bilti|\bblt\b|\blr\b|tracking|track|consignment',
'transport_courier':r'transport|courier|freight|trackon|delhivery|petti|peti',
'bill_gst':r'\bbill|invoice|gst|e-way|eway|challan|proforma|\bpi\b|performa',
'license_doc':r'licen[cs]e|\bdl\b|food|drug|gmp|\bwho\b|certificate|iso\b',
'monopoly_area':r'monopoly|district|area|territory',
'moq_batch':r'minimum|moq|batch|box banenge|box ban|200 box|300 box',
'cylinder_design':r'cylinder|inventory charge|artwork|design|carton|mono ?pack|packing|packaging|foil|alu',
'scheme_offer':r'scheme|offer|diwali|free|bonus',
'promo_material':r'visual aid|\bbag\b|\bpen\b|diary|promotional|marketing material|sample',
'return_replace':r'return|replace|wapas|exchange|near expiry|near-expiry',
'callback_time':r'baad mein call|call karna|call karta|baad me|kal call|shaam|subah|lunch',
'season_off':r'season|off-season|requirement nahi|requirement nahi hai',
}
def flags(x): 
    t=x['tr'].lower()
    return {k for k,p in T.items() if re.search(p,t)}
if __name__=='__main__':
    for b in ['customer','3p','cold_outreach','internal','logistics']:
        xs=[x for x in c if cat(x)==b]
        cnt=collections.Counter()
        for x in xs: cnt.update(flags(x))
        print(b,len(xs)); print('  ',{k:cnt[k] for k in T}); 
