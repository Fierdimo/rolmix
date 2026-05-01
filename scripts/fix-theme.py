import sys

f = r'e:\projects\rolmix\screens\CharacterEditorScreen.tsx'
c = open(f, encoding='utf-8').read()

# Backgrounds - dark to light
bg = [
    ("backgroundColor: '#0f0c29'", "backgroundColor: '#f5f3ff'"),
    ("backgroundColor: '#1e1b4b'", "backgroundColor: '#ffffff'"),
    ("backgroundColor: 'rgba(15,12,41,0.6)'", "backgroundColor: '#f5f3ff'"),
    ("backgroundColor: 'rgba(15,12,41,0.55)'", "backgroundColor: '#fff4f4'"),
    ("backgroundColor: 'rgba(15,12,41,0.5)'", "backgroundColor: '#f9f8ff'"),
    ("backgroundColor: 'rgba(15,12,41,0.4)'", "backgroundColor: '#f5f3ff'"),
    ("backgroundColor: 'rgba(255,255,255,0.04)'", "backgroundColor: '#faf9ff'"),
    ("backgroundColor: 'rgba(255,255,255,0.06)'", "backgroundColor: '#f5f3ff'"),
    ("backgroundColor: 'rgba(255,255,255,0.07)'", "backgroundColor: '#f5f3ff'"),
    ("backgroundColor: 'rgba(255,255,255,0.08)'", "backgroundColor: '#ede9fe'"),
    ("backgroundColor: 'rgba(255,255,255,0.1)'", "backgroundColor: 'rgba(109,40,217,0.06)'"),
    ("backgroundColor: 'rgba(30,20,70,0.5)'", "backgroundColor: '#f0ecff'"),
    ("backgroundColor: 'rgba(124,58,237,0.08)'", "backgroundColor: '#ede9fe'"),
    ("backgroundColor: 'rgba(124,58,237,0.1)'", "backgroundColor: '#ede9fe'"),
    ("backgroundColor: 'rgba(124,58,237,0.15)'", "backgroundColor: 'rgba(109,40,217,0.10)'"),
    ("backgroundColor: 'rgba(124,58,237,0.18)'", "backgroundColor: 'rgba(109,40,217,0.12)'"),
    ("backgroundColor: 'rgba(124,58,237,0.2)'", "backgroundColor: 'rgba(109,40,217,0.14)'"),
    ("backgroundColor: 'rgba(124,58,237,0.25)'", "backgroundColor: 'rgba(109,40,217,0.18)'"),
    ("backgroundColor: 'rgba(124,58,237,0.28)'", "backgroundColor: 'rgba(109,40,217,0.22)'"),
    ("backgroundColor: 'rgba(124,58,237,0.3)'", "backgroundColor: 'rgba(109,40,217,0.22)'"),
    ("backgroundColor: 'rgba(124,58,237,0.4)'", "backgroundColor: 'rgba(109,40,217,0.30)'"),
    ("backgroundColor: 'rgba(124,58,237,0.5)'", "backgroundColor: '#6d28d9'"),
    ("backgroundColor: 'rgba(0,0,0,0.7)'", "backgroundColor: 'rgba(15,12,41,0.50)'"),
    ("backgroundColor: 'rgba(239,68,68,0.18)'", "backgroundColor: '#fee2e2'"),
    ("backgroundColor: 'rgba(239,68,68,0.12)'", "backgroundColor: '#fee2e2'"),
    ("backgroundColor: 'rgba(52,211,153,0.12)'", "backgroundColor: '#d1fae5'"),
    ("backgroundColor: 'rgba(167,139,250,0.15)'", "backgroundColor: 'rgba(109,40,217,0.10)'"),
    ("backgroundColor: 'rgba(167,139,250,0.7)'", "backgroundColor: '#6d28d9'"),
    ("backgroundColor: 'rgba(34,197,94,0.12)'", "backgroundColor: '#d1fae5'"),
    ("backgroundColor: 'rgba(34,197,94,0.25)'", "backgroundColor: '#d1fae5'"),
    ("backgroundColor: 'rgba(251,191,36,0.12)'", "backgroundColor: '#fef9c3'"),
    ("backgroundColor: 'rgba(148,163,184,0.12)'", "backgroundColor: '#f1f5f9'"),
]

# Text colors - light to dark (in style declarations)
txt = [
    ("color: '#e2e8f0'", "color: '#1e1b3a'"),
    ("color: '#e2d9ff'", "color: '#1e1b3a'"),
    ("color: '#cbd5e1'", "color: '#374151'"),
    ("color: '#f1f5f9'", "color: '#1e1b3a'"),
    ("color: '#fef2f2'", "color: '#1e1b3a'"),
    ("color: '#a78bfa'", "color: '#6d28d9'"),
    ("color: '#c4b5fd'", "color: '#5b21b6'"),
    ("color: '#94a3b8'", "color: '#6b7280'"),
    ("color: '#64748b'", "color: '#9ca3af'"),
    ("color: '#475569'", "color: '#6b7280'"),
    ("color: '#34d399'", "color: '#059669'"),
    ("color: '#fbbf24'", "color: '#d97706'"),
    ("color: '#f87171'", "color: '#b91c1c'"),
    ("color: '#f59e0b'", "color: '#d97706'"),
    ("color: '#22c55e'", "color: '#059669'"),
    ("color: '#7c3aed'", "color: '#6d28d9'"),
]

