/**
 * YOUR SCENE — Parts A, B and D live here (and in files you add next to it).
 *
 * main.js calls, every frame:
 *     scene.update(dt, time)          dt and time in seconds
 *     scene.draw(pass, viewProj)      inside the frame's render pass
 * and scene.reset() from the panel's "reset" button.
 *
 * Suggested steps
 *   Part A  Write a small mesh pipeline (copy the structure of
 *           render/painting.js: vertex buffer → uniform buffer → bind group
 *           → pipeline → draw). Use geometry.js for cube data. Place at least
 *           three objects in front of the painting (z > 0) with YOUR mat4.
 *   Part B  Build a SceneNode tree (scene/node.js), call root.updateWorld()
 *           in update(), and draw every node with  viewProj · node.world.
 *   Part D  Draw control points and the curve over the painting
 *           (topology 'line-strip' or 'point-list' works for a start).
 *
 * WebGPU gotcha: queue.writeBuffer() calls all run BEFORE the frame's
 * commands execute. If several objects share ONE uniform buffer, they all
 * see the last value written. Give each object its own uniform buffer (or
 * its own slice of a big one, with a dynamic offset).
 *
 * Call renderer.countDraw(vertexCount) after each draw so the vertex
 * counter in the panel is correct (Part E).
 */

import meshWGSL from "../render/shaders/mesh.wgsl?raw";
import { createShader, fragmentConstants } from "../render/shader.js";
import { DEPTH_FORMAT } from "../render/renderer.js";
import { cube, pyramid, axes, frustumLines } from "./geometry.js";
import * as mat4 from "../math/mat4.js";
import { SceneNode } from "./node.js";
import lineWGSL from "../render/shaders/line.wgsl?raw";
import * as curves from "../math/curves.js";

