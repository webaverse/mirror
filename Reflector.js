/**
 * @author Slayvin / http://slayvin.net
 */

import * as THREE from "three";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass";
import { EffectComposer } from "three/examples/jsm/postprocessing/effectcomposer";

const localColor = new THREE.Color();
const whiteColor = new THREE.Color(0xffffff);

class Reflector extends THREE.Mesh {
  constructor(geometry, options) {
    super(geometry);

    this.type = "Reflector";

    options = options || {};

    var color =
      options.color !== undefined
        ? new THREE.Color(options.color)
        : new THREE.Color(0x7f7f7f);
    var textureWidth = options.textureWidth || 512;
    var textureHeight = options.textureHeight || 512;
    var clipBias = options.clipBias || 0;
    var shader = options.shader || Reflector.ReflectorShader;
    var recursion = options.recursion !== undefined ? options.recursion : 0;

    var reflectorPlane = new THREE.Plane();
    var normal = new THREE.Vector3();
    var reflectorWorldPosition = new THREE.Vector3();
    var cameraWorldPosition = new THREE.Vector3();
    var rotationMatrix = new THREE.Matrix4();
    var lookAtPosition = new THREE.Vector3(0, 0, -1);
    var clipPlane = new THREE.Vector4();

    var view = new THREE.Vector3();
    var target = new THREE.Vector3();
    var q = new THREE.Vector4();

    var textureMatrix = new THREE.Matrix4();
    var virtualCamera = new THREE.PerspectiveCamera();

    var parameters = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      stencilBuffer: true,
    };

    const createRenderTarget = ({ encoding, renderer, scene, camera }) => {
      parameters.encoding = encoding;
      var renderTarget = new THREE.WebGLRenderTarget(
        textureWidth,
        textureHeight,
        parameters
      );

      if (
        !THREE.MathUtils.isPowerOfTwo(textureWidth) ||
        !THREE.MathUtils.isPowerOfTwo(textureHeight)
      ) {
        renderTarget.texture.generateMipmaps = false;
      }

      // // renderer.localClippingEnabled = true;
      // // let planes = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)];
      // let shaderMat = new THREE.ShaderMaterial({
      //   uniforms: {
      //     tDiffuse: { value: renderTarget.texture },
      //     color: { value: color },
      //     textureMatrix: { value: textureMatrix },
      //   },
      //   vertexShader: shader.vertexShader,
      //   fragmentShader: shader.fragmentShader,
      //   transparent: options.transparent,
      //   // clipping: true,
      //   // clippingPlanes: planes,

      //   // side: THREE.DoubleSide,
      //   // blending: THREE.AdditiveBlending,
      //   // depthWrite: false,
      // });
      // this.material = shaderMat;

      this.composer = new EffectComposer(renderer);
      this.composer.addPass(new RenderPass(scene, camera));
      const shaderPass = new ShaderPass(shader);
      // shaderPass.renderToScreen = true;
      shaderPass.material.uniforms.color.value = color;
      shaderPass.material.uniforms.tDiffuse.value = renderTarget.texture;
      shaderPass.material.uniforms.textureMatrix.value = textureMatrix;
      this.composer.addPass(shaderPass);
      this.material = shaderPass.material;

      return renderTarget;
    };

    let renderTarget = null;