# Border colors
borders = [
    ("borderColor: 'rgba(167,139,250,0.15)'", "borderColor: 'rgba(109,40,217,0.12)'"),
    ("borderColor: 'rgba(167,139,250,0.1)'", "borderColor: 'rgba(109,40,217,0.08)'"),
    ("borderColor: 'rgba(167,139,250,0.2)'", "borderColor: 'rgba(109,40,217,0.15)'"),
    ("borderColor: 'rgba(167,139,250,0.25)'", "borderColor: 'rgba(109,40,217,0.18)'"),
    ("borderColor: 'rgba(167,139,250,0.3)'", "borderColor: 'rgba(109,40,217,0.22)'"),
    ("borderColor: 'rgba(167,139,250,0.18)'", "borderColor: 'rgba(109,40,217,0.14)'"),
    ("borderColor: 'rgba(124,58,237,0.2)'", "borderColor: 'rgba(109,40,217,0.15)'"),
    ("borderColor: 'rgba(124,58,237,0.25)'", "borderColor: 'rgba(109,40,217,0.18)'"),
    ("borderColor: 'rgba(124,58,237,0.3)'", "borderColor: 'rgba(109,40,217,0.22)'"),
    ("borderColor: 'rgba(124,58,237,0.4)'", "borderColor: 'rgba(109,40,217,0.30)'"),
    ("borderColor: 'rgba(255,255,255,0.08)'", "borderColor: 'rgba(109,40,217,0.08)'"),
    ("borderColor: 'rgba(255,255,255,0.1)'", "borderColor: 'rgba(109,40,217,0.08)'"),
    ("borderColor: 'rgba(255,255,255,0.06)'", "borderColor: 'rgba(109,40,217,0.06)'"),
    ("borderColor: 'rgba(52,211,153,0.3)'", "borderColor: 'rgba(5,150,105,0.30)'"),
    ("borderColor: 'rgba(248,113,113,0.25)'", "borderColor: 'rgba(239,68,68,0.30)'"),
    ("borderColor: 'rgba(56,189,248,0.45)'", "borderColor: 'rgba(14,165,233,0.45)'"),
    ("borderColor: 'rgba(248,113,113,0.45)'", "borderColor: 'rgba(239,68,68,0.45)'"),
    ("borderColor: 'rgba(239,68,68,0.35)'", "borderColor: 'rgba(239,68,68,0.30)'"),
    ("borderColor: 'rgba(34,197,94,0.45)'", "borderColor: 'rgba(5,150,105,0.40)'"),
    ("borderColor: 'rgba(148,163,184,0.25)'", "borderColor: 'rgba(107,114,128,0.25)'"),
    ("borderColor: '#7c3aed'", "borderColor: '#6d28d9'"),
    ("borderColor: '#22c55e'", "borderColor: '#059669'"),
    ("borderColor: '#a78bfa'", "borderColor: '#6d28d9'"),
]

# Non-text color replacements (direct values)
other = [
    ("backgroundColor: '#7c3aed'", "backgroundColor: '#6d28d9'"),
    ("color: '#7c3aed'", "color: '#6d28d9'"),
    ("shadowColor: '#7c3aed'", "shadowColor: '#6d28d9'"),
    # StatusBar
    ("barStyle=\"light-content\"", "barStyle=\"dark-content\""),
    ("backgroundColor=\"#0f0c29\"", "backgroundColor=\"#ffffff\""),
    # Header border
    ("borderBottomColor: 'rgba(167,139,250,0.15)'", "borderBottomColor: 'rgba(109,40,217,0.12)'"),
    # input fields
    ("color: '#fff',\n    borderWidth:", "color: '#1e1b3a',\n    borderWidth:"),
    # saveText
    ("color: '#7c3aed', fontWeight: '700'", "color: '#6d28d9', fontWeight: '700'"),
]

for old, new in bg + txt + borders + other:
    c = c.replace(old, new)

# Fix header bg explicitly  
c = c.replace(
    "flexDirection: 'row', alignItems: 'center',\n    paddingTop: 48, paddingBottom: 12, paddingHorizontal: 12,\n    borderBottomWidth: 1, borderBottomColor: 'rgba(109,40,217,0.12)',\n  },",
    "flexDirection: 'row', alignItems: 'center',\n    paddingTop: 48, paddingBottom: 12, paddingHorizontal: 12,\n    borderBottomWidth: 1, borderBottomColor: 'rgba(109,40,217,0.12)',\n    backgroundColor: '#ffffff',\n  },"
)

open(f, 'w', encoding='utf-8').write(c)
print('Done!')
