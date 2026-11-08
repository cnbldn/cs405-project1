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
import { cube } from "./geometry.js";
import * as mat4 from "../math/mat4.js";
import { SceneNode } from "./node.js";

export function createScene({ gpu, renderer, painting, panel }) {
  const { device } = gpu;
  const state = {
    debugAxes: false,

    // part A: state for one of objects
    tx: -0.6,
    ty: 0.2,
    tz: 0.3,
    rotX: 0.1,
    rotY: 0.2,
    rotZ: 0.5,
    scaleX: 0.35,
    scaleY: 0.2,
    scaleZ: 0.2,
    useTRS: true,

    // part B
    animate: true,
  };

  // cube stuff
  const cubeVerts = cube();
  const cubeBuffer = device.createBuffer({
    size: cubeVerts.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(cubeBuffer, 0, cubeVerts);

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

  function makeObject(color) {
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
      vertexBuffer: cubeBuffer,
      vertexCount: 36,
    };
  }

  const objects = [
    makeObject([0.612, 0.376, 0.722, 1.0]),
    makeObject([0.949, 0.922, 0.208, 1.0]),
    makeObject([0.09, 0.54, 0.06, 1.0]),
  ];

  objects[1].model = mat4.multiply(
    mat4.translate(0.6, -0.4, 0.25),
    mat4.multiply(mat4.rotateY(0.4), mat4.scale(0.25, 0.25, 0.25)),
  );
  objects[2].model = mat4.multiply(
    mat4.translate(0.0, -0.6, 0.3),
    mat4.multiply(mat4.rotateX(0.3), mat4.scale(0.4, 0.15, 0.2)),
  );

  function makeNode(name, local, color, scaleVec) {
    const node = new SceneNode(name, local);
    node.data.obj = makeObject(color);
    node.data.scale = mat4.scale(scaleVec[0], scaleVec[1], scaleVec[2]);
    return node;
  }

  const root = makeNode(
    "base",
    mat4.translate(0.55, 0.25, 0.25),
    [0.8, 0.3, 0.2, 1],
    [0.18, 0.18, 0.18],
  );
  const arm1 = makeNode(
    "arm1",
    mat4.translate(0, 0.22, 0),
    [0.9, 0.6, 0.2, 1],
    [0.08, 0.3, 0.08],
  );
  const wrist = makeNode(
    "wrist",
    mat4.translate(0, 0.22, 0),
    [0.2, 0.7, 0.8, 1],
    [0.24, 0.07, 0.07],
  );
  const fingerL = makeNode(
    "fingerL",
    mat4.translate(-0.1, 0.1, 0),
    [0.3, 0.85, 0.5, 1],
    [0.05, 0.14, 0.05],
  );
  const fingerR = makeNode(
    "fingerR",
    mat4.translate(0.1, 0.1, 0),
    [0.3, 0.85, 0.5, 1],
    [0.05, 0.14, 0.05],
  );

  root.addChild(arm1);
  arm1.addChild(wrist);
  wrist.addChild(fingerL);
  wrist.addChild(fingerR);

  // --------------- UI Stuff --------------------
  // Example of wiring a control. Add a folder per part as you go.
  const f = panel.folder("Scene");
  f.toggle("debug axes", state, "debugAxes");
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

  // --------------- Helper Functions --------------------
  function drawObject(pass, viewProj, obj) {
    const mvp = mat4.multiply(viewProj, obj.model);
    device.queue.writeBuffer(obj.uniformBuffer, 0, mvp);
    device.queue.writeBuffer(obj.uniformBuffer, 64, obj.color);

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, obj.bindGroup);
    pass.setVertexBuffer(0, obj.vertexBuffer);
    pass.draw(obj.vertexCount);
    renderer.countDraw(obj.vertexCount);
  }

  return {
    state,

    update(dt, time) {
      // TODO: animate nodes, then root.updateWorld()

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
      arm1.local = mat4.multiply(
        mat4.translate(0, 0.22, 0),
        mat4.rotateZ(Math.sin(time * 1.5) * 0.6),
      );
      wrist.local = mat4.multiply(
        mat4.translate(0, 0.22, 0),
        mat4.rotateY(time * 1.2),
      );
      root.updateWorld();
    },

    /** @param {GPURenderPassEncoder} pass  @param {Float32Array} viewProj  P · V */
    draw(pass, viewProj) {
      for (const obj of objects) {
        drawObject(pass, viewProj, obj);
      }

      root.traverse((node) => {
        if (node.data.obj) {
          node.data.obj.model = mat4.multiply(node.world, node.data.scale);
          drawObject(pass, viewProj, node.data.obj);
        }
      });
    },

    reset() {
      // TODO: put every object (and the camera, in main.js) back where it started
      state.tx = -0.6;
      state.ty = 0.2;
      state.tz = 0.3;
      state.rotX = 0.1;
      state.rotY = 0.2;
      state.rotZ = 0.5;
      state.scaleX = 0.35;
      state.scaleY = 0.2;
      state.scaleZ = 0.2;
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
