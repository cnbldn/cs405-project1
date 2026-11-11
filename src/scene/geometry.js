/**
 * Ready-made vertex data, so you do not have to type it in. Provided.
 * Every array is interleaved as  [x, y, z,  nx, ny, nz]  per vertex
 * (stride 24 bytes), for topology 'triangle-list' unless stated.
 */

/** Unit cube centred at the origin (side 1), 36 vertices with face normals. */
export function cube() {
  // prettier-ignore
  const faces = [
    // normal      u axis      v axis
    [[ 1, 0, 0], [0, 0, -1], [0, 1, 0]],
    [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
    [[0, 1, 0], [1, 0, 0], [0, 0, -1]],
    [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
    [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
  ];
  const out = [];
  for (const [n, u, v] of faces) {
    const corner = (su, sv) =>
      [0, 1, 2].map((i) => 0.5 * n[i] + 0.5 * su * u[i] + 0.5 * sv * v[i]);
    const quad = [
      corner(-1, -1),
      corner(1, -1),
      corner(1, 1),
      corner(-1, -1),
      corner(1, 1),
      corner(-1, 1),
    ];
    for (const p of quad) out.push(...p, ...n);
  }
  return new Float32Array(out);
}

export function pyramid() {
  const top = [0, 0.5, 0];
  const fl = [-0.5, -0.5, 0.5];
  const fr = [0.5, -0.5, 0.5];
  const br = [0.5, -0.5, -0.5];
  const bl = [-0.5, -0.5, -0.5];

  const nFront = [0, 0.45, 0.89];
  const nRight = [0.89, 0.45, 0];
  const nBack = [0, 0.45, -0.89];
  const nLeft = [-0.89, 0.45, 0];
  const nDown = [0, -1, 0];

  // prettier-ignore
  return new Float32Array([
    // front
    ...fl, ...nFront, ...fr, ...nFront, ...top, ...nFront,
    // right
    ...fr, ...nRight, ...br, ...nRight, ...top, ...nRight,
    // back
    ...br, ...nBack,  ...bl, ...nBack,  ...top, ...nBack,
    // left
    ...bl, ...nLeft,  ...fl, ...nLeft,  ...top, ...nLeft,
    // bottom (quad so 2 triangles)
    ...fl, ...nDown,  ...bl, ...nDown,  ...br, ...nDown,
    ...fl, ...nDown,  ...br, ...nDown,  ...fr, ...nDown,
  ]);
}

/**
 * Coordinate axes for the debug view: three lines of length `len`
 * (topology 'line-list'), as [x, y, z, r, g, b] — x red, y green, z blue.
 */
export function axes(len = 1) {
  // prettier-ignore
  return new Float32Array([
    0, 0, 0, 1, 0, 0, len, 0, 0, 1, 0, 0,
    0, 0, 0, 0, 1, 0, 0, len, 0, 0, 1, 0,
    0, 0, 0, 0, 0, 1, 0, 0, len, 0, 0, 1,
  ]);
}

export function frustumLines(cam, aspect) {
  const tan = Math.tan(cam.fovY / 2);
  const nh =
    cam.projection === "orthographic" ? cam.orthoHeight / 2 : cam.near * tan;
  const nw = nh * aspect;
  const fh =
    cam.projection === "orthographic" ? cam.orthoHeight / 2 : cam.far * tan;
  const fw = fh * aspect;

  const n = [
    [-nw, -nh, -cam.near],
    [nw, -nh, -cam.near],
    [nw, nh, -cam.near],
    [-nw, nh, -cam.near],
  ];
  const f = [
    [-fw, -fh, -cam.far],
    [fw, -fh, -cam.far],
    [fw, fh, -cam.far],
    [-fw, fh, -cam.far],
  ];

  const out = [];
  const line = (a, b, c) => out.push(...a, ...c, ...b, ...c);
  const colNear = [1.0, 0.85, 0.2];
  const colFar = [0.3, 0.8, 1.0];

  for (let i = 0; i < 4; i++) {
    line(n[i], n[(i + 1) % 4], colNear);
    line(f[i], f[(i + 1) % 4], colFar);
    line([0, 0, 0], f[i], colFar);
  }
  return new Float32Array(out);
}
