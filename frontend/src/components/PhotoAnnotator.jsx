import { useCallback, useEffect, useRef, useState } from 'react';
import { Stage, Layer, Image as KonvaImage, Line, Arrow, Rect, Ellipse, Text } from 'react-konva';
import {
  MousePointer2, MoveUpRight, Square, Circle as CircleIcon, Pencil, Ruler,
  Undo2, Trash2, X, Save, Clock,
} from 'lucide-react';
import {
  MAX_ANNOTATION_SHAPES, MAX_ANNOTATION_POINTS, DEFAULT_ANNOTATION_COLOR, DEFAULT_STROKE_WIDTH,
  generateShapeId, formatMeasurementLabel, formatCapturedAt,
} from '../utils/photoAnnotations.js';

const TOOLS = [
  { id: 'select', label: 'Select / Move', icon: MousePointer2 },
  { id: 'arrow', label: 'Arrow', icon: MoveUpRight },
  { id: 'rect', label: 'Rectangle', icon: Square },
  { id: 'circle', label: 'Circle', icon: CircleIcon },
  { id: 'freehand', label: 'Highlight (freehand)', icon: Pencil },
  { id: 'measurement', label: 'Measurement', icon: Ruler },
];

const COLORS = ['#FD4403', '#EAB308', '#22C55E', '#3B82F6', '#FFFFFF'];

const pointDistancePx = (a, b, w, h) => Math.hypot((b.x - a.x) * w, (b.y - a.y) * h);

// Renders one saved (or in-progress) shape. Every shape's points are stored
// normalized (0..1 fractions of the photo's real pixel width/height) --
// never baked into the underlying image, purely a separate vector layer
// (see photoJobService.updatePhotoAnnotations) -- multiplied here by the
// current on-screen stage size only for display.
const ShapeNode = ({ shape, stageSize, selected, interactive, onSelect, onChange, imageWidth, imageHeight }) => {
  const pts = shape.points.flatMap((p) => [p.x * stageSize.width, p.y * stageSize.height]);
  const highlight = selected
    ? { shadowColor: '#3B82F6', shadowBlur: 12, shadowOpacity: 0.9, shadowEnabled: true }
    : {};

  const handleDragEnd = (e) => {
    const dx = e.target.x();
    const dy = e.target.y();
    e.target.position({ x: 0, y: 0 });
    onChange(
      shape.id,
      shape.points.map((p) => ({ x: p.x + dx / stageSize.width, y: p.y + dy / stageSize.height }))
    );
  };

  const common = {
    stroke: shape.color,
    strokeWidth: shape.strokeWidth,
    draggable: interactive,
    onClick: () => interactive && onSelect(shape.id),
    onTap: () => interactive && onSelect(shape.id),
    onDragEnd: handleDragEnd,
    ...highlight,
  };

  if (shape.type === 'arrow') {
    return <Arrow points={pts} fill={shape.color} pointerLength={10} pointerWidth={10} {...common} />;
  }
  if (shape.type === 'freehand') {
    return <Line points={pts} lineCap="round" lineJoin="round" tension={0} {...common} />;
  }
  if (shape.type === 'rect') {
    const [x1, y1, x2, y2] = pts;
    return (
      <Rect x={Math.min(x1, x2)} y={Math.min(y1, y2)} width={Math.abs(x2 - x1)} height={Math.abs(y2 - y1)} {...common} />
    );
  }
  if (shape.type === 'circle') {
    const [x1, y1, x2, y2] = pts;
    return (
      <Ellipse
        x={(x1 + x2) / 2}
        y={(y1 + y2) / 2}
        radiusX={Math.abs(x2 - x1) / 2}
        radiusY={Math.abs(y2 - y1) / 2}
        {...common}
      />
    );
  }
  if (shape.type === 'measurement') {
    const [x1, y1, x2, y2] = pts;
    const label = formatMeasurementLabel(shape.points[0], shape.points[1], imageWidth, imageHeight);
    return (
      <>
        <Line points={[x1, y1, x2, y2]} dash={[8, 4]} {...common} />
        <Text
          text={label}
          x={Math.min(x1, x2)}
          y={(y1 + y2) / 2 - 18}
          fill={shape.color}
          fontSize={12}
          fontStyle="bold"
          listening={false}
        />
      </>
    );
  }
  return null;
};

