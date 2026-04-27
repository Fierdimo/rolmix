import { StyleSheet } from 'react-native';

/** Estilos compartidos entre los componentes del chat de sesión. */
export const chatStyles = StyleSheet.create({
  // ── Estructura principal ─────────────────────────────────
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: '#0f0c29' },

  // ── Header ───────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 48,
    paddingBottom: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(167,139,250,0.15)',
    backgroundColor: '#0f0c29',
  },
  backBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  backText: { color: '#a78bfa', fontSize: 32, lineHeight: 36 },
  headerCenter: { flex: 1, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  headerTitle: { color: '#e2e8f0', fontWeight: '700', fontSize: 16, maxWidth: '80%' },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#34d399' },
  menuBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  menuBtnText: { color: '#a78bfa', fontSize: 22 },

  // ── Lista de mensajes ────────────────────────────────────
  messagesList: { paddingVertical: 12, paddingBottom: 4 },
  emptyChat: {
    textAlign: 'center',
    color: '#64748b',
    marginTop: 80,
    fontSize: 15,
    lineHeight: 26,
  },

  // ── Banner de aviso ──────────────────────────────────────
  notice: {
    color: '#fbbf24',
    fontSize: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    textAlign: 'center',
  },
  noticeWrap: {
    backgroundColor: 'rgba(251,191,36,0.08)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(251,191,36,0.18)',
  },
  noticeButton: {
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: '#f59e0b',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  noticeButtonText: { color: '#1f2937', fontWeight: '800' },

  // ── Elementos de miembro (drawer) ────────────────────────
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  memberName: { color: '#fff', fontWeight: '700' },
  memberMeta: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
  memberActions: { flexDirection: 'row', gap: 8 },
  acceptButton: {
    backgroundColor: 'rgba(34,197,94,0.18)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  acceptButtonText: { color: '#86efac', fontWeight: '700', fontSize: 12 },
  rejectButton: {
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  rejectButtonText: { color: '#fca5a5', fontWeight: '700', fontSize: 12 },
  emptyLabel: { color: '#64748b', fontSize: 12 },

  // ── Invite row (en drawer) ───────────────────────────────
  inviteRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  inviteInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.2)',
  },
  inviteButton: {
    backgroundColor: '#7c3aed',
    borderRadius: 10,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  inviteButtonText: { color: '#fff', fontWeight: '700' },

  // ── Modal genérico (bottom sheet) ───────────────────────
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#1e1b4b',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 30,
  },
  modalTitle: { color: '#e2e8f0', fontSize: 16, fontWeight: '700', marginBottom: 12 },
  modalAction: {
    marginTop: 10,
    alignItems: 'center',
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
  },

  // ── Character picker ─────────────────────────────────────
  charPickRow: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginBottom: 6,
  },
  charPickName: { color: '#fff', fontWeight: '700' },
  charPickSys: { color: '#a78bfa', fontSize: 12, marginTop: 2 },

  // ── Roll list ────────────────────────────────────────────
  rollGroup: { color: '#a78bfa', fontWeight: '700', fontSize: 12, marginBottom: 6 },
  rollWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  rollChip: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.2)',
  },
  rollChipLabel: { color: '#e2e8f0', fontSize: 12, fontWeight: '600' },
  rollChipMod: { color: '#34d399', fontSize: 11, marginTop: 2 },

  // ── Drawer lateral ───────────────────────────────────────
  drawerContainer: { flex: 1, flexDirection: 'row', backgroundColor: 'transparent' },
  drawerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  drawerPanel: {
    width: 300,
    backgroundColor: '#13112e',
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(124,58,237,0.25)',
    paddingTop: 52,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(167,139,250,0.12)',
    marginBottom: 4,
  },
  drawerTitle: { color: '#e2e8f0', fontWeight: '800', fontSize: 15, flex: 1 },
  drawerClose: { width: 30, height: 30, justifyContent: 'center', alignItems: 'center' },
  drawerCloseText: { color: '#64748b', fontSize: 18 },
  drawerSection: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  drawerSectionTitle: {
    color: '#7c3aed',
    fontWeight: '800',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  drawerCharCard: {
    backgroundColor: 'rgba(124,58,237,0.1)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.25)',
  },
  drawerCharName: { color: '#e2e8f0', fontWeight: '700', fontSize: 14 },
  drawerCharSys: { color: '#a78bfa', fontSize: 12, marginTop: 3 },
  drawerBtn: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  drawerBtnPrimary: { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  drawerBtnText: { color: '#c4b5fd', fontWeight: '700', fontSize: 13 },
});
