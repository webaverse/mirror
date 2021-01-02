import * as THREE from 'three';
import {Reflector} from './Reflector.js';
import {scene, renderer, camera, app, physics, ui, popovers} from 'app';
// console.log('loaded app', app);

const localVector = new THREE.Vector3();
const localMatrix = new THREE.Matrix4();

/* const scene = new THREE.Scene();
// scene.background = new THREE.Color(0xEEEEEE);
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 0.5, 2);
camera.rotation.order = 'YXZ'; */

/* const ambientLight = new THREE.AmbientLight(0xFFFFFF);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xFFFFFF, 3);
directionalLight.position.set(0.5, 1, 0.5).multiplyScalar(100);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 1024;
directionalLight.shadow.mapSize.height = 1024;
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far = 500;
scene.add(directionalLight);

const directionalLight2 = new THREE.DirectionalLight(0xFFFFFF, 3);
directionalLight2.position.set(-0.5, 0.1, 0.5).multiplyScalar(100);
scene.add(directionalLight2); */

const mirrorWidth = 3;
const mirrorHeight = 2;
const mirrorDepth = 0.1;
const mirrorMesh = (() => {
  const geometry = new THREE.PlaneBufferGeometry(mirrorWidth, mirrorHeight)
    .applyMatrix4(new THREE.Matrix4().makeTranslation(0, 1, 0));
  const mesh = new Reflector(geometry, {
    clipBias: 0.003,
    textureWidth: 2048 * window.devicePixelRatio,
    textureHeight: 2048 * window.devicePixelRatio,
    color: 0x889999,
    addColor: 0x300000,
    recursion: 1,
    transparent: true,
  });
  mesh.position.set(0, 0, 0);

  const borderMesh = new THREE.Mesh(
    new THREE.BoxBufferGeometry(mirrorWidth + mirrorDepth, mirrorHeight + mirrorDepth, mirrorDepth)
      .applyMatrix4(new THREE.Matrix4().makeTranslation(0, 1, -mirrorDepth/2 - 0.01)),
    new THREE.MeshPhongMaterial({
      color: 0x5c6bc0,
    })
  );
  mesh.add(borderMesh);

  mesh.onBeforeRender2 = () => {
    app.onBeforeRender();
  };
  mesh.onAfterRender2 = () => {
    app.onAfterRender();
  };

  return mesh;
})();
app.object.add(mirrorMesh);

const physicsId = physics.addBoxGeometry(mirrorMesh.position, mirrorMesh.quaternion, new THREE.Vector3(mirrorWidth, mirrorHeight, mirrorDepth).multiplyScalar(0.5), false);

const popoverWidth = 600;
const popoverHeight = 200;
const popoverTextMesh = (() => {
  const textMesh = ui.makeTextMesh('This is your mirror.\nTake a look at yourself!', undefined, 0.5, 'center', 'middle');
  textMesh.position.z = 0.1;
  textMesh.scale.x = popoverHeight / popoverWidth;
  textMesh.color = 0xFFFFFF;
  return textMesh;
})();
const popoverTarget = new THREE.Object3D();
popoverTarget.position.set(0, 2.5, -2);
const popoverMesh = popovers.addPopover(popoverTextMesh, {
  width: popoverWidth,
  height: popoverHeight,
  target: popoverTarget,
});

/* function animate() {
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);

navigator.xr.addEventListener('sessiongranted', e => {
  let currentSession = null;
  function onSessionStarted(session) {
    session.addEventListener('end', onSessionEnded);

    renderer.xr.setSession(session);

    currentSession = session;
  }
  function onSessionEnded() {
    currentSession.removeEventListener('end', onSessionEnded);

    currentSession = null;
  }
  navigator.xr && navigator.xr.requestSession('immersive-vr', {
    optionalFeatures: [
      'local-floor',
      'bounded-floor',
    ],
  }).then(onSessionStarted);
}); */