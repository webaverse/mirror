/**
 * @author Slayvin / http://slayvin.net
 */

import * as THREE from 'three';

const localColor = new THREE.Color();
const blackColor = new THREE.Color(0x000000);
const whiteColor = new THREE.Color(0xFFFFFF);

class Reflector extends THREE.Mesh {
constructor( geometry, options ) {

  super(geometry);

    this.type = 'Reflector';

    var scope = this;

    options = options || {};

    var color = ( options.color !== undefined ) ? new THREE.Color( options.color ) : new THREE.Color( 0x7F7F7F );
    var textureWidth = options.textureWidth || 512;
    var textureHeight = options.textureHeight || 512;
    var clipBias = options.clipBias || 0;
    var shader = options.shader || Reflector.ReflectorShader;
    var recursion = options.recursion !== undefined ? options.recursion : 0;

    //

    var reflectorPlane = new THREE.Plane();
    var normal = new THREE.Vector3();
    var reflectorWorldPosition = new THREE.Vector3();
    var cameraWorldPosition = new THREE.Vector3();
    var rotationMatrix = new THREE.Matrix4();
    var lookAtPosition = new THREE.Vector3( 0, 0, - 1 );
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
        stencilBuffer: false,
    };

    const createRenderTarget = (encoding) => {

        parameters[encoding] = encoding;
        var renderTarget = new THREE.WebGLRenderTarget( textureWidth, textureHeight, parameters );

        if ( ! THREE.MathUtils.isPowerOfTwo( textureWidth ) || ! THREE.MathUtils.isPowerOfTwo( textureHeight ) ) {

            renderTarget.texture.generateMipmaps = false;

        }

        var material = new THREE.ShaderMaterial( {
            uniforms: THREE.UniformsUtils.clone( shader.uniforms ),
            fragmentShader: shader.fragmentShader,
            vertexShader: shader.vertexShader,
            transparent: options.transparent,
        } );

        material.uniforms[ "tDiffuse" ].value = renderTarget.texture;
        material.uniforms[ "color" ].value = color;
        material.uniforms[ "textureMatrix" ].value = textureMatrix;

        this.material = material;

        return renderTarget;
    };

    let lastRendered = false;
    let renderTarget = null;
    
