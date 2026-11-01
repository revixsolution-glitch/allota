import json,re,collections
c=json.load(open('calls.json'))
def grp(x):
    n=x['name']; s=x['sum']; t=x['tags']; nl=n.lower()
    if 'Google Drive Sync' in t and x['dur']==25: return 'STUB'
    if x['dur']<=0: return 'MISSED'
    if re.search(r'Personal Call|Wrong Number|Spam|Audio Testing|Mic Test|Pocket Dial|Casual Call|Silent|No Conversation|Call Disconnected|No Response|Automated|IVR|Dead Lead, Call Dropped',t+s[:0]) and not re.search(r'Existing|\(E\)',n) : pass
    if re.search(r'^(Kanu|Kanu Di|Naresh Cnt|M Masi|Meenu|Poonm Cnt|Tailor Usha)$',n) and x['n']>=533 or n in('Kanu',) and x['n'] in(524,525) or n.startswith('Kartik (Samsung'): 
        if x['n'] in(526,527,528,531): return 'PROSPECT'
        return 'PERSONAL'
    return None
