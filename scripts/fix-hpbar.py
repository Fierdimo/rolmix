f = r'e:\projects\rolmix\components\chat\CombatActionModal.tsx'
c = open(f, encoding='utf-8').read()
old = "hpPct > 0.5 ? '#34d399' : hpPct > 0.25 ? '#fbbf24' : '#f87171'"
new = "hpPct > 0.5 ? '#059669' : hpPct > 0.25 ? '#d97706' : '#dc2626'"
count = c.count(old)
c = c.replace(old, new)
open(f, 'w', encoding='utf-8').write(c)
print(f'Replaced {count} occurrences')
