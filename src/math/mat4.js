/**
 * mat4 — 4×4 matrices for Parts A and C.
 *
 * CONVENTIONS (the tests check exactly these):
 *   • A matrix is a Float32Array(16) in COLUMN-MAJOR order — the layout WebGPU
 *     expects for a mat4x4f in a uniform buffer. Element (row r, column c)
 *     lives at index  c * 4 + r.  The translation of an affine matrix is
 *     therefore at indices 12, 13, 14.
 *   • Column vectors: a point p is transformed as  M · p.
 *     multiply(A, B) returns A·B, so B is applied FIRST.
 *   • Right-handed world space. Angles in RADIANS. A positive angle rotates
 *     counter-clockwise when you look down the axis towards the origin
 *     (rotateZ(π/2) takes +x to +y).
 *   • View space: the camera sits at the origin and looks down −z, +y is up.
 *   • Clip space is WebGPU's: after the divide by w, x and y are in [−1, 1]
 *     and z is in [0, 1] (near → 0, far → 1). NOT OpenGL's [−1, 1].
 *
 * No maths libraries (no gl-matrix, no Three.js). Tests: tests/mat4.test.js
 */
import { todo } from "./todo.js";

/* ------------------------------------------------------------- Part A ---- */

/** The 4×4 identity. */
export function identity() {
  return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
}

/** A · B (apply B first, then A). Must not modify a or b. */
export function multiply(a, b) {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += a[4*k + row] * b[4*col + k];
      }
      out[4*col + row] = sum;
    }
  }
  return out;
}

/** Translation by (tx, ty, tz). */
export function translate(tx, ty, tz) {
  return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, tx,ty,tz,1]);
}

/** Rotation by `rad` about the x axis. */
export function rotateX(rad) {
  const c = Math.cos(rad);
  const s = Math.sin(rad);

  return new Float32Array([1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]);
}

/** Rotation by `rad` about the y axis. */
export function rotateY(rad) {
  const c = Math.cos(rad);
  const s = Math.sin(rad);

  return new Float32Array([c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]);
}

/** Rotation by `rad` about the z axis. */
export function rotateZ(rad) {
  const c = Math.cos(rad);
  const s = Math.sin(rad);

  return new Float32Array([c,s,0,0, -s,c,0,0, 0,0,1,0, 0,0,0,1]);
}

/** Non-uniform scale by (sx, sy, sz). */
export function scale(sx, sy, sz) {
  return new Float32Array([sx,0,0,0, 0,sy,0,0, 0,0,sz,0, 0,0,0,1]);
}

/** Mᵀ */
export function transpose(m) {
  const m11 = m[0];
  const m21 = m[1];
  const m31 = m[2];
  const m41 = m[3];

  const m12 = m[4];
  const m22 = m[5];
  const m32 = m[6];
  const m42 = m[7];

  const m13 = m[8];
  const m23 = m[9];
  const m33 = m[10];
  const m43 = m[11];

  const m14 = m[12];
  const m24 = m[13];
  const m34 = m[14];
  const m44 = m[15];

  return new Float32Array([m11,m12,m13,m14, m21,m22,m23,m24, m31,m32,m33,m34, m41,m42,m43,m44]);
}

/**
 * Inverse of a RIGID transform M = T·R (rotation + translation only, no scale).
 * Do not write a general 4×4 inverse: use the structure (Week 3).
 */
export function invertRigid(m) {
  // top left 3x3 part
  const m11 = m[0];
  const m21 = m[1];
  const m31 = m[2];

  const m12 = m[4];
  const m22 = m[5];
  const m32 = m[6];

  const m13 = m[8];
  const m23 = m[9];
  const m33 = m[10];

  // translation vector
  const tx = m[12];
  const ty = m[13];
  const tz = m[14];

  // -A^(-1)t
  const txNew = -(m11*tx + m21*ty + m31*tz);
  const tyNew = -(m12*tx + m22*ty + m32*tz);
  const tzNew = -(m13*tx + m23*ty + m33*tz);

  return new Float32Array([m11,m12,m13,0, m21,m22,m23,0, m31,m32,m33,0, txNew,tyNew,tzNew,1]);
}

/** M · v for a 4-component v = [x, y, z, w]; returns [x', y', z', w']. */
export function transformVec4(m, v) {
  const x = v[0];
  const y = v[1];
  const z = v[2];
  const w = v[3];

  const m11 = m[0];
  const m21 = m[1];
  const m31 = m[2];
  const m41 = m[3];

  const m12 = m[4];
  const m22 = m[5];
  const m32 = m[6];
  const m42 = m[7];

  const m13 = m[8];
  const m23 = m[9];
  const m33 = m[10];
  const m43 = m[11];

  const m14 = m[12];
  const m24 = m[13];
  const m34 = m[14];
  const m44 = m[15];

  return new Float32Array([m11*x + m12*y + m13*z + m14*w,
          m21*x + m22*y + m23*z + m24*w,
          m31*x + m32*y + m33*z + m34*w,
          m41*x + m42*y + m43*z + m44*w
          ]);
}

/* ------------------------------------------------------------- Part C ---- */

/**
 * View matrix for a camera at `eye` looking at `target`, with `up` as the
 * approximate up direction. Build the camera basis with two cross products.
 * Must stay finite when `up` is parallel to the view direction — handle it.
 * eye, target, up: [x, y, z]
 */
export function lookAt(eye, target, up) {
  return todo("mat4.lookAt");
}

/**
 * Perspective projection for WebGPU (depth z ∈ [0, 1]).
 * fovY: vertical field of view in radians; aspect = width / height;
 * near, far: positive distances along −z.
 */
export function perspective(fovY, aspect, near, far) {
  return todo("mat4.perspective");
}

/**
 * Orthographic projection for WebGPU (depth z ∈ [0, 1]) of the box
 * x ∈ [left, right], y ∈ [bottom, top], z ∈ [−near, −far] in view space.
 */
export function orthographic(left, right, bottom, top, near, far) {
  return todo("mat4.orthographic");
}

/* ------------------------------------------------- provided (not graded) - */

/**
 * Pretty-print a column-major matrix as four rows, for showing matrices on
 * screen (Part A asks you to display T·R·S and S·R·T).
 */
export function format(m, digits = 2) {
  if (!m) return "(none)";
  const w = digits + 4;
  let s = "";
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++)
      s += (+m[c * 4 + r]).toFixed(digits).padStart(w);
    if (r < 3) s += "\n";
  }
  return s;
}
