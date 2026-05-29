// main.js
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DroneAgent } from './DroneAgent.js';

// 1. SƏHNƏ VƏ MAVİ GÖY ÜZÜ
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x88ccee); 

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 30, 40); // Bütün şəhəri yuxarıdan geniş görmək üçün kamera məsafəsi artırıldı

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxPolarAngle = Math.PI / 2 - 0.05;

// 2. İŞIQLANDIRMA
const dirLight = new THREE.DirectionalLight(0xffffff, 1.4);
dirLight.position.set(30, 50, 20);
dirLight.castShadow = true;
// Kölgə keyfiyyətini şəhər ölçüsünə görə artırırıq
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
scene.add(dirLight);
scene.add(new THREE.AmbientLight(0xffffff, 0.5));

// 3. FİZİKA DÜNYASI VƏ BÖYÜK YAŞIL OTLUQ (Şəhər Ərazisi)
const world = new CANNON.World();
world.gravity.set(0, -9.82, 0);

const floorShape = new CANNON.Plane();
const floorBody = new CANNON.Body({ mass: 0 });
floorBody.addShape(floorShape);
floorBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
world.addBody(floorBody);

const mapSize = 160; // Xəritə böyüdü
const floorGeo = new THREE.PlaneGeometry(mapSize, mapSize);
const floorMat = new THREE.MeshPhongMaterial({ color: 0x3b8216 }); // Canlı şəhər kənarı yaşılı
const floorMesh = new THREE.Mesh(floorGeo, floorMat);
floorMesh.rotation.x = -Math.PI / 2;
floorMesh.receiveShadow = true;
scene.add(floorMesh);

// 4. YOL ŞƏBƏKƏSİNİN ÇOXALDILMASI (Grid Prospekt və Küçələr)
const roadMat = new THREE.MeshPhongMaterial({ color: 0x222222, roughness: 0.85 });
const roadWidth = 5; // Realist yol eni

// Bizə lazım olan yol koordinatları (Məsələn, parallel uzanan prospektlər)
const verticalRoadPositions = [-30, -10, 10, 30];   // Z oxu boyu uzanan şaquli yollar
const horizontalRoadPositions = [-30, -10, 10, 30]; // X oxu boyu uzanan üfüqi yollar

// Şaquli yolları çəkirik
verticalRoadPositions.forEach(xPos => {
  const roadGeo = new THREE.PlaneGeometry(roadWidth, mapSize);
  const road = new THREE.Mesh(roadGeo, roadMat);
  road.rotation.x = -Math.PI / 2;
  road.position.set(xPos, 0.01, 0);
  road.receiveShadow = true;
  scene.add(road);
});

// Üfüqi yolları çəkirik
horizontalRoadPositions.forEach(zPos => {
  const roadGeo = new THREE.PlaneGeometry(mapSize, roadWidth);
  const road = new THREE.Mesh(roadGeo, roadMat);
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.015, zPos); // Üst-üstə düşməməsi (Z-fighting) üçün yüngül Y fərqi
  road.receiveShadow = true;
  scene.add(road);
});

// 5. MANEƏLƏRİN (BİNALARIN) ÇOXALDILMASI VƏ KVARTALLARA YERLƏŞDİRİLMƏSİ
const obstacleMeshes = [];
const obstacleBodies = [];

function createBuilding(x, z, type, dimensions) {
  let geo;
  // Binalara fərqli vizual çalarlar veririk (Şəhər relyefi üçün)
  const colors = [0x4a5568, 0x2d3748, 0x718096, 0x1a202c];
  const randomColor = colors[Math.floor(Math.random() * colors.length)];
  const mat = new THREE.MeshPhongMaterial({ color: randomColor, specular: 0x333333, shininess: 15 });

  if (type === 'cube') {
    geo = new THREE.BoxGeometry(dimensions.w, dimensions.h, dimensions.d);
  } else if (type === 'cylinder') {
    geo = new THREE.CylinderGeometry(dimensions.r, dimensions.r, dimensions.h, 16);
  }

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, dimensions.h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  obstacleMeshes.push(mesh);

  // Fiziki gövdə
  let shape;
  if (type === 'cube') {
    shape = new CANNON.Box(new CANNON.Vec3(dimensions.w / 2, dimensions.h / 2, dimensions.d / 2));
  } else if (type === 'cylinder') {
    shape = new CANNON.Cylinder(dimensions.r, dimensions.r, dimensions.h, 16);
  }

  const body = new CANNON.Body({ mass: 0 });
  body.addShape(shape);
  body.position.set(x, dimensions.h / 2, z);
  world.addBody(body);
  obstacleBodies.push(body);
}