    this.onBeforeRender = function (renderer, scene, camera) {
      if (this.visible) {
        const gl = renderer.getContext();
        gl.enable(gl.STENCIL_TEST);
        gl.stencilFunc(gl.ALWAYS, 0, 0xff);
        gl.stencilOp(gl.REPLACE, gl.REPLACE, gl.REPLACE);
      }

      if ("recursion" in camera.userData) {
        if (camera.userData.recursion === recursion) return;
        camera.userData.recursion++;
      }

      this.onBeforeRender2 && this.onBeforeRender2(renderer, scene, camera);

      reflectorWorldPosition.setFromMatrixPosition(this.matrixWorld);
      cameraWorldPosition.setFromMatrixPosition(camera.matrixWorld);

      rotationMatrix.extractRotation(this.matrixWorld);

      normal.set(0, 0, 1);
      normal.applyMatrix4(rotationMatrix);

      view.subVectors(reflectorWorldPosition, cameraWorldPosition);

      const oldClearColor = renderer.getClearColor(localColor);
      const oldClearAlpha = renderer.getClearAlpha();

      // Avoid rendering when reflector is facing away
      const maxDistance = 20;
      // if (view.dot(normal) < 0 && view.length() < maxDistance) {
      view.reflect(normal).negate();
      view.add(reflectorWorldPosition);

      rotationMatrix.extractRotation(camera.matrixWorld);

      lookAtPosition.set(0, 0, -1);
      lookAtPosition.applyMatrix4(rotationMatrix);
      lookAtPosition.add(cameraWorldPosition);

      target.subVectors(reflectorWorldPosition, lookAtPosition);
      target.reflect(normal).negate();
      target.add(reflectorWorldPosition);

      virtualCamera.position.copy(view);
      virtualCamera.up.set(0, 1, 0);
      virtualCamera.up.applyMatrix4(rotationMatrix);
      virtualCamera.up.reflect(normal);
      virtualCamera.lookAt(target);

      virtualCamera.far = camera.far; // Used in WebGLBackground

      virtualCamera.updateMatrixWorld();
      virtualCamera.projectionMatrix.copy(camera.projectionMatrix);

      virtualCamera.userData.recursion = 0;

      // Update the texture matrix
      textureMatrix.set(
        0.5,
        0.0,
        0.0,
        0.5,
        0.0,
        0.5,
        0.0,
        0.5,
        0.0,
        0.0,
        0.5,
        0.5,
        0.0,
        0.0,
        0.0,
        1.0
      );
      textureMatrix.multiply(virtualCamera.projectionMatrix);
      textureMatrix.multiply(virtualCamera.matrixWorldInverse);
      textureMatrix.multiply(this.matrixWorld);

      // Now update projection matrix with new clip plane, implementing code from: http://www.terathon.com/code/oblique.html
      // Paper explaining this technique: http://www.terathon.com/lengyel/Lengyel-Oblique.pdf
      reflectorPlane.setFromNormalAndCoplanarPoint(
        normal,
        reflectorWorldPosition
      );
      reflectorPlane.applyMatrix4(virtualCamera.matrixWorldInverse);

      clipPlane.set(
        reflectorPlane.normal.x,
        reflectorPlane.normal.y,
        reflectorPlane.normal.z,
        reflectorPlane.constant
      );

      var projectionMatrix = virtualCamera.projectionMatrix;

      q.x =
        (Math.sign(clipPlane.x) + projectionMatrix.elements[8]) /
        projectionMatrix.elements[0];
      q.y =
        (Math.sign(clipPlane.y) + projectionMatrix.elements[9]) /
        projectionMatrix.elements[5];
      q.z = -1.0;
      q.w =
        (1.0 + projectionMatrix.elements[10]) / projectionMatrix.elements[14];

      // Calculate the scaled plane vector
      clipPlane.multiplyScalar(2.0 / clipPlane.dot(q));

      // Replacing the third row of the projection matrix
      projectionMatrix.elements[2] = clipPlane.x;
      projectionMatrix.elements[6] = clipPlane.y;
      projectionMatrix.elements[10] = clipPlane.z + 1.0 - clipBias;
      projectionMatrix.elements[14] = clipPlane.w;

      // Render
      var currentRenderTarget = renderer.getRenderTarget();

      if (renderTarget == null) {
        const outputEncoding =
          currentRenderTarget === null
            ? renderer.outputEncoding
            : currentRenderTarget.texture.encoding;
        renderTarget = createRenderTarget({
          encoding: outputEncoding,
          renderer,
          scene,
          camera: virtualCamera,
        });
      }

      this.visible = false;
      var currentXrEnabled = renderer.xr.enabled;
      var currentShadowAutoUpdate = renderer.shadowMap.autoUpdate;

      renderer.localClippingEnabled = true;
      renderer.xr.enabled = false; // Avoid camera modification and recursion
      renderer.shadowMap.autoUpdate = false; // Avoid re-computing shadows
      renderer.setRenderTarget(renderTarget);
      renderer.state.buffers.depth.setMask(true);
      renderer.setClearColor(whiteColor, 1);
      if (renderer.autoClear === false) renderer.clear();
      // // need to update frame to request skeleton update for the renderer skeleton update
      // // in case of first person view when head gets removed.
      // renderer.info.render.frame ++;
      // renderer.render(scene, virtualCamera);
      this.composer && this.composer.render();

      renderer.xr.enabled = currentXrEnabled;
      renderer.shadowMap.autoUpdate = currentShadowAutoUpdate;
      renderer.setRenderTarget(currentRenderTarget);

      // Restore viewport
      var viewport = camera.viewport;
      if (viewport !== undefined) {
        renderer.state.viewport(viewport);
      }

      this.visible = true;
      // }

      renderer.setClearColor(oldClearColor, oldClearAlpha);
    };

    this.onAfterRender = (renderer, scene, camera) => {
      this.onAfterRender2 && this.onAfterRender2(renderer, scene, camera);
      const gl = renderer.getContext();
      gl.disable(gl.STENCIL_TEST);
    };

    this.getRenderTarget = function () {
      return renderTarget;
    };
  }
}

Reflector.ReflectorShader = {
  uniforms: {
    color: {
      value: null,
    },

    tDiffuse: {
      value: null,
    },

    textureMatrix: {
      value: null,
    },
  },

  vertexShader: [
    THREE.ShaderChunk.common,
    THREE.ShaderChunk.logdepthbuf_pars_vertex,

    "uniform mat4 textureMatrix;",
    "varying vec4 vUv;",

    THREE.ShaderChunk.clipping_planes_pars_vertex,

    "void main() {",

    THREE.ShaderChunk.begin_vertex,

    "	vUv = textureMatrix * vec4( position, 1.0 );",

    "	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",

    THREE.ShaderChunk.logdepthbuf_vertex,
    THREE.ShaderChunk.project_vertex,
    THREE.ShaderChunk.clipping_planes_vertex,

    "}",
  ].join("\n"),

  fragmentShader: [
    "uniform vec3 color;",
    "uniform sampler2D tDiffuse;",
    "varying vec4 vUv;",

    THREE.ShaderChunk.logdepthbuf_pars_fragment,

    "float blendOverlay( float base, float blend ) {",

    "	return( base < 0.5 ? ( 2.0 * base * blend ) : ( 1.0 - 2.0 * ( 1.0 - base ) * ( 1.0 - blend ) ) );",

    "}",

    "vec3 blendOverlay( vec3 base, vec3 blend ) {",

    "	return vec3( blendOverlay( base.r, blend.r ), blendOverlay( base.g, blend.g ), blendOverlay( base.b, blend.b ) );",

    "}",

    THREE.ShaderChunk.clipping_planes_pars_fragment,

    "void main() {",

    THREE.ShaderChunk.clipping_planes_fragment,

    "	vec4 base = texture2DProj( tDiffuse, vUv );",
    "	gl_FragColor = vec4( blendOverlay( base.rgb, color ), 1.0 );",
    "   #include <encodings_fragment>",

    THREE.ShaderChunk.logdepthbuf_fragment,

    "}",
  ].join("\n"),
};

export { Reflector };
