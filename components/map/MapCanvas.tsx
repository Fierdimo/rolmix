import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  StyleSheet, View, Text, TouchableOpacity, ScrollView,
  Platform, Image as RNImage, ActivityIndicator, Alert,
} from 'react-native';
import {
  Canvas, Group, Line, Circle, RoundedRect, Path,
  vec, Image as SkImage, rect, Skia,
  Text as SkText, matchFont,
} from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue, useAnimatedStyle, runOnJS, withSpring, withTiming, withDelay,
} from 'react-native-reanimated';
import { MapData, MapToken, MapShape, Combatant, Message } from '../../lib/types';
import { MapSettings } from '../../hooks/useMap';

const GRID_COLOR_DARK  = 'rgba(0,0,0,0.22)';
const GRID_COLOR_LIGHT = 'rgba(255,255,255,0.22)';
const BG_COLOR       = '#1a1625';
const ACTIVE_RING    = '#FBBF24';
const SHADOW_BORDER  = 'rgba(251,191,36,0.6)';

// Paleta de colores para modo dibujo
const DRAW_COLORS = [
  'rgba(239,68,68,0.45)',
  'rgba(251,146,60,0.45)',
  'rgba(250,204,21,0.45)',
  'rgba(34,197,94,0.45)',
  'rgba(59,130,246,0.45)',
  'rgba(168,85,247,0.45)',
  'rgba(255,255,255,0.35)',
];

// Un cuadro pertenece al cono si su CENTRO cae dentro.
// Esto reproduce la plantilla D&D exacta (escalonada 1+2+3…) para conos diagonales.
function makeConeSquaresPath(
  ax: number, ay: number, len: number, angleRad: number,
  G: number, gridCols: number, gridRows: number,
) {
  const cA     = Math.cos(angleRad);
  const sA     = Math.sin(angleRad);
  const path   = Skia.Path.Make();
  const minCol = Math.max(0, Math.floor((ax - len) / G));
  const maxCol = Math.min(gridCols - 1, Math.ceil((ax + len) / G));
  const minRow = Math.max(0, Math.floor((ay - len) / G));
  const maxRow = Math.min(gridRows - 1, Math.ceil((ay + len) / G));

  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const cx = col * G + G / 2;
      const cy = row * G + G / 2;
      const dx = cx - ax;
      const dy = cy - ay;
      const forward = dx * cA + dy * sA;
      if (forward <= 0 || forward > len) continue;
      const perp = Math.abs(dx * (-sA) + dy * cA);
      if (perp <= forward / 2) {
        path.addRect({ x: col * G, y: row * G, width: G, height: G });
      }
    }
  }
  return path;
}

// ── Fuente de etiqueta de tokens ─────────────────────────────────────────────
const FONT_FAMILY = Platform.select({ ios: 'Helvetica Neue', default: 'sans-serif' }) ?? 'sans-serif';
const fontCache: Record<number, ReturnType<typeof matchFont>> = {};
function getLabelFont(size: number) {
  const s = Math.max(6, Math.round(size));
  if (!fontCache[s]) {
    fontCache[s] = matchFont({ fontFamily: FONT_FAMILY, fontStyle: 'normal', fontWeight: 'bold', fontSize: s });
  }
  return fontCache[s];
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return parts.slice(0, 2).map(p => p[0]).join('').toUpperCase();
}

function tokenLabel(token: MapToken, all: MapToken[]): string {
  const ini = getInitials(token.name);
  const siblings = all.filter(t => getInitials(t.name) === ini);
  if (siblings.length <= 1) return ini;
  const idx = siblings.findIndex(t => t.id === token.id);
  return ini[0] + (idx + 1);
}

// ── Retrato circular (Skia sub-componente con useImage) ───────────────────────
interface PortraitProps { uri: string; cx: number; cy: number; r: number; alpha: number }
function TokenPortrait({ uri, cx, cy, r, alpha }: PortraitProps) {
  const img  = (useImage as (u: string) => ReturnType<typeof useImage>)(uri);
  const clip = useMemo(() => {
    const p = Skia.Path.Make();
    p.addCircle(cx, cy, r);
    return p;
  }, [cx, cy, r]);
  if (!img) return null;
  return (
    <Group clip={clip} opacity={alpha}>
      <SkImage image={img} x={cx - r} y={cy - r} width={r * 2} height={r * 2} fit="cover" />
    </Group>
  );
}

// ── Mensaje flash del chat ────────────────────────────────────────────────────
const MSG_ICONS: Record<string, string> = { dice: '🎲 ', narration: '📜 ', action: '⚔️ ' };

