#!/usr/bin/env python3
import sys, json

try:
    j = json.load(sys.stdin)
    # try tunnels array
    if isinstance(j, dict) and 'tunnels' in j and isinstance(j['tunnels'], list) and j['tunnels']:
        for t in j['tunnels']:
            if 'public_url' in t:
                print(t['public_url'])
                sys.exit(0)
    # try simple dict with url
    if isinstance(j, dict):
        for k in ('public_url', 'url', 'https_url', 'forwarded_url'):
            if k in j:
                print(j[k])
                sys.exit(0)
except Exception:
    pass

sys.exit(1)
