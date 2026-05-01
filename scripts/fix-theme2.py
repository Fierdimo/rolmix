f = r'e:\projects\rolmix\screens\CharacterEditorScreen.tsx'
c = open(f, encoding='utf-8').read()
c = c.replace("trackColor={{ false: '#1e1b4b', true: '#7c3aed' }}", "trackColor={{ false: '#e5e7eb', true: '#6d28d9' }}")
# Also fix inline tagsStyles colors
c = c.replace("em: { color: '#e2e8f0', fontStyle: 'italic' }", "em: { color: '#374151', fontStyle: 'italic' }")
open(f, 'w', encoding='utf-8').write(c)
print('Done')