function FlashMessage({ msg, onDone }: { msg: Message; onDone: () => void }) {
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 300 });
    const timer = setTimeout(() => {
      opacity.value = withTiming(0, { duration: 700 }, (done) => {
        if (done) runOnJS(onDone)();
      });
    }, 7000);
    return () => clearTimeout(timer);
  }, []);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const icon   = MSG_ICONS[msg.type] ?? '';
  const sender = msg.profiles?.username ?? '';
  const suffix = msg.type === 'dice' && msg.metadata?.total != null ? ` → ${msg.metadata.total}` : '';

  return (
    <Animated.View style={[flashStyles.msg, animStyle]} pointerEvents="none">
      <Text style={flashStyles.sender} numberOfLines={1}>{icon}{sender}</Text>
      <Text style={flashStyles.content} numberOfLines={2}>{msg.content}{suffix}</Text>
    </Animated.View>
  );
}

const TSHADOW = {
  textShadowColor: 'rgba(0,0,0,0.95)',
  textShadowOffset: { width: 0, height: 0 } as const,
  textShadowRadius: 6,
};

const flashStyles = StyleSheet.create({
  msg: {
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(167,139,250,0.75)',
    paddingLeft: 7,
    marginBottom: 6,
  },
  sender: {
    color: '#DDD6FE',
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 2,
    ...TSHADOW,
  },
  content: {
    color: '#FFFFFF',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    ...TSHADOW,
  },
});

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  map: MapData;
  tokens: MapToken[];
  isDm: boolean;
  combatants: Combatant[];
  myCombatantId?: string;
  onMoveToken: (combatantId: string, col: number, row: number) => void;
  onUpdateSettings?: (settings: MapSettings) => void;
  onUpdateBackground?: (url: string | null, offsetX: number, offsetY: number, scale: number) => void;
  onPickBackground?: () => Promise<string | null>;
  recentMessages?: Message[];
  // Marcas de área
  shapes: MapShape[];
  onAddShape: (shape: Omit<MapShape, 'id' | 'created_at'>) => void;
  onRemoveShape: (shapeId: string) => void;
  onClearMyShapes: () => void;
  currentUserId: string;
}

interface DragState {
  combatantId: string;
  sizeSquares: number;
}

