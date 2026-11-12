# CS405 Project 1

Built around *Manzara* by Gelibolulu Süleyman (`manzara.jpg`).

## Setup

```bash
npm install
npm run dev
npm test
```

## Scene & Controls

I placed a boulder, a small house (cube base + pyramid roof), and a 5-node tree (`trunk` -> `mainBranch` -> `crown` -> `foliageL`/`foliageR`) in front of the painting, plus a 3-segment C1 Bezier / Catmull-Rom curve following the path in the foreground.

- **Mouse:** Drag control points to move them on the painting plane (z = 0). Drag empty space to orbit the camera, scroll to zoom.
- **Painting / View:** Switch the background painting (`manzara` by default) or click reset to restore the initial scene and camera state.
- **Scene:** Toggle per-node local axes (`debug axes`) or hide the 3D meshes (`draw objects`) to see the painting clearly.
- **Camera (Part C):** Switch between perspective and orthographic projection, tweak fovY/near/far, or turn on the inspection camera to view the main camera's frustum from the outside (you can orbit and zoom the inspection camera too).
- **Part A / B:** Transform sliders and the TRS vs SRT toggle control the boulder (with both matrices printed live in the panel). The `animate` toggle pauses/resumes the tree wind sway and the cube moving along the curve.
- **Part D:** Switch between C1 Bezier and Catmull-Rom, toggle the control polygon and de Casteljau construction lines, scrub `t`, log the points to the console, or export the normalized UV coordinates as JSON.
