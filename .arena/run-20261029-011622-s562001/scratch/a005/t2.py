import sys; sys.path.insert(0,'.')
from cls import *
P={
'whatsapp_word':r'whats ?app|watsapp',
'send_on_whatsapp':r'whats ?app[^.\n]{0,40}(bhej|send|kar de|karo|dal|dalo|kijiye)|(bhej|send|kar de|forward)[^.\n]{0,40}whats ?app',
'product_list':r'(product|rate|price|new|saari|puri|complete) ?list|catalog|lister|excel',
'photo':r'\bphoto|\bpic\b|picture|\bimage',
'mrp':r'\bmrp\b',
'expiry':r'expir',
'not_in_stock':r'stock (nahi|khatam|abhi nahi)|khatam|short hai|nahi aaya|aaya nahi|nahi mil raha|out of stock|available nahi|stock mein nahi',
'next_week_month':r'next week|agle hafte|next month|agle mahine|is hafte|10-15 din|15 din',
'payment_word':r'payment',
'qr_scanner':r'\bqr\b|scanner|screenshot|account number|naya account|new account|purane account',
'advance':r'advance',
'credit_udhar':r'udhar|udhaar|udhari|credit|cash pe|cash par|cash mein|cash deal',
'bilty':r'bilty|bilti|\bblt\b|\blr copy|\blr\b|tracking',
'transport':r'transport|courier|freight|trackon|tempo',
'bill':r'\bbill\b|invoice|e-way|eway|challan',
'gst':r'\bgst\b',
'rate_pushback':r'rate (kaafi |bahut |thoda )?(high|zyada|jyada|kam)|kam kar(o|iye|dijiye|dena)|thoda kam|less kar|mehnga|mahanga|sasta|rate badh|rate increase|rate high',
'moq':r'minimum|\bmoq\b|batch size|300 box|200 box',
'cylinder_inventory':r'cylinder|inventory charge|inventory',
'who_gmp':r'\bwho\b|gmp',
'licence':r'licen[cs]e|drug license|food license|\bdl\b',
'monopoly':r'monopoly',
'district_area':r'district|area|territory',
'scheme':r'scheme|diwali offer|offer',
'visual_aid_bag':r'visual aid|marketing bag|\bbag\b|\bpen\b|diary|reminder card|promotional',
'sample':r'\bsample',
'return':r'\breturn|wapas bhej|replace|exchange',
'dispatch':r'dispatch',
'order_word':r'\border\b',
'busy_callback':r'abhi busy|baad mein|baad me|phir (se )?call|dobara call|call karna|call karta|call karunga|call karenge',
'season_off':r'season',
'no_requirement':r'requirement nahi|zaroorat nahi|abhi nahi|filhal nahi|filhal to nahi',
'md_sir':r'md sir|\bmd\b|tarun sir|chauhan sir|vaibhav',
'monopoly_ask_price':r'kitna|kitne',
}
def fl(x):
    t=x['tr'].lower(); return {k for k,p in P.items() if re.search(p,t)}
def show(name,bucket,n=4):
    xs=[x for x in c if cat(x)==bucket and name in fl(x)]
    print(name,bucket,len(xs),[x['n'] for x in xs][:25])
if __name__=='__main__':
    B=['customer','3p','cold_outreach']
    for b in B:
        xs=[x for x in c if cat(x)==b]; cnt=collections.Counter()
        for x in xs: cnt.update(fl(x))
        print(b,len(xs),{k:cnt[k] for k in P})