// Phase 24: a non-destructive canvas annotation editor (arrows, rectangles,
// circles, freehand highlight, and pixel-based measurement) over a photo's
// full-size preview. Shapes are a separate vector-JSON layer, saved via
// `onSave` -- never rasterized into the image, so the original/display/
// thumbnail Storage objects are byte-identical before and after annotating.
export default function PhotoAnnotator({
  imageUrl,
  imageWidth,
  imageHeight,
  initialShapes = [],
  capturedAt = null,
  readOnly = false,
  saving = false,
  saveError = null,
  onSave,
  onClose,
}) {
  const [imgEl, setImgEl] = useState(null);
  const [shapes, setShapes] = useState(initialShapes);
  const [history, setHistory] = useState([]);
  const [tool, setTool] = useState('select');
  const [color, setColor] = useState(DEFAULT_ANNOTATION_COLOR);
  const [selectedId, setSelectedId] = useState(null);
  const [drawing, setDrawing] = useState(null);
  const [limitNotice, setLimitNotice] = useState('');
  const containerRef = useRef(null);
  const [stageSize, setStageSize] = useState({ width: 320, height: 240 });

  useEffect(() => {
    setShapes(initialShapes);
    setHistory([]);
    setSelectedId(null);
  }, [initialShapes]);

  useEffect(() => {
    const img = new window.Image();
    img.onload = () => setImgEl(img);
    img.src = imageUrl;
    return () => { img.onload = null; };
  }, [imageUrl]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const aspect = imageWidth && imageHeight ? imageHeight / imageWidth : 0.75;
    const update = () => {
      const width = el.clientWidth || 320;
      setStageSize({ width, height: Math.round(width * aspect) });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [imageWidth, imageHeight]);

  const toNorm = useCallback(
    (x, y) => ({ x: x / stageSize.width, y: y / stageSize.height }),
    [stageSize.width, stageSize.height]
  );

  const pushHistory = useCallback(() => {
    setHistory((h) => [...h.slice(-19), shapes]); // bounded undo depth
  }, [shapes]);

  const handlePointerDown = (e) => {
    if (readOnly || tool === 'select') return;
    if (shapes.length >= MAX_ANNOTATION_SHAPES) {
      setLimitNotice(`A photo can have at most ${MAX_ANNOTATION_SHAPES} annotations. Delete one to add another.`);
      return;
    }
    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();
    if (!pos) return;
    const norm = toNorm(pos.x, pos.y);
    setDrawing({ id: generateShapeId(), type: tool, points: [norm, norm], color, strokeWidth: DEFAULT_STROKE_WIDTH, label: '' });
  };

  const handlePointerMove = (e) => {
    if (!drawing) return;
    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();
    if (!pos) return;
    const norm = toNorm(pos.x, pos.y);
    setDrawing((d) => {
      if (!d) return d;
      if (d.type === 'freehand') {
        const last = d.points[d.points.length - 1];
        if (pointDistancePx(last, norm, stageSize.width, stageSize.height) < 4) return d;
        if (d.points.length >= MAX_ANNOTATION_POINTS) return d;
        return { ...d, points: [...d.points, norm] };
      }
      return { ...d, points: [d.points[0], norm] };
    });
  };

  const handlePointerUp = () => {
    if (!drawing) return;
    const first = drawing.points[0];
    const last = drawing.points[drawing.points.length - 1];
    const isDegenerate = drawing.type !== 'freehand' && pointDistancePx(first, last, stageSize.width, stageSize.height) < 4;
    if (isDegenerate || drawing.points.length < 2) {
      setDrawing(null);
      return;
    }
    pushHistory();
    setShapes((prev) => [...prev, drawing]);
    setDrawing(null);
  };

  const handleShapeChange = (id, points) => {
    pushHistory();
    setShapes((prev) => prev.map((s) => (s.id === id ? { ...s, points } : s)));
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setShapes(prev);
    setSelectedId(null);
  };

  const handleDeleteSelected = () => {
    if (!selectedId) return;
    pushHistory();
    setShapes((prev) => prev.filter((s) => s.id !== selectedId));
    setSelectedId(null);
  };

  const handleClearAll = () => {
    if (shapes.length === 0) return;
    pushHistory();
    setShapes([]);
    setSelectedId(null);
  };

  const captured = capturedAt ? formatCapturedAt(capturedAt) : null;

  return (
    <div className="flex flex-col gap-3">
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              title={t.label}
              aria-label={t.label}
              aria-pressed={tool === t.id}
              onClick={() => { setTool(t.id); setSelectedId(null); }}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                tool === t.id ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
          <div className="flex items-center gap-1 ml-1">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                title={`Color ${c}`}
                onClick={() => setColor(c)}
                className={`w-5 h-5 rounded-full border-2 ${color === c ? 'border-gray-900' : 'border-gray-200'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button type="button" onClick={handleUndo} disabled={history.length === 0} title="Undo"
              className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed">
              <Undo2 className="w-4 h-4" />
            </button>
            <button type="button" onClick={handleDeleteSelected} disabled={!selectedId} title="Delete selected"
              className="p-2 rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed">
              <Trash2 className="w-4 h-4" />
            </button>
            <button type="button" onClick={handleClearAll} disabled={shapes.length === 0}
              className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed">
              Clear all
            </button>
          </div>
        </div>
      )}

      {limitNotice && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{limitNotice}</p>
      )}

      <div ref={containerRef} className="relative w-full rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
        <Stage
          width={stageSize.width}
          height={stageSize.height}
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onTouchStart={handlePointerDown}
          onTouchMove={handlePointerMove}
          onTouchEnd={handlePointerUp}
          style={{ touchAction: tool === 'select' ? 'auto' : 'none' }}
        >
          <Layer>
            {imgEl && <KonvaImage image={imgEl} width={stageSize.width} height={stageSize.height} />}
          </Layer>
          <Layer>
            {shapes.map((s) => (
              <ShapeNode
                key={s.id}
                shape={s}
                stageSize={stageSize}
                selected={s.id === selectedId}
                interactive={!readOnly && tool === 'select'}
                onSelect={setSelectedId}
                onChange={handleShapeChange}
                imageWidth={imageWidth}
                imageHeight={imageHeight}
              />
            ))}
            {drawing && (
              <ShapeNode
                shape={drawing}
                stageSize={stageSize}
                selected={false}
                interactive={false}
                onSelect={() => {}}
                onChange={() => {}}
                imageWidth={imageWidth}
                imageHeight={imageHeight}
              />
            )}
          </Layer>
        </Stage>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <Clock className="w-3.5 h-3.5" />
          {captured ? (
            <span>
              Captured: {captured.text} <span className="text-gray-400">({captured.caption})</span>
            </span>
          ) : (
            <span>No capture time available</span>
          )}
        </div>
        {!readOnly && (
          <div className="flex items-center gap-2">
            {saveError && <span className="text-xs text-red-600">{saveError}</span>}
            <button type="button" onClick={onClose} className="btn-secondary text-sm py-1.5 px-4 flex items-center gap-1.5">
              <X className="w-3.5 h-3.5" />
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onSave(shapes)}
              disabled={saving}
              className="btn-primary text-sm py-1.5 px-4 flex items-center gap-1.5 disabled:opacity-60"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving...' : 'Save Annotations'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