export function createScene({ gpu, renderer, painting, panel }) {
  const { device } = gpu;
  const state = {
    debugAxes: false,
    drawObjects: true,

    // part A: state for one of objects
    tx: 0.35,
    ty: -0.55,
    tz: 0.2,
    rotX: 0.1,
    rotY: 0.2,
    rotZ: 0.3,
    scaleX: 0.14,
    scaleY: 0.1,
    scaleZ: 0.12,
    useTRS: true,

    // part B
    animate: true,

    // part D
    curveKind: "bezier-c1",
    deCasteljauT: 0.5,
    showDeCasteljau: true,
  };

  function makeMesh(verts) {
    const buffer = device.createBuffer({
      size: verts.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(buffer, 0, verts);
    return { buffer, vertexCount: verts.length / 6 };
  }

  const cubeMesh = makeMesh(cube());
  const pyramidMesh = makeMesh(pyramid());

  const shaderModule = createShader(device, meshWGSL, "mesh");
  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: shaderModule,
      entryPoint: "vs",
      buffers: [
        {
          arrayStride: 6 * 4,
          attributes: [
            { shaderLocation: 0, offset: 0, format: "float32x3" },
            { shaderLocation: 1, offset: 3 * 4, format: "float32x3" },
          ],
        },
      ],
    },
    fragment: {
      module: shaderModule,
      entryPoint: "fs",
      targets: [{ format: gpu.viewFormat }],
      constants: fragmentConstants(gpu),
    },
    primitive: { topology: "triangle-list", cullMode: "none" },
    depthStencil: {
      format: DEPTH_FORMAT,
      depthWriteEnabled: true,
      depthCompare: "less",
    },
  });

  // axes stuff
  const axesVerts = axes(0.2);
  const axesBuffer = device.createBuffer({
    size: axesVerts.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(axesBuffer, 0, axesVerts);

  const lineShader = createShader(device, lineWGSL, "line");
  const linePipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: lineShader,
      entryPoint: "vs",
      buffers: [
        {
          arrayStride: 6 * 4,
          attributes: [
            { shaderLocation: 0, offset: 0, format: "float32x3" },
            { shaderLocation: 1, offset: 3 * 4, format: "float32x3" },
          ],
        },
      ],
    },
    fragment: {
      module: lineShader,
      entryPoint: "fs",
      targets: [{ format: gpu.viewFormat }],
      constants: fragmentConstants(gpu),
    },
    primitive: { topology: "line-list" },
    depthStencil: {
      format: DEPTH_FORMAT,
      depthWriteEnabled: true,
      depthCompare: "less",
    },
  });

  // frustum stuff
  const frustumBuffer = device.createBuffer({
    size: 24 * 6 * 4,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  const frustumUniform = device.createBuffer({
    size: 64,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const frustumBindGroup = device.createBindGroup({
    layout: linePipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: frustumUniform } }],
  });

  function makeObject(color, mesh = cubeMesh) {
    const uniformBuffer = device.createBuffer({
      size: 4 * 16 + 4 * 4, // mat4 + vec4
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
    });

    return {
      uniformBuffer,
      bindGroup,
      color: new Float32Array(color),
      model: mat4.identity(),
      mesh,
    };
  }

  const objects = [
    makeObject([0.55, 0.52, 0.48, 1.0]), // boulder
    makeObject([0.85, 0.78, 0.65, 1.0]), // mansion body
    makeObject([0.72, 0.32, 0.2, 1.0], pyramidMesh), // mansion roof
  ];

  // mansion body
  objects[1].model = mat4.multiply(
    mat4.translate(0.02, -0.22, 0.15),
    mat4.multiply(mat4.rotateY(-0.15), mat4.scale(0.22, 0.16, 0.16)),
  );

  // mansion roof
  // TODO: refactor so this 2 lines aren't needed
  objects[2].model = mat4.multiply(
    mat4.translate(0.02, -0.1, 0.15),
    mat4.multiply(mat4.rotateY(-0.15), mat4.scale(0.26, 0.09, 0.2)),
  );

  function makeNode(name, local, color, scaleVec) {
    const node = new SceneNode(name, local);
    node.data.obj = makeObject(color);
    node.data.scale = mat4.scale(scaleVec[0], scaleVec[1], scaleVec[2]);

    const axesUniform = device.createBuffer({
      size: 4 * 16 + 4 * 4, // mat4 + vec4
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const axesBindGroup = device.createBindGroup({
      layout: linePipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: axesUniform } }],
    });
    node.data.axesUniform = axesUniform;
    node.data.axesBindGroup = axesBindGroup;

    return node;
  }

  const root = makeNode(
    "trunk",
    mat4.translate(0.62, -0.38, 0.18),
    [0.38, 0.25, 0.14, 1],
    [0.06, 0.22, 0.06],
  );
  const mainBranch = makeNode(
    "mainBranch",
    mat4.translate(0, 0.16, 0),
    [0.42, 0.28, 0.15, 1],
    [0.05, 0.16, 0.05],
  );
  const crown = makeNode(
    "crown",
    mat4.translate(-0.02, 0.14, 0),
    [0.55, 0.43, 0.12, 1],
    [0.26, 0.2, 0.16],
  );
  const foliageL = makeNode(
    "foliageL",
    mat4.translate(-0.14, 0.04, 0.02),
    [0.48, 0.38, 0.1, 1],
    [0.16, 0.15, 0.14],
  );
  const foliageR = makeNode(
    "foliageR",
    mat4.translate(0.08, 0.1, -0.02),
    [0.6, 0.48, 0.14, 1],
    [0.18, 0.14, 0.14],
  );

  root.addChild(mainBranch);
  mainBranch.addChild(crown);
  crown.addChild(foliageL);
  crown.addChild(foliageR);
  root.updateWorld();

  // part D
  const defaultPts = [
    [-0.72, -0.18],
    [-0.5, -0.22],
    [-0.32, -0.25],
    [-0.12, -0.28],
    [0.08, -0.31],
    [0.15, -0.35],
    [0.25, -0.45],
    [0.35, -0.55],
    [0.48, -0.68],
    [0.65, -0.82],
  ];
  const controlPts = defaultPts.map((p) => [...p]);

  function enforceC1() {
    controlPts[4] = curves.c1NextControl(controlPts[2], controlPts[3]);
    controlPts[7] = curves.c1NextControl(controlPts[5], controlPts[6]);
  }
  enforceC1();

  function getSegments() {
    return [
      [controlPts[0], controlPts[1], controlPts[2], controlPts[3]],
      [controlPts[3], controlPts[4], controlPts[5], controlPts[6]],
      [controlPts[6], controlPts[7], controlPts[8], controlPts[9]],
    ];
  }

  const cpObjects = controlPts.map((_, i) =>
    makeObject(
      i === 4 || i === 7 ? [1.0, 0.5, 0.1, 1.0] : [1.0, 0.9, 0.2, 1.0],
    ),
  );

  const curveBuffer = device.createBuffer({
    size: 1000 * 6 * 4,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  const curveUniform = device.createBuffer({
    size: 64,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const curveBindGroup = device.createBindGroup({
    layout: linePipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: curveUniform } }],
  });

  // --------------- UI Stuff --------------------
  // Example of wiring a control. Add a folder per part as you go.
  const f = panel.folder("Scene");
  f.toggle("debug axes", state, "debugAxes");
  f.toggle("draw objects", state, "drawObjects");
  f.note("Add your objects in src/scene/scene.js.");

  const fa = panel.folder("Part A");
  const trsToggle = fa.toggle("use TRS (SRT if unchecked)", state, "useTRS");
  const sTx = fa.slider("translate X", state, "tx", -1.5, 1.5, 0.01);
  const sTy = fa.slider("translate Y", state, "ty", -1.0, 1.0, 0.01);
  const sTz = fa.slider("translate Z", state, "tz", 0.05, 1.0, 0.01);
  const sRx = fa.slider("rotate X", state, "rotX", -Math.PI, Math.PI, 0.01);
  const sRy = fa.slider("rotate Y", state, "rotY", -Math.PI, Math.PI, 0.01);
  const sRz = fa.slider("rotate Z", state, "rotZ", -Math.PI, Math.PI, 0.01);
  const sSx = fa.slider("scale X", state, "scaleX", 0.05, 0.8, 0.01);
  const sSy = fa.slider("scale Y", state, "scaleY", 0.05, 0.8, 0.01);
  const sSz = fa.slider("scale Z", state, "scaleZ", 0.05, 0.8, 0.01);
  const matReadout = fa.text("");

  const fb = panel.folder("Part B");
  const animateToggle = fb.toggle("animate", state, "animate");

  const fd = panel.folder("Part D");
  const curveKindSelect = fd.select(
    "curve family",
    ["bezier-c1", "catmull-rom"],
    state.curveKind,
    (v) => (state.curveKind = v),
  );
  const dcToggle = fd.toggle("show de Casteljau", state, "showDeCasteljau");
  const sDcT = fd.slider("de Casteljau t", state, "deCasteljauT", 0, 1, 0.01);

  // --------------- Helper Functions --------------------
  function drawObject(pass, viewProj, obj) {
    const mvp = mat4.multiply(viewProj, obj.model);
    device.queue.writeBuffer(obj.uniformBuffer, 0, mvp);
    device.queue.writeBuffer(obj.uniformBuffer, 64, obj.color);

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, obj.bindGroup);
    pass.setVertexBuffer(0, obj.mesh.buffer);
    pass.draw(obj.mesh.vertexCount);
    renderer.countDraw(obj.mesh.vertexCount);
  }

  function drawCurve(pass, viewProj) {
    enforceC1();
    const segs = getSegments();
    const z = 0.02;
    const verts = [];
    const addLine = (a, b, c) =>
      verts.push(a[0], a[1], z, ...c, b[0], b[1], z, ...c);

    for (let i = 0; i < controlPts.length - 1; i++) {
      addLine(controlPts[i], controlPts[i + 1], [0.5, 0.5, 0.5]);
    }

    const steps = 60;
    if (state.curveKind === "bezier-c1") {
      for (let i = 0; i < steps; i++) {
        const pA = curves.evalPiecewise(segs, i / steps);
        const pB = curves.evalPiecewise(segs, (i + 1) / steps);
        addLine(pA, pB, [1.0, 0.25, 0.2]);
      }
    } else {
      for (let s = 0; s < controlPts.length - 3; s++) {
        for (let i = 0; i < 20; i++) {
          const pA = curves.catmullRom(
            controlPts[s],
            controlPts[s + 1],
            controlPts[s + 2],
            controlPts[s + 3],
            i / 20,
          );
          const pB = curves.catmullRom(
            controlPts[s],
            controlPts[s + 1],
            controlPts[s + 2],
            controlPts[s + 3],
            (i + 1) / 20,
          );
          addLine(pA, pB, [0.2, 0.9, 0.4]);
        }
      }
    }

    if (state.showDeCasteljau && state.curveKind === "bezier-c1") {
      const levels = curves.deCasteljau(segs[0], state.deCasteljauT);
      const cols = [
        [0.3, 0.8, 1.0],
        [0.9, 0.3, 1.0],
      ];
      for (let l = 1; l < levels.length - 1; l++) {
        const pts = levels[l];
        for (let i = 0; i < pts.length - 1; i++) {
          addLine(pts[i], pts[i + 1], cols[l - 1]);
        }
      }
    }

    const data = new Float32Array(verts);
    device.queue.writeBuffer(curveBuffer, 0, data);
    device.queue.writeBuffer(curveUniform, 0, viewProj);

    pass.setPipeline(linePipeline);
    pass.setBindGroup(0, curveBindGroup);
    pass.setVertexBuffer(0, curveBuffer);
    pass.draw(data.length / 6);
    renderer.countDraw(data.length / 6);

    for (let i = 0; i < controlPts.length; i++) {
      const [x, y] = controlPts[i];
      cpObjects[i].model = mat4.multiply(
        mat4.translate(x, y, z),
        mat4.scale(0.03, 0.03, 0.03),
      );
      drawObject(pass, viewProj, cpObjects[i]);
    }
  }

  return {
    state,

    update(dt, time) {
      // part A
      const T = mat4.translate(state.tx, state.ty, state.tz);
      const R = mat4.multiply(
        mat4.rotateX(state.rotX),
        mat4.multiply(mat4.rotateY(state.rotY), mat4.rotateZ(state.rotZ)),
      );
      const S = mat4.scale(state.scaleX, state.scaleY, state.scaleZ);

      const mTRS = mat4.multiply(T, mat4.multiply(R, S));
      const mSRT = mat4.multiply(S, mat4.multiply(R, T));

      objects[0].model = state.useTRS ? mTRS : mSRT;

      matReadout.set(
        "M = TRS:\n" +
          mat4.format(mTRS) +
          "\n\n" +
          "M = SRT:\n" +
          mat4.format(mSRT),
      );

      // part B
      if (state.animate) {
        mainBranch.local = mat4.multiply(
          mat4.rotateZ(Math.sin(time * 1.8) * 0.12),
          mat4.translate(0, 0.16, 0),
        );
        crown.local = mat4.multiply(
          mat4.rotateZ(Math.sin(time * 1.8 - 0.5) * 0.15),
          mat4.translate(-0.02, 0.14, 0),
        );
        root.updateWorld();
      }
    },

    /** @param {GPURenderPassEncoder} pass  @param {Float32Array} viewProj  P · V */
    draw(pass, viewProj) {
      if (!state.drawObjects) return;
      for (const obj of objects) {
        drawObject(pass, viewProj, obj);
        drawCurve(pass, viewProj);
      }

      root.traverse((node) => {
        if (node.data.obj) {
          node.data.obj.model = mat4.multiply(node.world, node.data.scale);
          drawObject(pass, viewProj, node.data.obj);
        }
        if (state.debugAxes && node.data.axesBindGroup) {
          const mvp = mat4.multiply(viewProj, node.world);
          device.queue.writeBuffer(node.data.axesUniform, 0, mvp);
          pass.setPipeline(linePipeline);
          pass.setBindGroup(0, node.data.axesBindGroup);
          pass.setVertexBuffer(0, axesBuffer);
          pass.draw(6);
          renderer.countDraw(6);
        }
      });
    },

    drawFrustum(pass, viewProj, cam, aspect) {
      const verts = frustumLines(cam, aspect);
      device.queue.writeBuffer(frustumBuffer, 0, verts);

      const camView = mat4.lookAt(cam.eye, cam.target, cam.up);
      const camWorld = mat4.invertRigid(camView);
      const mvp = mat4.multiply(viewProj, camWorld);
      device.queue.writeBuffer(frustumUniform, 0, mvp);

      pass.setPipeline(linePipeline);
      pass.setBindGroup(0, frustumBindGroup);
      pass.setVertexBuffer(0, frustumBuffer);
      pass.draw(24);
      renderer.countDraw(24);
    },

    reset() {
      state.tx = 0.35;
      state.ty = -0.55;
      state.tz = 0.2;
      state.rotX = 0.1;
      state.rotY = 0.2;
      state.rotZ = 0.3;
      state.scaleX = 0.14;
      state.scaleY = 0.1;
      state.scaleZ = 0.12;
      state.useTRS = true;
      trsToggle.update();
      sTx.update();
      sTy.update();
      sTz.update();
      sRx.update();
      sRy.update();
      sRz.update();
      sSx.update();
      sSy.update();
      sSz.update();

      animateToggle.update();
    },
  };
}
