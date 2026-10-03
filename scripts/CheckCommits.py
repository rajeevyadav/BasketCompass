"""Fail closed on unauthorized metadata; never mutate commit history."""
import os,re,subprocess,sys
owner=os.environ.get('OWNER_EMAIL','').strip()
if not owner: sys.exit('Set OWNER_EMAIL to the owner-authorized commit email.')
raw=subprocess.check_output(['git','log','--all','--format=%H%x00%ae%x00%ce%x00%B%x00']).decode()
parts=raw.split('\0')
for i in range(0,len(parts)-3,4):
    sha,author,committer,message=parts[i:i+4]
    if author != owner or committer != owner: sys.exit('Unauthorized commit identity: '+sha.strip())
    if re.search(r'(?i)\b(ai|chatgpt|codex|copilot|claude|gemini|bot)\b|co-authored-by|generated.by',message):
        sys.exit('Prohibited commit attribution: '+sha.strip())
print('Commit metadata policy passed.')