    this.onBeforeRender = function ( renderer, scene, camera ) {
        if ( 'recursion' in camera.userData ) {

            if ( camera.userData.recursion === recursion ) return;

            camera.userData.recursion ++;

        }
    
        this.onBeforeRender2 && this.onBeforeRender2(renderer, scene, camera);

        reflectorWorldPosition.setFromMatrixPosition( scope.matrixWorld );
        cameraWorldPosition.setFromMatrixPosition( camera.matrixWorld );

        rotationMatrix.extractRotation( scope.matrixWorld );

        normal.set( 0, 0, 1 );
        normal.applyMatrix4( rotationMatrix );

        view.subVectors( reflectorWorldPosition, cameraWorldPosition );

    const oldClearColor = renderer.getClearColor(localColor);
    const oldClearAlpha = renderer.getClearAlpha();

        // Avoid rendering when reflector is facing away
    const maxDistance = 5;
        if ( view.dot( normal ) < 0 && view.length() < maxDistance) {
            view.reflect( normal ).negate();
            view.add( reflectorWorldPosition );

            rotationMatrix.extractRotation( camera.matrixWorld );

            lookAtPosition.set( 0, 0, - 1 );
            lookAtPosition.applyMatrix4( rotationMatrix );
            lookAtPosition.add( cameraWorldPosition );

            target.subVectors( reflectorWorldPosition, lookAtPosition );
            target.reflect( normal ).negate();
            target.add( reflectorWorldPosition );

            virtualCamera.position.copy( view );
            virtualCamera.up.set( 0, 1, 0 );
            virtualCamera.up.applyMatrix4( rotationMatrix );
            virtualCamera.up.reflect( normal );
            virtualCamera.lookAt( target );

            virtualCamera.far = camera.far; // Used in WebGLBackground

            virtualCamera.updateMatrixWorld();
            virtualCamera.projectionMatrix.copy( camera.projectionMatrix );

            virtualCamera.userData.recursion = 0;

            // Update the texture matrix
            textureMatrix.set(
                0.5, 0.0, 0.0, 0.5,
                0.0, 0.5, 0.0, 0.5,
                0.0, 0.0, 0.5, 0.5,
                0.0, 0.0, 0.0, 1.0
            );
            textureMatrix.multiply( virtualCamera.projectionMatrix );
            textureMatrix.multiply( virtualCamera.matrixWorldInverse );
            textureMatrix.multiply( scope.matrixWorld );

            // Now update projection matrix with new clip plane, implementing code from: http://www.terathon.com/code/oblique.html
            // Paper explaining this technique: http://www.terathon.com/lengyel/Lengyel-Oblique.pdf
            reflectorPlane.setFromNormalAndCoplanarPoint( normal, reflectorWorldPosition );
            reflectorPlane.applyMatrix4( virtualCamera.matrixWorldInverse );

            clipPlane.set( reflectorPlane.normal.x, reflectorPlane.normal.y, reflectorPlane.normal.z, reflectorPlane.constant );

            var projectionMatrix = virtualCamera.projectionMatrix;

            q.x = ( Math.sign( clipPlane.x ) + projectionMatrix.elements[ 8 ] ) / projectionMatrix.elements[ 0 ];
            q.y = ( Math.sign( clipPlane.y ) + projectionMatrix.elements[ 9 ] ) / projectionMatrix.elements[ 5 ];
            q.z = - 1.0;
            q.w = ( 1.0 + projectionMatrix.elements[ 10 ] ) / projectionMatrix.elements[ 14 ];

            // Calculate the scaled plane vector
            clipPlane.multiplyScalar( 2.0 / clipPlane.dot( q ) );

            // Replacing the third row of the projection matrix
            projectionMatrix.elements[ 2 ] = clipPlane.x;
            projectionMatrix.elements[ 6 ] = clipPlane.y;
            projectionMatrix.elements[ 10 ] = clipPlane.z + 1.0 - clipBias;
            projectionMatrix.elements[ 14 ] = clipPlane.w;

            // Render

            var currentRenderTarget = renderer.getRenderTarget();

            if (renderTarget == null) {
                const outputEncoding = ( currentRenderTarget === null ) ? renderer.outputEncoding : currentRenderTarget.texture.encoding;
                renderTarget = createRenderTarget(outputEncoding);
            }
            scope.visible = false;

            /* renderer.setRenderTarget(renderTarget);
            renderer.clear(true, true, true);
                renderer.render(scene, virtualCamera);
                renderer.setRenderTarget(null); */


            var currentXrEnabled = renderer.xr.enabled;
            var currentShadowAutoUpdate = renderer.shadowMap.autoUpdate;

            renderer.xr.enabled = false; // Avoid camera modification and recursion
            renderer.shadowMap.autoUpdate = false; // Avoid re-computing shadows

            renderer.setRenderTarget( renderTarget );
            renderer.state.buffers.depth.setMask(true);
            renderer.setClearColor(whiteColor, 1);
            if ( renderer.autoClear === false ) renderer.clear();
            // // need to update frame to request skeleton update for the renderer skeleton update
            // // in case of first person view when head gets removed.
            // renderer.info.render.frame ++;
            renderer.render( scene, virtualCamera );

            renderer.xr.enabled = currentXrEnabled;
            renderer.shadowMap.autoUpdate = currentShadowAutoUpdate;

            renderer.setRenderTarget( currentRenderTarget );

            // Restore viewport

            var viewport = camera.viewport;

            if ( viewport !== undefined ) {

                renderer.state.viewport( viewport );

            }

            scope.visible = true;

            lastRendered = true;
    } else {
      if (lastRendered) {
        const currentRenderTarget = renderer.getRenderTarget();
        renderer.setRenderTarget(renderTarget);
        renderer.setClearColor(blackColor, 1);
        renderer.clear();
        renderer.setRenderTarget(currentRenderTarget);
      }
      lastRendered = false;
    }

    renderer.setClearColor(oldClearColor, oldClearAlpha);

    this.onAfterRender2 && this.onAfterRender2(renderer, scene, camera);
    };

    this.getRenderTarget = function () {

        return renderTarget;

    };

}
};
Reflector.ReflectorShader = {

    uniforms: {

        'color': {
            value: null
        },

        'tDiffuse': {
            value: null
        },

        'textureMatrix': {
            value: null
        }

    },

    vertexShader: [
        `${THREE.ShaderChunk.common}`,
        `${THREE.ShaderChunk.logdepthbuf_pars_vertex}`,
        'uniform mat4 textureMatrix;',
        'varying vec4 vUv;',

        'void main() {',

        '	vUv = textureMatrix * vec4( position, 1.0 );',

        '	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );',

        `${THREE.ShaderChunk.logdepthbuf_vertex}`,

        '}'
    ].join( '\n' ),

    fragmentShader: [
        'uniform vec3 color;',
        'uniform sampler2D tDiffuse;',
        'varying vec4 vUv;',

        `${THREE.ShaderChunk.logdepthbuf_pars_fragment}`,

        'float blendOverlay( float base, float blend ) {',

        '	return( base < 0.5 ? ( 2.0 * base * blend ) : ( 1.0 - 2.0 * ( 1.0 - base ) * ( 1.0 - blend ) ) );',

        '}',

        'vec3 blendOverlay( vec3 base, vec3 blend ) {',

        '	return vec3( blendOverlay( base.r, blend.r ), blendOverlay( base.g, blend.g ), blendOverlay( base.b, blend.b ) );',

        '}',

        'void main() {',

        '	vec4 base = texture2DProj( tDiffuse, vUv );',
        '	gl_FragColor = vec4( blendOverlay( base.rgb, color ), 1.0 );',
        ' #include <encodings_fragment>',

        `${THREE.ShaderChunk.logdepthbuf_fragment}`,

        '}'
    ].join( '\n' )
};

export {Reflector};