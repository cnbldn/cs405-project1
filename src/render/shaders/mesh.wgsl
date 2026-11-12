struct Uniforms {
    mvp: mat4x4f,
    model: mat4x4f,
    color: vec4f,
}

@group(0) @binding(0)
var<uniform> u: Uniforms;

struct VSOut {
    @builtin(position) position: vec4f,
    @location(0) normal: vec3f,
}

@vertex
fn vs(@location(0) pos: vec3f, @location(1) normal: vec3f) -> VSOut {
    var out: VSOut;
    out.position = u.mvp * vec4f(pos, 1.0);
    // approx world normal (ignoring non-uniform scale inverse-transpose for simplicity)
    out.normal = normalize((u.model * vec4f(normal, 0.0)).xyz);
    return out;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4f {
    let lightDir = normalize(vec3f(0.5, 0.8, 1.0));
    let n = normalize(in.normal);
    let diffuse = max(dot(n, lightDir), 0.0);
    let ambientLight = 0.25;
    let lit = u.color.rgb * (ambientLight + (1.0 - ambientLight) * diffuse);
    return toOutput(vec4f(lit, u.color.a));
}
