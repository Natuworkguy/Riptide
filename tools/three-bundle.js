// What static/vendor/three/three.min.js is built from: three.js and the add-ons Riptide's 3D layers use, as one
// file that sets window.RiptideThree. To rebuild it (from a folder with three@0.186.1 and esbuild installed):
//
//   npx esbuild tools/three-bundle.js --bundle --minify --format=iife --legal-comments=none \
//     --banner:js="/* three.js 0.186.1 (MIT, see LICENSE.txt): core, GLTFLoader, GLTFExporter, OBJLoader, FontLoader, TextGeometry, RoundedBoxGeometry and RoomEnvironment, bundled as window.RiptideThree for Riptide's 3D layers. */" \
//     --outfile=static/vendor/three/three.min.js
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

window.RiptideThree = { ...THREE, GLTFLoader, GLTFExporter, OBJLoader, FontLoader, TextGeometry, RoundedBoxGeometry, RoomEnvironment };
