struct Uniforms {
    mvp: mat4x4f,
}

@group(0) @binding(0)
var<uniform> u: Uniforms;

struct VSOut {
    @builtin(position) position: vec4f,
    @location(0) color: vec3f,
}

@vertex
fn vs(@location(0) pos: vec3f, @location(1) color: vec3f) -> VSOut {
    var out: VSOut;
    out.position = u.mvp * vec4f(pos, 1.0);
    out.color = color;
    return out;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4f {
    return toOutput(vec4f(in.color, 1.0));
}
