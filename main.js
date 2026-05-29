// main.js
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DroneAgent } from './DroneAgent.js';

// 1. SƏHNƏ VƏ MAVİ GÖY ÜZÜ
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x88ccee); 

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 12, 18);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxPolarAngle = Math.PI / 2 - 0.05;

// 2. İŞIQLANDIRMA
const dirLight = new THREE.DirectionalLight(0xffffff, 1.3);
dirLight.position.set(15, 25, 10);
dirLight.castShadow = true;
scene.add(dirLight);
scene.add(new THREE.AmbientLight(0xffffff, 0.45));

// 3. FİZİKA DÜNYASI VƏ TƏMİZ YAŞIL OTLUQ (GRİDLƏR SİLİNDİ)
const world = new CANNON.World();
world.gravity.set(0, -9.82, 0);

const floorShape = new CANNON.Plane();
const floorBody = new CANNON.Body({ mass: 0 });
floorBody.addShape(floorShape);
floorBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
world.addBody(floorBody);

const floorGeo = new THREE.PlaneGeometry(120, 120);
const floorMat = new THREE.MeshPhongMaterial({ color: 0x449944 }); // Təmiz, dözümlü yaşıl örtük (Heç bir xətt yoxdur)
const floorMesh = new THREE.Mesh(floorGeo, floorMat);
floorMesh.rotation.x = -Math.PI / 2;
floorMesh.receiveShadow = true;
scene.add(floorMesh);

// 4. MANUALLY SET REAL QIRMIZI HƏDƏF
let isTargetSet = false;
let targetPos = { x: 0, y: 5, z: 0 }; 

const targetGeo = new THREE.SphereGeometry(0.4, 32, 32);
const targetMat = new THREE.MeshPhongMaterial({ color: 0xff0000, emissive: 0x220000 });
const targetMesh = new THREE.Mesh(targetGeo, targetMat);
targetMesh.position.set(targetPos.x, targetPos.y, targetPos.z);
targetMesh.visible = false; 
scene.add(targetMesh);

// 5. 2 RE-AL GÖRÜNÜŞLÜ DRON (Mavi və Sarı)
const drones = [];
const startPositions = [{ x: -6, y: 3, z: -2 }, { x: 6, y: 3, z: 2 }];
const colors = [0x0055ff, 0xffaa00]; 

for (let i = 0; i < 2; i++) {
  const drone = new DroneAgent(`drone_${i}`, startPositions[i], colors[i], scene, world);
  drones.push(drone);
}

// 6. İKİQAT KLİKLƏ HƏDƏF SEÇİMİ
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

window.addEventListener('dblclick', (event) => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(floorMesh);

  if (intersects.length > 0) {
    const point = intersects[0].point;
    targetPos.x = point.x;
    targetPos.y = 5; 
    targetPos.z = point.z;

    targetMesh.position.set(targetPos.x, targetPos.y, targetPos.z);
    targetMesh.visible = true; 
    isTargetSet = true; 

    console.log(`[Ssenari A Opt] Hədəf nöqtəsi: X=${targetPos.x.toFixed(1)}, Z=${targetPos.z.toFixed(1)}`);
  }
});

// 7. SİMULYASİYA TƏLİM DÖNGÜSÜ
const timeStep = 1 / 60;

async function animate() {
  requestAnimationFrame(animate);

  controls.update();
  world.step(timeStep);

for (const drone of drones) {
    const oldState = drone.getState(targetPos);
    
    // BURANI DƏYİŞDİK: drones massivini də update funksiyasına ötürürük!
    drone.update(timeStep, targetPos, isTargetSet, drones); 

    if (isTargetSet) {
      const currentAction = drone.lastAction;
      const reward = drone.calculateReward(targetPos, drones);
      await drone.trainStep(oldState, currentAction, reward);
    }
  }

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();