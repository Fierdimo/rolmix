import { StyleSheet } from 'react-native';

/** Estilos compartidos entre los componentes del chat de sesión. */
export const chatStyles = StyleSheet.create({
  // ── Estructura principal ─────────────────────────────────
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: '#f5f3ff' },

  // ── Header ───────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 48,
    paddingBottom: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(109,40,217,0.12)',
    backgroundColor: '#ffffff',
  },
  backBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  backText: { color: '#6d28d9', fontSize: 36, lineHeight: 38, fontWeight: '300', marginTop: -2 },
  headerCenter: { flex: 1, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  headerTitle: { color: '#1e1b3a', fontWeight: '700', fontSize: 16, maxWidth: '80%' },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10b981' },
  menuBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  menuBtnText: { color: '#6d28d9', fontSize: 22, letterSpacing: 1 },

  // ── Lista de mensajes ────────────────────────────────────
  messagesList: { paddingVertical: 12, paddingBottom: 4 },
  emptyChat: {
    textAlign: 'center',
    color: '#9ca3af',
    marginTop: 80,
    fontSize: 15,
    lineHeight: 26,
  },

  // ── Banner de aviso ──────────────────────────────────────
  notice: {
    color: '#92400e',
    fontSize: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    textAlign: 'center',
  },
  noticeWrap: {
    backgroundColor: '#fef9c3',
    borderTopWidth: 1,
    borderTopColor: 'rgba(217,119,6,0.25)',
  },
  noticeButton: {
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: '#d97706',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  noticeButtonText: { color: '#fff', fontWeight: '800' },

  // ── Elementos de miembro (drawer) ────────────────────────
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(109,40,217,0.08)',
  },
  memberName: { color: '#1e1b3a', fontWeight: '700' },
  memberMeta: { color: '#6b7280', fontSize: 12, marginTop: 2 },
  memberActions: { flexDirection: 'row', gap: 8 },
  acceptButton: {
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  acceptButtonText: { color: '#065f46', fontWeight: '700', fontSize: 12 },
  rejectButton: {
    backgroundColor: 'rgba(239,68,68,0.10)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  rejectButtonText: { color: '#b91c1c', fontWeight: '700', fontSize: 12 },
  emptyLabel: { color: '#9ca3af', fontSize: 12 },

  // ── Invite row (en drawer) ───────────────────────────────
  inviteRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  inviteInput: {
    flex: 1,
    backgroundColor: '#f5f3ff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#1e1b3a',
    borderWidth: 1,
    borderColor: 'rgba(109,40,217,0.20)',
  },
  inviteButton: {
    backgroundColor: '#6d28d9',
    borderRadius: 10,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  inviteButtonText: { color: '#fff', fontWeight: '700' },

  // ── Modal genérico (bottom sheet) ───────────────────────
  modalOverlay: { flex: 1, backgroundColor: '#f9f8ff', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 30,
    shadowColor: '#6d28d9',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 12,
  },
  modalTitle: { color: '#1e1b3a', fontSize: 16, fontWeight: '700', marginBottom: 12 },
  modalAction: {
    marginTop: 10,
    alignItems: 'center',
    paddingVertical: 12,
    backgroundColor: '#f5f3ff',
    borderRadius: 10,
  },

  // ── Character picker ─────────────────────────────────────
  charPickRow: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#f5f3ff',
    marginBottom: 6,
  },
  charPickName: { color: '#1e1b3a', fontWeight: '700' },
  charPickSys: { color: '#6d28d9', fontSize: 12, marginTop: 2 },

  // ── Roll list ────────────────────────────────────────────
  rollGroup: { color: '#6d28d9', fontWeight: '700', fontSize: 10, marginBottom: 6 },
  rollWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  rollChip: {
    backgroundColor: '#f5f3ff',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(109,40,217,0.18)',
  },
  rollChipLabel: { color: '#1e1b3a', fontSize: 12, fontWeight: '600' },
  rollChipMod: { color: '#059669', fontSize: 11, marginTop: 2 },

  // ── Drawer lateral ───────────────────────────────────────
  drawerContainer: { flex: 1, flexDirection: 'row', backgroundColor: 'transparent' },
  drawerBackdrop: { flex: 1, backgroundColor: 'rgba(15,12,41,0.40)' },
  drawerPanel: {
    width: 300,
    backgroundColor: '#ffffff',
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(109,40,217,0.14)',
    paddingTop: 52,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(109,40,217,0.10)',
    marginBottom: 4,
  },
  drawerTitle: { color: '#1e1b3a', fontWeight: '800', fontSize: 15, flex: 1 },
  drawerClose: { width: 30, height: 30, justifyContent: 'center', alignItems: 'center' },
  drawerCloseText: { color: '#9ca3af', fontSize: 18 },
  drawerSection: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(109,40,217,0.07)',
  },
  drawerSectionTitle: {
    color: '#6d28d9',
    fontWeight: '800',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  drawerCharCard: {
    backgroundColor: '#ede9fe',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(109,40,217,0.18)',
  },
  drawerCharName: { color: '#1e1b3a', fontWeight: '700', fontSize: 14 },
  drawerCharSys: { color: '#6d28d9', fontSize: 12, marginTop: 3 },
  drawerBtn: {
    backgroundColor: '#f5f3ff',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(109,40,217,0.14)',
  },
  drawerBtnPrimary: { backgroundColor: '#6d28d9', borderColor: '#6d28d9' },
  drawerBtnText: { color: '#5b21b6', fontWeight: '700', fontSize: 13 },
});