function nextFreeCell(tokens: MapToken[], maxCol: number, maxRow: number) {
  const occ = new Set(tokens.map(t => `${t.col},${t.row}`));
  for (let r = 0; r < maxRow; r++)
    for (let c = 0; c < maxCol; c++)
      if (!occ.has(`${c},${r}`)) return { col: c, row: r };
  return { col: 0, row: 0 };
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function MapCanvas({
  map, tokens, isDm, combatants, myCombatantId,
  onMoveToken, onUpdateSettings, onUpdateBackground, onPickBackground,
  recentMessages,
  shapes, onAddShape, onRemoveShape, onClearMyShapes, currentUserId,
}: Props) {
  const { grid_cols, grid_rows, grid_size_px: G } = map;
  const canvasW = grid_cols * G;
  const canvasH = grid_rows * G;

  // ── Vista (local por dispositivo, nunca sincronizado) ──────────────────────
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale      = useSharedValue(1);
  const savedTX    = useSharedValue(0);
  const savedTY    = useSharedValue(0);
  const savedScale = useSharedValue(1);

  // ── Fondo (posición sincronizada con DB) ───────────────────────────────────
  const bgOffsetX = useSharedValue(map.bg_offset_x ?? 0);
  const bgOffsetY = useSharedValue(map.bg_offset_y ?? 0);
  const bgScale   = useSharedValue(map.bg_scale ?? 1);
  const savedBgX  = useSharedValue(0);
  const savedBgY  = useSharedValue(0);
  const savedBgS  = useSharedValue(1);
  const bgModeOn  = useSharedValue(false); // accesible en worklets

  const [bgMode, setBgMode]   = useState(false);
  const [bgUploading, setBgUploading] = useState(false);

  // Sync when map updates via realtime
  useEffect(() => {
    bgOffsetX.value = map.bg_offset_x ?? 0;
    bgOffsetY.value = map.bg_offset_y ?? 0;
    bgScale.value   = map.bg_scale ?? 1;
  }, [map.bg_offset_x, map.bg_offset_y, map.bg_scale]);

  // ── Arrastre de token ──────────────────────────────────────────────────────
  const [dragging, setDragging] = useState<DragState | null>(null);
  const [snapPos, setSnapPos]   = useState<{ col: number; row: number } | null>(null);
  const isDragging      = useSharedValue(false);
  const dragCombatantId = useSharedValue('');
  const dragCol = useSharedValue(0);
  const dragRow = useSharedValue(0);

  // ── UI state ───────────────────────────────────────────────────────────────
  const [showControls, setShowControls] = useState(false);
  const [containerW, setContainerW]     = useState(0);
  const [containerH, setContainerH]     = useState(0);
  const [trayH, setTrayH]               = useState(0);

  // ── Modo dibujo de marcas de área ──────────────────────────────────────────
  const [drawMode, setDrawMode]       = useState(false);
  const [drawShape, setDrawShape]     = useState<'rect' | 'circle'>('rect');
  const [drawColor, setDrawColor]     = useState(DRAW_COLORS[0]);
  const [drawPreview, setDrawPreview] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const drawModeOn     = useSharedValue(false);
  const drawShapeMode  = useSharedValue(0); // 0=rect  1=circle  2=cone
  const drawStartX     = useSharedValue(0);
  const drawStartY     = useSharedValue(0);

  // ── Chat flash overlay ─────────────────────────────────────────────────────
  const [flashMessages, setFlashMessages] = useState<Message[]>([]);
  const shownMsgIds = useRef(new Set(recentMessages?.map(m => m.id) ?? []));

  useEffect(() => {
    if (!recentMessages?.length) return;
    const fresh = recentMessages.filter(
      m => !shownMsgIds.current.has(m.id) && m.type !== 'whisper',
    );
    if (!fresh.length) return;
    for (const m of fresh) shownMsgIds.current.add(m.id);
    setFlashMessages(prev => [...prev, ...fresh].slice(-4));
  }, [recentMessages]);

  // Chips de tokens no colocados
  const placedIds  = new Set(tokens.map(t => t.combatant_id));
  const trayItems  = isDm
    ? combatants.filter(c => !placedIds.has(c.id) && !c.is_defeated)
    : myCombatantId && !placedIds.has(myCombatantId)
      ? combatants.filter(c => c.id === myCombatantId)
      : [];

  function handlePlaceToken(combatantId: string) {
    const { col, row } = nextFreeCell(tokens, grid_cols, grid_rows);
    onMoveToken(combatantId, col, row);
  }

  function fitToScreen() {
    const availH    = Math.max(100, containerH - trayH - (showControls ? 80 : 0));
    const s         = Math.max(0.15, Math.min(containerW / canvasW, availH / canvasH, 1));
    scale.value      = withSpring(s, { damping: 18 });
    translateX.value = withSpring((containerW - canvasW) / 2, { damping: 18 });
    translateY.value = withSpring((availH   - canvasH) / 2, { damping: 18 });
  }

  function toggleBgMode() {
    const next = !bgMode;
    setBgMode(next);
    bgModeOn.value = next;
    if (!next) {
      // Guardar alineación al salir del modo
      onUpdateBackground?.(
        map.background_url,
        bgOffsetX.value,
        bgOffsetY.value,
        bgScale.value,
      );
    }
  }

  async function handlePickBackground() {
    if (!onPickBackground) return;
    setBgUploading(true);
    try {
      const url = await onPickBackground();
      if (url) {
        bgOffsetX.value = 0;
        bgOffsetY.value = 0;
        bgScale.value   = 1;
        onUpdateBackground?.(url, 0, 0, 1);
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo subir la imagen');
    } finally {
      setBgUploading(false);
    }
  }

  function clearBg() {
    bgOffsetX.value = 0;
    bgOffsetY.value = 0;
    bgScale.value   = 1;
    onUpdateBackground?.(null, 0, 0, 1);
    if (bgMode) { setBgMode(false); bgModeOn.value = false; }
  }

  // ── Helpers de modo dibujo ──────────────────────────────────────────────────

  /**
   * Guarda una forma nueva en la BD.
   * No debe ser useCallback: necesita los valores frescos de drawShape y drawColor
   * en cada render para que la paleta se refleje inmediatamente.
   */
  function saveShape(x: number, y: number, w: number, h: number) {
    if (!map) return;
    onAddShape({ map_id: map.id, user_id: currentUserId, shape_type: drawShape, color: drawColor, x, y, w, h });
  }

  function toggleDrawMode() {
    const next = !drawMode;
    setDrawMode(next);
    drawModeOn.value = next;
    if (!next) setDrawPreview(null);
  }

  // ── Gestures ────────────────────────────────────────────────────────────────

  const isPanActive = useSharedValue(false);

  function screenToGrid(sx: number, sy: number) {
    'worklet';
    return {
      col: Math.max(0, Math.min(grid_cols - 1, Math.floor(sx / G))),
      row: Math.max(0, Math.min(grid_rows - 1, Math.floor(sy / G))),
    };
  }

  // Snaps to nearest grid intersection OR cell center, whichever is closer (circles).
  function snapToGridPoint(v: number): number {
    'worklet';
    const inter = Math.round(v / G) * G;
    const cellC = Math.round((v - G / 2) / G) * G + G / 2;
    return Math.abs(v - inter) <= Math.abs(v - cellC) ? inter : cellC;
  }

  // Cones: snaps apex to nearest corner OR edge midpoint (midpoint of any square side).
  // Three candidates: corner, vertical-edge midpoint, horizontal-edge midpoint.
  function snapToConeOrigin(vx: number, vy: number): { x: number; y: number } {
    'worklet';
    const cx1 = Math.round(vx / G) * G;
    const cy1 = Math.round(vy / G) * G;
    const d1  = (vx - cx1) * (vx - cx1) + (vy - cy1) * (vy - cy1);

    const cx2 = Math.round(vx / G) * G;
    const cy2 = Math.round((vy - G / 2) / G) * G + G / 2;
    const d2  = (vx - cx2) * (vx - cx2) + (vy - cy2) * (vy - cy2);

    const cx3 = Math.round((vx - G / 2) / G) * G + G / 2;
    const cy3 = Math.round(vy / G) * G;
    const d3  = (vx - cx3) * (vx - cx3) + (vy - cy3) * (vy - cy3);

    if (d1 <= d2 && d1 <= d3) return { x: cx1, y: cy1 };
    if (d2 <= d3)              return { x: cx2, y: cy2 };
    return { x: cx3, y: cy3 };
  }

  // Pan unificado: maneja tanto el pan del mapa como el arrastre de token y el dibujo de marcas
  const panGesture = Gesture.Pan()
    .minDistance(8)
    .onStart((e) => {
      'worklet';
      // Modo dibujo: capturar punto inicial y salir
      if (drawModeOn.value) {
        if (drawShapeMode.value === 1) {        // circle → intersection or cell center
          drawStartX.value = snapToGridPoint(e.x);
          drawStartY.value = snapToGridPoint(e.y);
        } else if (drawShapeMode.value === 2) { // cone → corner or edge midpoint
          const snapped    = snapToConeOrigin(e.x, e.y);
          drawStartX.value = snapped.x;
          drawStartY.value = snapped.y;
        } else {                                // rect → no snap
          drawStartX.value = e.x;
          drawStartY.value = e.y;
        }
        return;
      }
      // Marca pan activo solo si NO estamos en modo drag (longPress ya disparó)
      if (!isDragging.value) isPanActive.value = true;
      if (bgModeOn.value) {
        savedBgX.value = bgOffsetX.value;
        savedBgY.value = bgOffsetY.value;
      } else if (!isDragging.value) {
        savedTX.value = translateX.value;
        savedTY.value = translateY.value;
      }
    })
    .onUpdate((e) => {
      'worklet';
      // Modo dibujo: actualizar preview en tiempo real
      if (drawModeOn.value) {
        const dx = e.x - drawStartX.value;
        const dy = e.y - drawStartY.value;
        if (drawShapeMode.value === 1) { // circle
          const r = Math.sqrt(dx * dx + dy * dy);
          runOnJS(setDrawPreview)({ x: drawStartX.value - r, y: drawStartY.value - r, w: r * 2, h: r * 2 });
        } else if (drawShapeMode.value === 2) { // cone
          const len = Math.sqrt(dx * dx + dy * dy);
          runOnJS(setDrawPreview)({ x: drawStartX.value, y: drawStartY.value, w: len, h: Math.atan2(dy, dx) });
        } else { // rect
          runOnJS(setDrawPreview)({
            x: Math.min(drawStartX.value, e.x),
            y: Math.min(drawStartY.value, e.y),
            w: Math.abs(dx),
            h: Math.abs(dy),
          });
        }
        return;
      }
      if (isDragging.value) {
        const { col, row } = screenToGrid(e.x, e.y);
        dragCol.value = col;
        dragRow.value = row;
        runOnJS(setSnapPos)({ col, row });
      } else if (bgModeOn.value) {
        bgOffsetX.value = savedBgX.value + e.translationX / scale.value;
        bgOffsetY.value = savedBgY.value + e.translationY / scale.value;
      } else {
        translateX.value = savedTX.value + e.translationX;
        translateY.value = savedTY.value + e.translationY;
      }
    })
    .onFinalize((e) => {
      'worklet';
      // Modo dibujo: guardar forma si es suficientemente grande
      if (drawModeOn.value) {
        const dx = e.x - drawStartX.value;
        const dy = e.y - drawStartY.value;
        if (drawShapeMode.value === 1) { // circle
          const r = Math.sqrt(dx * dx + dy * dy);
          if (r > 8) runOnJS(saveShape)(drawStartX.value - r, drawStartY.value - r, r * 2, r * 2);
        } else if (drawShapeMode.value === 2) { // cone
          const len = Math.sqrt(dx * dx + dy * dy);
          if (len > 8) runOnJS(saveShape)(drawStartX.value, drawStartY.value, len, Math.atan2(dy, dx));
        } else { // rect
          const x = Math.min(drawStartX.value, e.x);
          const y = Math.min(drawStartY.value, e.y);
          const w = Math.abs(dx);
          const h = Math.abs(dy);
          if (w > 8 && h > 8) runOnJS(saveShape)(x, y, w, h);
        }
        runOnJS(setDrawPreview)(null);
        return;
      }
      isPanActive.value = false;
      if (isDragging.value) {
        const cId = dragCombatantId.value;
        const fc  = dragCol.value;
        const fr  = dragRow.value;
        isDragging.value = false;
        runOnJS(onMoveToken)(cId, fc, fr);
        runOnJS(setDragging)(null);
        runOnJS(setSnapPos)(null);
      }
    });

  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      'worklet';
      if (bgModeOn.value) {
        savedBgS.value = bgScale.value;
      } else {
        savedScale.value = scale.value;
        savedTX.value    = translateX.value;
        savedTY.value    = translateY.value;
      }
    })
    .onUpdate((e) => {
      'worklet';
      if (bgModeOn.value) {
        bgScale.value = Math.max(0.1, Math.min(5, savedBgS.value * e.scale));
      } else {
        const newScale = Math.max(0.15, Math.min(6, savedScale.value * e.scale));
        const ratio    = newScale / savedScale.value;
        translateX.value = e.focalX - (e.focalX - savedTX.value) * ratio;
        translateY.value = e.focalY - (e.focalY - savedTY.value) * ratio;
        scale.value      = newScale;
      }
    });

  const longPressGesture = Gesture.LongPress()
    .minDuration(400)
    .maxDistance(10)
    .onStart((e) => {
      'worklet';
      if (drawModeOn.value || bgModeOn.value || isPanActive.value) return;
      if (!isDm && !myCombatantId) return;
      const { col, row } = screenToGrid(e.x, e.y);
      const token = tokens.find(t => t.col === col && t.row === row && !t.is_defeated);
      if (!token) return;
      if (!isDm && token.combatant_id !== myCombatantId) return;
      isDragging.value      = true;
      dragCombatantId.value = token.combatant_id;
      dragCol.value = col;
      dragRow.value = row;
      runOnJS(setDragging)({ combatantId: token.combatant_id, sizeSquares: token.size_squares });
      runOnJS(setSnapPos)({ col, row });
    });

  // Simultaneous: todos corren juntos; isPanActive e isDragging controlan el comportamiento
  const tokenGesture = Gesture.Simultaneous(longPressGesture, panGesture, pinchGesture);

  // ── Estilos animados ─────────────────────────────────────────────────────────
  const viewStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { scale: scale.value }],
  }));

  const bgStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    left: 0, top: 0,
    width: canvasW,
    height: canvasH,
    transform: [
      { translateX: bgOffsetX.value },
      { translateY: bgOffsetY.value },
      { scale: bgScale.value },
    ],
  }));

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <View
      style={styles.container}
      onLayout={e => { setContainerW(e.nativeEvent.layout.width); setContainerH(e.nativeEvent.layout.height); }}
    >
      {/* Barra superior */}
      <View style={styles.topBar} onLayout={e => setTrayH(e.nativeEvent.layout.height)}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trayContent} style={styles.tray}>
          {trayItems.length === 0 ? (
            <Text style={styles.trayEmpty}>{combatants.length === 0 ? 'Sin combate activo' : 'Todos colocados'}</Text>
          ) : trayItems.map(c => (
            <TouchableOpacity key={c.id} style={styles.chip} onPress={() => handlePlaceToken(c.id)} activeOpacity={0.7}>
              <View style={[styles.chipDot, { backgroundColor: c.is_npc ? '#EF4444' : '#6D28D9' }]} />
              <Text style={styles.chipText} numberOfLines={1}>{c.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <View style={styles.toolButtons}>
          <TouchableOpacity style={styles.toolBtn} onPress={fitToScreen}>
            <Text style={styles.toolBtnText}>⊡</Text>
          </TouchableOpacity>
          {/* Botón de modo dibujo — disponible para todos los miembros */}
          <TouchableOpacity style={[styles.toolBtn, drawMode && styles.toolBtnActive]} onPress={toggleDrawMode}>
            <Text style={styles.toolBtnText}>✏</Text>
          </TouchableOpacity>
          {isDm && (onUpdateSettings || onUpdateBackground) && (
            <TouchableOpacity style={[styles.toolBtn, showControls && styles.toolBtnActive]} onPress={() => setShowControls(v => !v)}>
              <Text style={styles.toolBtnText}>⚙</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Panel de configuración (DM) */}
      {isDm && showControls && (
        <View style={styles.configPanel}>

          {/* Grid cols/rows */}
          {onUpdateSettings && (
            <View style={styles.configRow}>
              <View style={styles.gridControl}>
                <Text style={styles.gridLabel}>Cols</Text>
                <TouchableOpacity style={styles.gridBtn} onPress={() => onUpdateSettings({ grid_cols: Math.max(8, grid_cols - 2), grid_rows })}>
                  <Text style={styles.gridBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.gridValue}>{grid_cols}</Text>
                <TouchableOpacity style={styles.gridBtn} onPress={() => onUpdateSettings({ grid_cols: Math.min(80, grid_cols + 2), grid_rows })}>
                  <Text style={styles.gridBtnText}>+</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.gridDivider} />
              <View style={styles.gridControl}>
                <Text style={styles.gridLabel}>Filas</Text>
                <TouchableOpacity style={styles.gridBtn} onPress={() => onUpdateSettings({ grid_cols, grid_rows: Math.max(6, grid_rows - 2) })}>
                  <Text style={styles.gridBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.gridValue}>{grid_rows}</Text>
                <TouchableOpacity style={styles.gridBtn} onPress={() => onUpdateSettings({ grid_cols, grid_rows: Math.min(60, grid_rows + 2) })}>
                  <Text style={styles.gridBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Imagen de fondo */}
          {(onUpdateBackground || onPickBackground) && (
            <View style={styles.bgRow}>
              <TouchableOpacity
                style={[styles.bgPickBtn, bgUploading && styles.bgPickBtnDisabled]}
                onPress={handlePickBackground}
                disabled={bgUploading}
              >
                {bgUploading ? (
                  <ActivityIndicator size="small" color="#A78BFA" />
                ) : (
                  <Text style={styles.bgPickBtnText}>
                    {map.background_url ? '🖼  Cambiar imagen' : '🖼  Subir imagen de fondo'}
                  </Text>
                )}
              </TouchableOpacity>
              {map.background_url && (
                <>
                  <TouchableOpacity
                    style={[styles.alignBtn, bgMode && styles.alignBtnActive]}
                    onPress={toggleBgMode}
                  >
                    <Text style={[styles.alignBtnText, bgMode && styles.alignBtnTextActive]}>
                      {bgMode ? '✓ Guardar' : '⊹ Alinear'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.bgClearBtn} onPress={clearBg}>
                    <Text style={styles.bgClearBtnText}>✕</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}
        </View>
      )}

      {/* Modo alineación: aviso visual */}
      {bgMode && (
        <View style={styles.bgModeHint} pointerEvents="none">
          <Text style={styles.bgModeHintText}>Modo alineación — pellizca/arrastra la imagen</Text>
        </View>
      )}

      {/* Canvas */}
      <GestureDetector gesture={tokenGesture}>
        <Animated.View style={[{ width: canvasW, height: canvasH }, viewStyle]}>

          {/* Capa 1: imagen de fondo (React Native Animated.View para 60fps) */}
          {map.background_url ? (
            <Animated.View style={bgStyle}>
              <RNImage
                source={{ uri: map.background_url }}
                style={{ width: canvasW, height: canvasH }}
                resizeMode="contain"
              />
            </Animated.View>
          ) : null}

          {/* Capa 2: grid + tokens (Skia canvas transparente) */}
          <Canvas style={styles.canvas}>
            {/* Marcas de área — debajo del grid para que las líneas sean visibles sobre el relleno */}
            {shapes.map((s) =>
              s.shape_type === 'circle' ? (
                <Group key={s.id}>
                  <Circle cx={s.x + s.w / 2} cy={s.y + s.h / 2} r={Math.min(s.w, s.h) / 2} color={s.color} />
                  <Circle cx={s.x + s.w / 2} cy={s.y + s.h / 2} r={4} color="rgba(255,255,255,0.9)" />
                </Group>
              ) : s.shape_type === 'cone' ? (
                <Group key={s.id}>
                  <Path path={makeConeSquaresPath(s.x, s.y, s.w, s.h, G, grid_cols, grid_rows)} color={s.color} />
                  <Circle cx={s.x} cy={s.y} r={4} color="rgba(255,255,255,0.9)" />
                </Group>
              ) : (
                <RoundedRect key={s.id} x={s.x} y={s.y} width={s.w} height={s.h} r={4} color={s.color} />
              )
            )}

            {/* Preview de dibujo — también debajo del grid */}
            {drawPreview && (
              drawShape === 'circle' ? (
                <Group>
                  <Circle
                    cx={drawPreview.x + drawPreview.w / 2}
                    cy={drawPreview.y + drawPreview.h / 2}
                    r={Math.min(drawPreview.w, drawPreview.h) / 2}
                    color={drawColor}
                  />
                  <Circle
                    cx={drawPreview.x + drawPreview.w / 2}
                    cy={drawPreview.y + drawPreview.h / 2}
                    r={4}
                    color="rgba(255,255,255,0.9)"
                  />
                </Group>
              ) : drawShape === 'cone' ? (
                <Group>
                  <Path path={makeConeSquaresPath(drawPreview.x, drawPreview.y, drawPreview.w, drawPreview.h, G, grid_cols, grid_rows)} color={drawColor} />
                  <Circle cx={drawPreview.x} cy={drawPreview.y} r={4} color="rgba(255,255,255,0.9)" />
                </Group>
              ) : (
                <RoundedRect
                  x={drawPreview.x} y={drawPreview.y}
                  width={drawPreview.w} height={drawPreview.h}
                  r={4} color={drawColor}
                />
              )
            )}

            {/* Grid — doble trazo: oscuro visible en fondos claros, claro en fondos oscuros */}
            <Group>
              {Array.from({ length: grid_cols + 1 }, (_, i) => (
                <Line key={`vd${i}`} p1={vec(i * G, 0)} p2={vec(i * G, canvasH)} color={GRID_COLOR_DARK}  strokeWidth={1.5} />
              ))}
              {Array.from({ length: grid_rows + 1 }, (_, i) => (
                <Line key={`hd${i}`} p1={vec(0, i * G)} p2={vec(canvasW, i * G)} color={GRID_COLOR_DARK}  strokeWidth={1.5} />
              ))}
              {Array.from({ length: grid_cols + 1 }, (_, i) => (
                <Line key={`vl${i}`} p1={vec(i * G, 0)} p2={vec(i * G, canvasH)} color={GRID_COLOR_LIGHT} strokeWidth={1} />
              ))}
              {Array.from({ length: grid_rows + 1 }, (_, i) => (
                <Line key={`hl${i}`} p1={vec(0, i * G)} p2={vec(canvasW, i * G)} color={GRID_COLOR_LIGHT} strokeWidth={1} />
              ))}
            </Group>


            {/* Sombra de destino durante arrastre */}
            {dragging && snapPos && (
              <Group>
                <RoundedRect
                  x={snapPos.col * G + 1} y={snapPos.row * G + 1}
                  width={G * dragging.sizeSquares - 2} height={G * dragging.sizeSquares - 2}
                  r={5} color="rgba(251,191,36,0.12)"
                />
                <RoundedRect
                  x={snapPos.col * G + 1} y={snapPos.row * G + 1}
                  width={G * dragging.sizeSquares - 2} height={G * dragging.sizeSquares - 2}
                  r={5} color={SHADOW_BORDER} style="stroke" strokeWidth={2}
                />
              </Group>
            )}

            {/* Tokens */}
            {tokens.map((token) => {
              const isDragged  = dragging?.combatantId === token.combatant_id;
              const sz = token.size_squares;
              const cx = token.col * G + (G * sz) / 2;
              const cy = token.row * G + (G * sz) / 2;
              const r  = (G * sz) / 2 - 3;

              const baseAlpha  = token.is_defeated ? 0.35 : token.is_visible ? 1 : 0.4;
              const alpha      = isDragged ? 0.2 : baseAlpha;
              const fillColor  = token.color + Math.round(alpha * 255).toString(16).padStart(2, '0');

              const hpPct      = token.hp_max > 0 ? token.hp_current / token.hp_max : 0;
              const barW       = r * 2;
              const barH       = Math.max(3, G * 0.07);
              const barX       = cx - r;
              const barY       = cy + r + 3;
              const hpColor    = hpPct > 0.5 ? '#22C55E' : hpPct > 0.25 ? '#F97316' : '#EF4444';

              const label      = tokenLabel(token, tokens);
              const fontSize   = Math.max(7, Math.floor(r * 0.68));
              const font       = getLabelFont(fontSize);
              const tb         = font.measureText(label);
              const textX      = cx - (tb.width + tb.x) / 2;
              const textY      = cy - (tb.height + tb.y) / 2;

              return (
                <Group key={token.id}>
                  {token.is_active_turn && !isDragged && (
                    <Circle cx={cx} cy={cy} r={r + 4} color={ACTIVE_RING} style="stroke" strokeWidth={2.5} />
                  )}
                  <Circle cx={cx} cy={cy} r={r} color={fillColor} />
                  {token.portrait_url && !isDragged && (
                    <TokenPortrait uri={token.portrait_url} cx={cx} cy={cy} r={r} alpha={baseAlpha} />
                  )}
                  <Circle
                    cx={cx} cy={cy} r={r}
                    color={isDragged ? 'rgba(255,255,255,0.15)' : token.is_defeated ? '#374151' : '#ffffffbb'}
                    style="stroke" strokeWidth={1.5}
                  />
                  {(!token.portrait_url || isDragged || token.is_defeated) && (
                    <SkText
                      x={textX} y={textY} text={label} font={font}
                      color={isDragged || token.is_defeated ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.92)'}
                    />
                  )}
                  {!token.is_defeated && !isDragged && (
                    <>
                      <RoundedRect x={barX} y={barY} width={barW} height={barH} r={2} color="#1F2937" />
                      <RoundedRect x={barX} y={barY} width={barW * Math.max(0, hpPct)} height={barH} r={2} color={hpColor} />
                    </>
                  )}
                </Group>
              );
            })}

          </Canvas>
        </Animated.View>
      </GestureDetector>

      {/* Paleta de dibujo — sobre el canvas, fuera del GestureDetector para no perder los toques */}
      {drawMode && (
        <View style={[styles.drawPalette, { position: 'absolute', top: trayH, left: 0, right: 0, zIndex: 20, elevation: 20 }]}>
          <TouchableOpacity
            style={[styles.shapeBtn, drawShape === 'rect' && styles.shapeBtnActive]}
            onPress={() => { setDrawShape('rect'); drawShapeMode.value = 0; }}
          >
            <Text style={styles.shapeBtnText}>▭</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.shapeBtn, drawShape === 'circle' && styles.shapeBtnActive]}
            onPress={() => { setDrawShape('circle'); drawShapeMode.value = 1; }}
          >
            <Text style={styles.shapeBtnText}>○</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.shapeBtn, drawShape === 'cone' && styles.shapeBtnActive]}
            onPress={() => { setDrawShape('cone'); drawShapeMode.value = 2; }}
          >
            <Text style={styles.shapeBtnText}>△</Text>
          </TouchableOpacity>
          <View style={styles.paletteDivider} />
          {DRAW_COLORS.map((c) => (
            <TouchableOpacity
              key={c}
              style={[styles.colorSwatch, { backgroundColor: c }, drawColor === c && styles.colorSwatchActive]}
              onPress={() => setDrawColor(c)}
            />
          ))}
          <View style={styles.paletteDivider} />
          <TouchableOpacity style={styles.clearShapesBtn} onPress={onClearMyShapes}>
            <Text style={styles.clearShapesBtnText}>🗑</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Chat flash overlay */}
      {flashMessages.length > 0 && (
        <View style={styles.chatOverlay} pointerEvents="none">
          {flashMessages.map(msg => (
            <FlashMessage
              key={msg.id}
              msg={msg}
              onDone={() => setFlashMessages(prev => prev.filter(m => m.id !== msg.id))}
            />
          ))}
        </View>
      )}

      {dragging && (
        <View style={styles.dragHint} pointerEvents="none">
          <Text style={styles.dragHintText}>Suelta para mover</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG_COLOR, overflow: 'hidden' },
  canvas:    { width: '100%', height: '100%', backgroundColor: 'transparent' } as any,

  topBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)',
    paddingVertical: 5, paddingHorizontal: 8, gap: 6,
    zIndex: 10, elevation: 10,
  },
  tray:        { flex: 1 },
  trayContent: { gap: 5, alignItems: 'center' },
  trayEmpty:   { color: '#4B5563', fontSize: 11, paddingHorizontal: 4 },
  chip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4,
    gap: 5, maxWidth: 120,
  },
  chipDot:  { width: 8, height: 8, borderRadius: 4 },
  chipText: { color: '#E5E7EB', fontSize: 12, fontWeight: '500', flexShrink: 1 },

  toolButtons:   { flexDirection: 'row', gap: 4 },
  toolBtn:       { width: 30, height: 30, borderRadius: 7, backgroundColor: 'rgba(255,255,255,0.06)', justifyContent: 'center', alignItems: 'center' },
  toolBtnActive: { backgroundColor: 'rgba(124,58,237,0.25)', borderWidth: 1, borderColor: '#7C3AED' },
  toolBtnText:   { fontSize: 15, color: '#D1D5DB' },

  configPanel: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
    gap: 8,
    zIndex: 10, elevation: 10,
  },
  configRow:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  gridControl: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  gridLabel:   { color: '#9CA3AF', fontSize: 11, width: 28 },
  gridBtn:     { width: 26, height: 26, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.08)', justifyContent: 'center', alignItems: 'center' },
  gridBtnText: { color: '#E5E7EB', fontSize: 16, lineHeight: 20 },
  gridValue:   { color: '#F3F4F6', fontSize: 13, fontWeight: '600', width: 28, textAlign: 'center' },
  gridDivider: { width: 1, height: 20, backgroundColor: 'rgba(255,255,255,0.1)' },

  bgRow:        { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bgUrlInput: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8, color: '#F3F4F6', fontSize: 12,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  bgApplyBtn:     { backgroundColor: '#7C3AED', borderRadius: 7, paddingHorizontal: 10, paddingVertical: 6 },
  bgApplyBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  bgClearBtn:     { backgroundColor: 'rgba(239,68,68,0.2)', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 6 },
  bgClearBtnText: { color: '#EF4444', fontWeight: '700', fontSize: 13 },

  alignBtn: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6,
  },
  alignBtnActive:   { borderColor: '#FBBF24', backgroundColor: 'rgba(251,191,36,0.12)' },
  alignBtnText:     { color: '#9CA3AF', fontSize: 12 },
  alignBtnTextActive: { color: '#FBBF24', fontWeight: '600' },

  bgModeHint: {
    position: 'absolute', top: 0, left: 0, right: 0,
    backgroundColor: 'rgba(251,191,36,0.15)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(251,191,36,0.4)',
    paddingVertical: 5, alignItems: 'center',
    zIndex: 20, elevation: 20,
  },
  bgModeHintText: { color: '#FBBF24', fontSize: 12, fontWeight: '600' },

  chatOverlay: {
    position: 'absolute',
    bottom: 14,
    left: 10,
    maxWidth: '62%',
    zIndex: 5,
  },

  dragHint: {
    position: 'absolute', bottom: 20, alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10,
  },
  dragHintText: { color: '#FCD34D', fontSize: 13, fontWeight: '600' },

  // ── Modo dibujo ──────────────────────────────────────────────────────────
  drawPalette: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15,12,41,0.85)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    gap: 5,
    flexWrap: 'wrap',
  },
  shapeBtn: {
    width: 30, height: 30,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  shapeBtnActive:    { backgroundColor: 'rgba(109,40,217,0.6)' },
  shapeBtnText:      { color: '#fff', fontSize: 16 },
  paletteDivider:    { width: 1, height: 20, backgroundColor: 'rgba(255,255,255,0.2)', marginHorizontal: 2 },
  colorSwatch:       { width: 22, height: 22, borderRadius: 4 },
  colorSwatchActive: { borderWidth: 2, borderColor: '#fff' },
  clearShapesBtn:    { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  clearShapesBtnText: { fontSize: 16 },
});
