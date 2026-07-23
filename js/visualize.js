/**
 * "See Your Home Glow" — upload a house photo, trace the roofline,
 * overlay Christmas lights on canvas. Optional AI roofline via /api/roofline.
 */
(function () {
  const canvas = document.getElementById('viz-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const fileInput = document.getElementById('viz-file');
  const uploadZone = document.getElementById('viz-upload-zone');
  const statusEl = document.getElementById('viz-status');
  const pointsEl = document.getElementById('viz-point-count');
  const styleSelect = document.getElementById('viz-light-style');
  const bulbSizeSelect = document.getElementById('viz-bulb-size');
  const btnClear = document.getElementById('viz-clear');
  const btnUndo = document.getElementById('viz-undo');
  const btnDetect = document.getElementById('viz-detect');
  const btnDownload = document.getElementById('viz-download');
  const btnShare = document.getElementById('viz-share');
  const previewWrap = document.getElementById('viz-preview-wrap');

  let photo = null;
  let points = [];
  let drawing = false;
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;

  const LIGHT_PALETTES = {
    warm: ['#fff8e7', '#ffe4a8', '#ffd56b', '#fff8e7', '#ffe4a8'],
    classic: ['#b91c3c', '#2d6a4f', '#fff8e7', '#b91c3c', '#2d6a4f', '#fff8e7'],
    gold: ['#e8c547', '#f5e6b8', '#ffd56b', '#e8c547', '#f5e6b8'],
    red: ['#b91c3c', '#e63950', '#991b1b', '#b91c3c', '#e63950'],
  };

  function setStatus(msg, type) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.className = 'status-msg' + (type ? ` ${type}` : '');
  }

  function updatePointCount() {
    if (pointsEl) pointsEl.textContent = String(points.length);
  }

  function fitCanvas() {
    if (!photo) return;
    const wrap = previewWrap || canvas.parentElement;
    const maxW = wrap.clientWidth;
    const maxH = Math.min(520, window.innerHeight * 0.55);
    scale = Math.min(maxW / photo.width, maxH / photo.height, 1);
    canvas.width = Math.round(photo.width * scale);
    canvas.height = Math.round(photo.height * scale);
    offsetX = 0;
    offsetY = 0;
    render();
  }

  function toCanvasCoords(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function loadPhoto(file) {
    if (!file || !file.type.startsWith('image/')) {
      setStatus('Please choose a JPG or PNG photo of your home.', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        photo = img;
        points = [];
        drawing = true;
        uploadZone?.classList.add('has-photo');
        previewWrap?.classList.remove('hidden');
        fitCanvas();
        setStatus('Tap or click along your roofline and eaves. We\'ll add lights along your path.', 'success');
        updatePointCount();
      };
      img.onerror = () => setStatus('Could not load that image. Try another file.', 'error');
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function drawPhoto() {
    ctx.drawImage(photo, 0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(10, 18, 32, 0.12)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function drawPath() {
    if (points.length < 2) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(40, 40, 40, 0.55)';
    ctx.lineWidth = Math.max(1.5, canvas.width * 0.002);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
    ctx.restore();
  }

  function interpolatePoints(pts, spacing) {
    if (pts.length < 2) return [];
    const bulbs = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      const steps = Math.max(1, Math.floor(dist / spacing));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        bulbs.push({ x: a.x + dx * t, y: a.y + dy * t });
      }
    }
    return bulbs;
  }

  function drawBulb(x, y, color, radius) {
    const glow = radius * 3.5;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, glow);
    grad.addColorStop(0, color);
    grad.addColorStop(0.35, color + 'cc');
    grad.addColorStop(0.6, color + '44');
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, glow, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.arc(x - radius * 0.25, y - radius * 0.25, radius * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawLights() {
    if (points.length < 2) return;
    const palette = LIGHT_PALETTES[styleSelect?.value || 'warm'] || LIGHT_PALETTES.warm;
    const sizeMap = { sm: 0.004, md: 0.006, lg: 0.009 };
    const ratio = sizeMap[bulbSizeSelect?.value || 'md'] || 0.006;
    const radius = Math.max(3, canvas.width * ratio);
    const spacing = radius * 2.8;
    const bulbs = interpolatePoints(points, spacing);

    bulbs.forEach((b, i) => {
      drawBulb(b.x, b.y, palette[i % palette.length], radius);
    });
  }

  function drawMarkers() {
    points.forEach((p, i) => {
      ctx.fillStyle = i === 0 ? '#e8c547' : '#fff8e7';
      ctx.strokeStyle = '#1b4332';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }

  function render() {
    if (!photo) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawPhoto();
    drawPath();
    drawLights();
    if (drawing) drawMarkers();
  }

  function addPoint(x, y) {
    points.push({ x, y });
    updatePointCount();
    render();
    setStatus(
      points.length < 2
        ? 'Add at least one more point along the roofline.'
        : `${points.length} points — keep tracing or download your preview.`,
      'success'
    );
  }

  function handlePointer(e) {
    if (!photo || !drawing) return;
    e.preventDefault();
    const { x, y } = toCanvasCoords(e.clientX, e.clientY);
    addPoint(x, y);
  }

  canvas.addEventListener('click', handlePointer);
  canvas.addEventListener(
    'touchstart',
    (e) => {
      if (!photo || !drawing) return;
      e.preventDefault();
      const t = e.changedTouches[0];
      const { x, y } = toCanvasCoords(t.clientX, t.clientY);
      addPoint(x, y);
    },
    { passive: false }
  );

  fileInput?.addEventListener('change', () => {
    if (fileInput.files?.[0]) loadPhoto(fileInput.files[0]);
  });

  uploadZone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('dragover');
  });
  uploadZone?.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
  uploadZone?.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    const file = e.dataTransfer?.files?.[0];
    if (file) loadPhoto(file);
  });
  uploadZone?.addEventListener('click', () => fileInput?.click());
  uploadZone?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput?.click();
    }
  });

  btnClear?.addEventListener('click', () => {
    points = [];
    updatePointCount();
    render();
    setStatus('Points cleared. Tap the roofline again.', '');
  });

  btnUndo?.addEventListener('click', () => {
    points.pop();
    updatePointCount();
    render();
    setStatus(points.length ? `${points.length} points on your path.` : 'Last point removed.', '');
  });

  styleSelect?.addEventListener('change', render);
  bulbSizeSelect?.addEventListener('change', render);

  btnDownload?.addEventListener('click', () => {
    if (!photo || points.length < 2) {
      setStatus('Upload a photo and trace at least two roofline points first.', 'error');
      return;
    }
    drawing = false;
    render();
    const link = document.createElement('a');
    link.download = 'thin-red-line-holiday-preview.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
    drawing = true;
    render();
    setStatus('Preview downloaded! Use Get Your Free Quote below to send us this image.', 'success');
  });

  btnShare?.addEventListener('click', async () => {
    if (!photo || points.length < 2) {
      setStatus('Upload a photo and trace your roofline first.', 'error');
      return;
    }
    drawing = false;
    render();
    try {
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
      if (navigator.share && blob) {
        const file = new File([blob], 'holiday-lights-preview.png', { type: 'image/png' });
        await navigator.share({
          title: 'My Home with Christmas Lights',
          text: 'Preview from Thin Red Line Holiday Lighting — get a free quote!',
          files: [file],
        });
        setStatus('Shared! We\'d love to turn this into reality.', 'success');
      } else {
        btnDownload?.click();
      }
    } catch {
      btnDownload?.click();
    } finally {
      drawing = true;
      render();
    }
  });

  btnDetect?.addEventListener('click', async () => {
    if (!photo) {
      setStatus('Upload a photo first, then try auto-detect.', 'error');
      return;
    }
    setStatus('Analyzing roofline…', 'loading');
    btnDetect.disabled = true;
    try {
      const tmp = document.createElement('canvas');
      const maxSide = 1024;
      const s = Math.min(1, maxSide / Math.max(photo.width, photo.height));
      tmp.width = Math.round(photo.width * s);
      tmp.height = Math.round(photo.height * s);
      tmp.getContext('2d').drawImage(photo, 0, 0, tmp.width, tmp.height);
      const dataUrl = tmp.toDataURL('image/jpeg', 0.85);

      const res = await fetch('/api/roofline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || data.hint || 'Auto-detect unavailable');
      }
      if (!Array.isArray(data.points) || data.points.length < 2) {
        throw new Error('Could not detect a roofline. Trace it manually instead.');
      }

      points = data.points.map((p) => ({
        x: p.x * canvas.width,
        y: p.y * canvas.height,
      }));
      updatePointCount();
      render();
      setStatus(`Auto-detected ${points.length} roofline points. Adjust with undo or add more.`, 'success');
    } catch (err) {
      setStatus(
        err.message.includes('not configured')
          ? 'Auto-detect needs GEMINI_API_KEY — trace your roofline manually (works great!).'
          : `${err.message} Trace your roofline by tapping the photo.`,
        'error'
      );
    } finally {
      btnDetect.disabled = false;
    }
  });

  window.addEventListener('resize', () => {
    if (photo) fitCanvas();
  });
})();
