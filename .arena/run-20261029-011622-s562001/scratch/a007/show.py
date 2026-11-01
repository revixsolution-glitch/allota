import json,sys
d=json.load(open('/Users/kartikchaudhary/revix/pharma-crm/exports/savi_ai_calls_complete.json'))
import re
# map call number via master doc order: master doc order equals summaries order? build from master doc
txt=open('/Users/kartikchaudhary/revix/pharma-crm/exports/savi_ai_summaries_master_doc.md').read()
parts=re.split(r'\n## Call #(\d+): ',txt)
calls={}
for i in range(1,len(parts),2):
    calls[int(parts[i])]=parts[i+1]
def tr(n):
    s=calls[n]
    m=re.search(r'```text\n(.*?)```',s,re.S)
    return m.group(1).strip() if m else ''
if __name__=='__main__':
    for a in sys.argv[1:]:
        n=int(a); head=calls[n].split('\n')[0]
        print('=== #%d %s'%(n,head[:60])); print(tr(n)[:int(3500)]); print()
