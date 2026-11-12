/**
 * Camera — Part C.
 *
 * The camera is plain data. viewProjection() turns it into P · V using YOUR
 * mat4.lookAt / mat4.perspective / mat4.orthographic / mat4.multiply.
 *
 * Until those exist it falls back to a fixed "fit the painting to the window"
 * matrix, so the starter shows your painting from the first `npm run dev`.
 * The panel tells you which of the two is active.
 */
import * as mat4 from "../math/mat4.js";
import * as vec3 from "../math/vec3.js";
import { NotImplemented } from "../math/todo.js";

export function createCamera() {
  return {
    eye: [0, 0, 2.8],
    target: [0, 0, 0],
    up: [0, 1, 0],
    yaw: 0,
    pitch: 0,
    radius: 2.8,
    fovY: Math.PI / 4, // radians
    near: 0.1,
    far: 100,
    projection: "perspective", // or 'orthographic'
    orthoHeight: 2.2, // world units visible vertically in orthographic mode
  };
}

export function updateCamera(cam) {
  const cospitch = Math.cos(cam.pitch);
  cam.eye[0] = cam.target[0] + cam.radius * cospitch * Math.sin(cam.yaw);
  cam.eye[1] = cam.target[1] + cam.radius * Math.sin(cam.pitch);
  cam.eye[2] = cam.target[2] + cam.radius * cospitch * Math.cos(cam.yaw);
}

/**
 * @param {object} cam     from createCamera()
 * @param {number} aspect  canvas width / height
 * @param {number} paintingAspect  image width / height (only used by the fallback)
 * @returns {{ matrix: Float32Array, fallback: boolean, missing?: string }}
 */
export function viewProjection(cam, aspect, paintingAspect = 1) {
  try {
    const view = mat4.lookAt(cam.eye, cam.target, cam.up);
    let proj;
    if (cam.projection === "orthographic") {
      const h = cam.orthoHeight / 2,
        w = h * aspect;
      proj = mat4.orthographic(-w, w, -h, h, cam.near, cam.far);
    } else {
      proj = mat4.perspective(cam.fovY, aspect, cam.near, cam.far);
    }
    return { matrix: mat4.multiply(proj, view), fallback: false };
  } catch (e) {
    if (!(e instanceof NotImplemented)) throw e;
    return {
      matrix: fitMatrix(aspect, paintingAspect),
      fallback: true,
      missing: e.message,
    };
  }
}

/**
 * Placeholder used until Part C works: scales the painting quad (height 2,
 * width 2·paintingAspect, centred at the origin in the z = 0 plane) to fit
 * the canvas, and maps world z to depth so that +z is in front.
 * There is no camera here — do not build on this.
 */
function fitMatrix(aspect, paintingAspect) {
  const s = 0.92 * Math.min(1, aspect / paintingAspect);
  return new Float32Array([
    s / aspect,
    0,
    0,
    0,
    0,
    s,
    0,
    0,
    0,
    0,
    -0.05,
    0,
    0,
    0,
    0.5,
    1,
  ]);
}

export function ndcToPaintingPlane(cam, aspect, ndc) {
  const [nx, ny] = ndc;
  const w = vec3.normalize(vec3.sub(cam.eye, cam.target));
  let uRaw = vec3.cross(cam.up, w);
  if (vec3.length(uRaw) < 1e-6) {
    const fakeUp = Math.abs(w[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    uRaw = vec3.cross(fakeUp, w);
  }
  const u = vec3.normalize(uRaw);
  const v = vec3.cross(w, u);
  const f = vec3.scale(w, -1);

  if (cam.projection === "orthographic") {
    const h = cam.orthoHeight / 2;
    const width = h * aspect;
    const ox = cam.eye[0] + nx * width * u[0] + ny * h * v[0];
    const oy = cam.eye[1] + nx * width * u[1] + ny * h * v[1];
    const oz = cam.eye[2] + nx * width * u[2] + ny * h * v[2];
    if (Math.abs(f[2]) < 1e-6) return null;
    const t = -oz / f[2];
    return [ox + t * f[0], oy + t * f[1]];
  } else {
    const h = Math.tan(cam.fovY / 2);
    const width = h * aspect;
    const dx = f[0] + nx * width * u[0] + ny * h * v[0];
    const dy = f[1] + nx * width * u[1] + ny * h * v[1];
    const dz = f[2] + nx * width * u[2] + ny * h * v[2];
    if (Math.abs(dz) < 1e-6) return null;
    const t = -cam.eye[2] / dz;
    return [cam.eye[0] + t * dx, cam.eye[1] + t * dy];
  }
}
