"""
Bulk apply light theme to all remaining component files.
Run from project root: python scripts/fix-theme-all.py
"""
import os, glob

FILES = glob.glob(r'e:\projects\rolmix\components\chat\*.tsx') + \
        glob.glob(r'e:\projects\rolmix\components\chat\*.ts')

# Colour mappings: (old, new)
REPLACEMENTS = [
    # Backgrounds
    ("backgroundColor: '#0f0c29'",               "backgroundColor: '#f5f3ff'"),
    ("backgroundColor: '#1e1b4b'",               "backgroundColor: '#ffffff'"),
    ("backgroundColor: '#13112e'",               "backgroundColor: '#fdfcff'"),
    ("backgroundColor: 'rgba(15,12,41,0.6)'",    "backgroundColor: '#f5f3ff'"),
    ("backgroundColor: 'rgba(15,12,41,0.55)'",   "backgroundColor: '#fff4f4'"),
    ("backgroundColor: 'rgba(15,12,41,0.5)'",    "backgroundColor: '#f9f8ff'"),
    ("backgroundColor: 'rgba(15,12,41,0.4)'",    "backgroundColor: '#f5f3ff'"),
    ("backgroundColor: 'rgba(255,255,255,0.04)'","backgroundColor: '#faf9ff'"),
    ("backgroundColor: 'rgba(255,255,255,0.05)'","backgroundColor: '#f5f3ff'"),
    ("backgroundColor: 'rgba(255,255,255,0.06)'","backgroundColor: '#f5f3ff'"),
    ("backgroundColor: 'rgba(255,255,255,0.07)'","backgroundColor: '#f5f3ff'"),
    ("backgroundColor: 'rgba(255,255,255,0.08)'","backgroundColor: '#ede9fe'"),
    ("backgroundColor: 'rgba(255,255,255,0.1)'", "backgroundColor: 'rgba(109,40,217,0.06)'"),
    ("backgroundColor: 'rgba(30,20,70,0.5)'",    "backgroundColor: '#f0ecff'"),
    ("backgroundColor: 'rgba(124,58,237,0.08)'", "backgroundColor: '#ede9fe'"),
    ("backgroundColor: 'rgba(124,58,237,0.1)'",  "backgroundColor: '#ede9fe'"),
    ("backgroundColor: 'rgba(124,58,237,0.15)'", "backgroundColor: 'rgba(109,40,217,0.10)'"),
    ("backgroundColor: 'rgba(124,58,237,0.18)'", "backgroundColor: 'rgba(109,40,217,0.12)'"),
    ("backgroundColor: 'rgba(124,58,237,0.2)'",  "backgroundColor: 'rgba(109,40,217,0.14)'"),
    ("backgroundColor: 'rgba(124,58,237,0.25)'", "backgroundColor: 'rgba(109,40,217,0.18)'"),
    ("backgroundColor: 'rgba(124,58,237,0.28)'", "backgroundColor: 'rgba(109,40,217,0.22)'"),
    ("backgroundColor: 'rgba(124,58,237,0.3)'",  "backgroundColor: 'rgba(109,40,217,0.22)'"),
    ("backgroundColor: 'rgba(124,58,237,0.4)'",  "backgroundColor: 'rgba(109,40,217,0.30)'"),
    ("backgroundColor: 'rgba(124,58,237,0.5)'",  "backgroundColor: '#6d28d9'"),
    ("backgroundColor: 'rgba(0,0,0,0.7)'",       "backgroundColor: 'rgba(15,12,41,0.50)'"),
    ("backgroundColor: 'rgba(0,0,0,0.6)'",       "backgroundColor: 'rgba(15,12,41,0.45)'"),
    ("backgroundColor: 'rgba(0,0,0,0.55)'",      "backgroundColor: 'rgba(15,12,41,0.40)'"),
    ("backgroundColor: 'rgba(239,68,68,0.18)'",  "backgroundColor: '#fee2e2'"),
    ("backgroundColor: 'rgba(239,68,68,0.12)'",  "backgroundColor: '#fee2e2'"),
    ("backgroundColor: 'rgba(239,68,68,0.1)'",   "backgroundColor: '#fee2e2'"),
    ("backgroundColor: 'rgba(52,211,153,0.12)'", "backgroundColor: '#d1fae5'"),
    ("backgroundColor: 'rgba(52,211,153,0.1)'",  "backgroundColor: '#d1fae5'"),
    ("backgroundColor: 'rgba(167,139,250,0.15)'","backgroundColor: 'rgba(109,40,217,0.10)'"),
    ("backgroundColor: 'rgba(167,139,250,0.35)'","backgroundColor: 'rgba(109,40,217,0.25)'"),
    ("backgroundColor: 'rgba(167,139,250,0.7)'", "backgroundColor: '#6d28d9'"),
    ("backgroundColor: 'rgba(34,197,94,0.12)'",  "backgroundColor: '#d1fae5'"),
    ("backgroundColor: 'rgba(34,197,94,0.25)'",  "backgroundColor: '#d1fae5'"),
    ("backgroundColor: 'rgba(251,191,36,0.12)'", "backgroundColor: '#fef9c3'"),
    ("backgroundColor: 'rgba(251,191,36,0.08)'", "backgroundColor: '#fef3c7'"),
    ("backgroundColor: 'rgba(148,163,184,0.12)'","backgroundColor: '#f1f5f9'"),
    ("backgroundColor: '#7c3aed'",               "backgroundColor: '#6d28d9'"),
    # Text colours
    ("color: '#e2e8f0'",  "color: '#1e1b3a'"),
    ("color: '#e2d9ff'",  "color: '#1e1b3a'"),
    ("color: '#cbd5e1'",  "color: '#374151'"),
    ("color: '#f1f5f9'",  "color: '#1e1b3a'"),
    ("color: '#fef2f2'",  "color: '#1e1b3a'"),
    ("color: '#a78bfa'",  "color: '#6d28d9'"),
    ("color: '#c4b5fd'",  "color: '#5b21b6'"),
    ("color: '#94a3b8'",  "color: '#6b7280'"),
    ("color: '#64748b'",  "color: '#9ca3af'"),
    ("color: '#475569'",  "color: '#6b7280'"),
    ("color: '#34d399'",  "color: '#059669'"),
    ("color: '#86efac'",  "color: '#065f46'"),
    ("color: '#fca5a5'",  "color: '#b91c1c'"),
    ("color: '#fbbf24'",  "color: '#d97706'"),
    ("color: '#f87171'",  "color: '#b91c1c'"),
    ("color: '#f59e0b'",  "color: '#d97706'"),
    ("color: '#7c3aed'",  "color: '#6d28d9'"),
    # Border colours
    ("borderColor: 'rgba(167,139,250,0.15)'",  "borderColor: 'rgba(109,40,217,0.12)'"),
    ("borderColor: 'rgba(167,139,250,0.1)'",   "borderColor: 'rgba(109,40,217,0.08)'"),
    ("borderColor: 'rgba(167,139,250,0.2)'",   "borderColor: 'rgba(109,40,217,0.15)'"),
    ("borderColor: 'rgba(167,139,250,0.25)'",  "borderColor: 'rgba(109,40,217,0.18)'"),
    ("borderColor: 'rgba(167,139,250,0.3)'",   "borderColor: 'rgba(109,40,217,0.22)'"),
    ("borderColor: 'rgba(167,139,250,0.18)'",  "borderColor: 'rgba(109,40,217,0.14)'"),
    ("borderColor: 'rgba(124,58,237,0.2)'",    "borderColor: 'rgba(109,40,217,0.15)'"),
    ("borderColor: 'rgba(124,58,237,0.25)'",   "borderColor: 'rgba(109,40,217,0.18)'"),
    ("borderColor: 'rgba(124,58,237,0.3)'",    "borderColor: 'rgba(109,40,217,0.22)'"),
    ("borderColor: 'rgba(124,58,237,0.4)'",    "borderColor: 'rgba(109,40,217,0.30)'"),
    ("borderColor: 'rgba(255,255,255,0.08)'",  "borderColor: 'rgba(109,40,217,0.08)'"),
    ("borderColor: 'rgba(255,255,255,0.1)'",   "borderColor: 'rgba(109,40,217,0.08)'"),
    ("borderColor: 'rgba(255,255,255,0.06)'",  "borderColor: 'rgba(109,40,217,0.06)'"),
    ("borderColor: 'rgba(52,211,153,0.3)'",    "borderColor: 'rgba(5,150,105,0.30)'"),
    ("borderColor: 'rgba(34,197,94,0.45)'",    "borderColor: 'rgba(5,150,105,0.40)'"),
    ("borderColor: '#7c3aed'",                 "borderColor: '#6d28d9'"),
    ("borderColor: '#a78bfa'",                 "borderColor: '#6d28d9'"),
    # Placeholder colours
    ('placeholderTextColor="#888"',      'placeholderTextColor="#9ca3af"'),
    ('placeholderTextColor="#475569"',   'placeholderTextColor="#9ca3af"'),
    ('placeholderTextColor="#64748b"',   'placeholderTextColor="#9ca3af"'),
    ('placeholderTextColor="#94a3b8"',   'placeholderTextColor="#9ca3af"'),
    # Shadow colours
    ("shadowColor: '#7c3aed'",   "shadowColor: '#6d28d9'"),
    # tagsStyles
    ("em: { color: '#e2e8f0'", "em: { color: '#374151'"),
]

total = 0
for path in FILES:
    c = open(path, encoding='utf-8').read()
    changed = 0
    for old, new in REPLACEMENTS:
        cnt = c.count(old)
        if cnt:
            c = c.replace(old, new)
            changed += cnt
    if changed:
        open(path, 'w', encoding='utf-8').write(c)
        print(f'Updated {os.path.basename(path)}: {changed} replacements')
        total += changed

print(f'\nTotal: {total} replacements across {len(FILES)} files')
