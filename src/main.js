/**
 * Entry point: wires GPU, painting, camera, scene and UI together and runs
 * the render loop. You will edit this file a little (camera controls, views);
 * most of your work goes into src/math/ and src/scene/.
 *
 *   p_clip = P · V · M · p_object
 */
import "./ui/style.css";
import { initWebGPU, showFatal } from "./render/gpu.js";
import { Renderer } from "./render/renderer.js";
import { Painting } from "./render/painting.js";
import {
  createCamera,
  viewProjection,
  updateCamera,
  ndcToPaintingPlane,
} from "./scene/camera.js";
import { createScene } from "./scene/scene.js";
import { createPanel } from "./ui/panel.js";
import { Stats } from "./ui/stats.js";
import { attachPointer } from "./ui/input.js";
import { PAINTINGS, DEFAULT_PAINTING, paintingURL } from "./config.js";
import * as mat4 from "./math/mat4.js";

async function main() {
  const canvas = document.getElementById("gfx");
  const gpu = await initWebGPU(canvas);
  const renderer = new Renderer(gpu);
  const painting = new Painting(gpu);

  const params = new URLSearchParams(location.search);
  let current =
    PAINTINGS.find((p) => p.id === params.get("painting")) ??
    PAINTINGS.find((p) => p.id === DEFAULT_PAINTING);
  await painting.load(paintingURL(current));

  /* ---------------- UI ---------------- */
  const panelRoot = document.getElementById("panel");
  const panel = createPanel(panelRoot);
  const title = document.createElement("h1");
  title.textContent = "CS405 · Project 1";
  panelRoot.appendChild(title);
  const stats = new Stats(panelRoot);

  const pf = panel.folder("Painting");
  pf.select(
    "painting",
    PAINTINGS.map((p) => ({ value: p.id, label: `${p.artist} — ${p.title}` })),
    current.id,
    async (id) => {
      current = PAINTINGS.find((p) => p.id === id);
      await painting.load(paintingURL(current));
      history.replaceState(null, "", `?painting=${id}`);
    },
  );

  const camera = createCamera();
  function createInspectCamera() {
    const ic = {
      ...createCamera(),
      target: [0, 0, 0.5],
      yaw: 0.68,
      pitch: 0.38,
      radius: 6.5,
      near: 0.1,
      far: 50,
    };
    updateCamera(ic);
    return ic;
  }
  const inspectCamera = createInspectCamera();
  const camState = { inspectMode: false };
  const cf = panel.folder("Camera");
  const inspectToggle = cf.toggle(
    "inspection camera (frustum)",
    camState,
    "inspectMode",
  );
  const camStatus = cf.text("");
  const proj = cf.select(
    "projection",
    ["perspective", "orthographic"],
    camera.projection,
    (v) => (camera.projection = v),
  );
  const sFov = cf.slider("fovY (rad)", camera, "fovY", 0.2, 2.0, 0.01);
  const sNear = cf.slider("near", camera, "near", 0.05, 2.0, 0.05);
  const sFar = cf.slider("far", camera, "far", 2.0, 100.0, 1.0);
  const camReadout = cf.text("");

  const scene = createScene({ gpu, renderer, painting, panel });

  const vf = panel.folder("View");
  vf.button("reset", () => {
    Object.assign(camera, createCamera());
    Object.assign(inspectCamera, createInspectCamera());
    proj.set(camera.projection);
    sFov.update();
    sNear.update();
    sFar.update();
    scene.reset();
    camState.inspectMode = false;
    inspectToggle.update();
  });
  vf.note(
    gpu.encodeSRGB
      ? "sRGB: encoded in shader (fallback)"
      : "sRGB: canvas -srgb view",
  );

  /* -------------- input --------------- */
  attachPointer(canvas, {
    down(e) {
      if (camState.inspectMode) return;
      const aspect = canvas.width / canvas.height;
      scene.pickPoint(ndcToPaintingPlane(camera, aspect, e.ndc));
    },
    drag(e) {
      const aspect = canvas.width / canvas.height;
      const activeCam = camState.inspectMode ? inspectCamera : camera;
      if (
        !camState.inspectMode &&
        scene.dragPoint(ndcToPaintingPlane(camera, aspect, e.ndc))
      ) {
        return;
      }
      activeCam.yaw -= e.dx * 0.007;
      activeCam.pitch = Math.max(
        -1.5,
        Math.min(1.5, activeCam.pitch + e.dy * 0.007),
      );
      updateCamera(activeCam);
    },
    up() {
      scene.releasePoint();
    },
    wheel(e) {
      const activeCam = camState.inspectMode ? inspectCamera : camera;
      activeCam.radius = Math.max(
        0.5,
        Math.min(20, activeCam.radius + e.delta * 0.002),
      );
      updateCamera(activeCam);
    },
  });

  /* ------------ render loop ----------- */
  let last = performance.now();
  function frame(now) {
    stats.begin(now);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;

    scene.update(dt, now / 1000);

    const aspect = canvas.width / canvas.height;
    const activeCam = camState.inspectMode ? inspectCamera : camera;
    const vp = viewProjection(activeCam, aspect, painting.aspect);
    camStatus.set(
      vp.fallback
        ? `PLACEHOLDER view (no camera yet)\n${vp.missing}`
        : `camera: P · V (${camera.projection})`,
    );
    camStatus.el.classList.toggle("warn", vp.fallback);
    camReadout.set(
      `eye    ${camera.eye.map((x) => x.toFixed(2)).join(", ")}\n` +
        `target ${camera.target.map((x) => x.toFixed(2)).join(", ")}\n` +
        `fovY ${((camera.fovY * 180) / Math.PI).toFixed(1)}°  near ${camera.near}  far ${camera.far}`,
    );

    const paintingMVP = vp.fallback
      ? vp.matrix
      : mat4.multiply(vp.matrix, painting.model);
    renderer.render((pass) => {
      painting.draw(pass, paintingMVP, renderer);
      scene.draw(pass, vp.matrix);
      if (camState.inspectMode) {
        scene.drawFrustum(pass, vp.matrix, camera, aspect);
      }
    });

    stats.end(renderer.stats);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch((e) => {
  console.error(e);
  showFatal(e.message ?? String(e));
});