// Binaları avtomatik olaraq yolların KƏNARINDAKI boş məhəllələrə (kvartallara) düzən alqoritm
// Yollar -30, -10, 10, 30 nöqtələrindədir. Binaları bu koordinatların ortasına yerləşdiririk.
const blockCenters = [-20, 0, 20]; // Yolların kəsilməsindən yaranan əsas məhəllə mərkəzləri

blockCenters.forEach(bx => {
  blockCenters.forEach(bz => {
    // Hər məhəllənin daxilinə fərqli ölçülərdə 2-3 bina yerləşdiririk (Yoldan tam uzaq)
    
    // Məhəllə mərkəzində əsas hündür göydələn (Kub)
    const h1 = 8 + Math.random() * 6; // 8-14 metr arası fərqli hündürlüklər
    createBuilding(bx, bz, 'cube', { w: 6, h: h1, d: 6 });

    // Məhəllənin künclərində köməkçi silindrik və ya kiçik binalar
    const h2 = 5 + Math.random() * 4;
    createBuilding(bx - 4, bz - 4, 'cylinder', { r: 2, h: h2 });

    const h3 = 6 + Math.random() * 5;
    createBuilding(bx + 4, bz + 4, 'cube', { w: 3, h: h3, d: 3 });
  });
});

// Extra binalar (Kənar böyük boşluqlar üçün)
createBuilding(-45, -45, 'cube', { w: 12, h: 16, d: 12 });
createBuilding(45, 45, 'cylinder', { r: 6, h: 18 });

// 6. HƏDƏF NÖQTƏSİ (Qırmızı Kürə)
let isTargetSet = false;
let targetPos = { x: 0, y: 7.0, z: 0 }; // Uçuş hündürlüyü binalara görə bir az qaldırıldı

const targetGeo = new THREE.SphereGeometry(0.5, 32, 32);
const targetMat = new THREE.MeshPhongMaterial({ color: 0xff0000, emissive: 0x330000 });
const targetMesh = new THREE.Mesh(targetGeo, targetMat);
targetMesh.position.set(targetPos.x, targetPos.y, targetPos.z);
targetMesh.visible = false; 
scene.add(targetMesh);

// 7. DRONLAR (Ssenari A-dakı start və orijinal parametrlərlə)
const drones = [];
const startPositions = [{ x: -38, y: 7.0, z: -38 }, { x: 38, y: 7.0, z: 38 }]; // Şəhərin iki fərqli ucundan başlayırlar
const colors = [0x0055ff, 0xffaa00]; 

for (let i = 0; i < 2; i++) {
  const drone = new DroneAgent(`drone_${i}`, startPositions[i], colors[i], scene, world);
  drones.push(drone);
}

// 8. İKİQAT KLİKLƏ HƏDƏF SEÇİMİ
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
    targetPos.y = 7.0; // Stabil təhlükəsiz uçuş hündürlüyü
    targetPos.z = point.z;

    targetMesh.position.set(targetPos.x, targetPos.y, targetPos.z);
    targetMesh.visible = true; 
    isTargetSet = true; 

    console.log(`[Ssenari B - Şəhər] Yeni Hədəf Kvartalı: X=${targetPos.x.toFixed(1)}, Z=${targetPos.z.toFixed(1)}`);
  }
});

// 9. SİMULYASİYA TƏLİM DÖNGÜSÜ
const timeStep = 1 / 60;

async function animate() {
  requestAnimationFrame(animate);

  controls.update();
  world.step(timeStep);

  for (const drone of drones) {
    const oldState = drone.getState(targetPos, obstacleBodies);
    drone.update(timeStep, targetPos, isTargetSet, drones, obstacleBodies); 

    if (isTargetSet) {
      const currentAction = drone.lastAction;
      const reward = drone.calculateReward(targetPos, drones, obstacleBodies);
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