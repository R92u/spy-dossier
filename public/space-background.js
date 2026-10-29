/* A local, lightweight backdrop: no game state or external assets. */
const spaceBackground = (() => {
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let canvas;
  let context;
  let points = [];
  let width = 0;
  let height = 0;
  let pixelRatio = 1;
  let frame = 0;
  let lastFrame = 0;
  let active = false;

  function createCanvas() {
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.id = 'space-background';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.hidden = true;
    document.body.prepend(canvas);
    context = canvas.getContext('2d', { alpha: true });
  }

  function resize() {
    if (!canvas || !context) return;
    const nextWidth = document.documentElement.clientWidth;
    const nextHeight = window.innerHeight;
    const nextRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    if (width === nextWidth && height === nextHeight && pixelRatio === nextRatio) return;
    width = nextWidth;
    height = nextHeight;
    pixelRatio = nextRatio;
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    const mobile = width < 700;
    const count = Math.min(mobile ? 30 : 70, Math.max(mobile ? 20 : 36, Math.round(width * height / 17000)));
    points = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - .5) * 10,
      vy: (Math.random() - .5) * 10,
      radius: .65 + Math.random() * .9,
      alpha: .35 + Math.random() * .45,
      pink: Math.random() < .22
    }));
    draw(0);
  }

  function draw(seconds) {
    if (!context || !width || !height) return;
    context.clearRect(0, 0, width, height);
    const reach = width < 700 ? 95 : 125;
    const reachSquared = reach * reach;
    for (const point of points) {
      point.x += point.vx * seconds;
      point.y += point.vy * seconds;
      if (point.x < -12) point.x = width + 12;
      if (point.x > width + 12) point.x = -12;
      if (point.y < -12) point.y = height + 12;
      if (point.y > height + 12) point.y = -12;
    }
    context.lineWidth = .6;
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const from = points[i];
        const to = points[j];
        const dx = from.x - to.x;
        const dy = from.y - to.y;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared >= reachSquared) continue;
        const alpha = .14 * (1 - Math.sqrt(distanceSquared) / reach);
        context.strokeStyle = `rgba(240,240,255,${alpha})`;
        context.beginPath();
        context.moveTo(from.x, from.y);
        context.lineTo(to.x, to.y);
        context.stroke();
      }
    }
    for (const point of points) {
      context.fillStyle = point.pink ? `rgba(255,196,224,${point.alpha})` : `rgba(245,245,255,${point.alpha})`;
      context.beginPath();
      context.arc(point.x, point.y, point.radius, 0, Math.PI * 2);
      context.fill();
    }
  }

  function stop() {
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
    lastFrame = 0;
  }

  function tick(now) {
    if (!active || document.hidden || motionPreference.matches) {
      stop();
      return;
    }
    // Thirty frames per second is enough for the slow, few-pixel drift.
    if (!lastFrame || now - lastFrame >= 1000 / 30) {
      const seconds = lastFrame ? Math.min((now - lastFrame) / 1000, .1) : 0;
      lastFrame = now;
      draw(seconds);
    }
    frame = window.requestAnimationFrame(tick);
  }

  function update() {
    if (!document.body) return;
    active = document.body.dataset.theme === 'cosmos';
    if (!active) {
      stop();
      if (canvas) canvas.hidden = true;
      return;
    }
    createCanvas();
    canvas.hidden = false;
    if (!context) return;
    resize();
    if (document.hidden || motionPreference.matches) {
      stop();
      if (!document.hidden) draw(0);
      return;
    }
    if (!frame) frame = window.requestAnimationFrame(tick);
  }

  window.addEventListener('resize', () => {
    if (!active) return;
    resize();
  }, { passive: true });
  document.addEventListener('visibilitychange', update);
  window.addEventListener('pageshow', update);
  window.addEventListener('pagehide', stop);
  motionPreference.addEventListener('change', update);
  return { update };
})();

function updateSpaceBackground() {
  spaceBackground.update();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', updateSpaceBackground, { once: true });
} else {
  updateSpaceBackground();
}
