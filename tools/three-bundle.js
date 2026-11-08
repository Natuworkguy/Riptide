// What static/vendor/three/three.min.js is built from: three.js and the add-ons Riptide's 3D layers use, as one
// file that sets window.RiptideThree. To rebuild it (from a folder with three@0.186.1, three-gpu-pathtracer@0.0.27, three-mesh-bvh@0.9.16, three-bvh-csg@0.0.18 and esbuild installed):
//
//   npx esbuild tools/three-bundle.js --bundle --minify --format=iife --legal-comments=none \
//     --banner:js="/* three.js 0.186.1 (MIT, see LICENSE.txt): core, GLTFLoader, GLTFExporter, OBJLoader, FontLoader, TextGeometry, RoundedBoxGeometry, RoomEnvironment, BufferGeometryUtils, SkeletonUtils, the post-processing passes (EffectComposer, RenderPass, ShaderPass, UnrealBloomPass, BokehPass, GTAOPass, SMAAPass, OutputPass), OrbitControls, TransformControls, HDRLoader and Reflector, with three-gpu-pathtracer 0.0.27 (MIT), three-mesh-bvh 0.9.16 (MIT) and three-bvh-csg 0.0.18 (MIT), bundled as window.RiptideThree for Riptide's 3D layers. */" \
//     --outfile=static/vendor/three/three.min.js
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { WebGLPathTracer, PhysicalCamera, GradientEquirectTexture } from 'three-gpu-pathtracer';
import { MeshBVH, acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';
import { Brush, Evaluator, ADDITION, SUBTRACTION, INTERSECTION } from 'three-bvh-csg';

window.RiptideThree = { ...THREE, GLTFLoader, GLTFExporter, OBJLoader, FontLoader, TextGeometry, RoundedBoxGeometry, RoomEnvironment,
  BufferGeometryUtils, SkeletonUtils, EffectComposer, RenderPass, ShaderPass, UnrealBloomPass, BokehPass, GTAOPass, SMAAPass, OutputPass,
  OrbitControls, TransformControls, HDRLoader, Reflector, WebGLPathTracer, PhysicalCamera, GradientEquirectTexture,
  MeshBVH, acceleratedRaycast, computeBoundsTree, disposeBoundsTree, Brush, Evaluator, CSG: { ADDITION, SUBTRACTION, INTERSECTION } };
