import re,sys
t=open('/Users/kartikchaudhary/revix/pharma-crm/exports/savi_ai_summaries_master_doc.md').read()
parts=re.split(r'\n(?=## Call #)',t)
d={}
for p in parts:
    m=re.match(r'## Call #(\d+)',p)
    if m:
        tr=re.search(r'```text\n(.*?)```',p,re.S)
        d[int(m[1])]=tr[1] if tr else ''
import pickle;pickle.dump(d,open('d.pkl','wb'))
