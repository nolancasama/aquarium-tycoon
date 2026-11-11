import * as THREE from "three";
import { DOOR_OPENING } from "../../game/data/hub";

export interface HubPortalUniforms {
  active: { value: number };
  portal: { value: THREE.Vector3 };
}

/** Draw a corridor only through its own actual doorway. This prevents the
 * offstage L bends appearing around the rotunda silhouette or through a window.
 * Visitors use the identical fragment mask, including their moving limbs. */
export function clipToHubPortal(material: THREE.Material, uniforms?: HubPortalUniforms) {
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    const portalDeclaration = uniforms ? "uniform vec3 hubPortal;\nuniform float hubPortalActive;" : "attribute vec3 hubPortal;";
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>\n${portalDeclaration}\nvarying vec3 vHubPortal;\nvarying vec3 vHubPosition;`);
    shader.vertexShader = shader.vertexShader.replace("#include <project_vertex>", "#include <project_vertex>\nvHubPortal = hubPortal;\nvHubPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>\nvarying vec3 vHubPortal;\nvarying vec3 vHubPosition;\n${uniforms ? "uniform float hubPortalActive;" : ""}`);
    shader.fragmentShader = shader.fragmentShader.replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>
      vec2 hubOut = vec2(sin(vHubPortal.z), -cos(vHubPortal.z));
      vec2 hubSide = vec2(cos(vHubPortal.z), sin(vHubPortal.z));
      if (${uniforms ? "hubPortalActive > 0.5 && " : ""}dot(vHubPosition.xz - vHubPortal.xy, hubOut) > 0.005) {
        vec2 hubRay = vHubPosition.xz - cameraPosition.xz;
        float hubDenominator = dot(hubRay, hubOut);
        float hubT = -dot(cameraPosition.xz - vHubPortal.xy, hubOut) / hubDenominator;
        vec3 hubHit = mix(cameraPosition, vHubPosition, hubT);
        float hubX = dot(hubHit.xz - vHubPortal.xy, hubSide);
        if (hubT < 0.0 || hubT > 1.001 || abs(hubX) > ${(DOOR_OPENING.w / 2).toFixed(3)} || hubHit.y < 0.0 || hubHit.y > ${DOOR_OPENING.h.toFixed(3)}) discard;
      }`);
    if (uniforms) {
      shader.uniforms.hubPortal = uniforms.portal;
      shader.uniforms.hubPortalActive = uniforms.active;
    }
  };
  material.customProgramCacheKey = () => `hub-portal-${uniforms ? "person" : "geometry"}`;
  material.needsUpdate = true;
  return material;
}

export function markHubPortal(geometry: THREE.BufferGeometry, x: number, z: number, angle: number) {
  const values = new Float32Array(geometry.attributes.position.count * 3);
  for (let i = 0; i < values.length; i += 3) { values[i] = x; values[i + 1] = z; values[i + 2] = angle; }
  geometry.setAttribute("hubPortal", new THREE.BufferAttribute(values, 3));
  return geometry;
}
