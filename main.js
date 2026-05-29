// main.js
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { DroneAgent } from './DroneAgent.js';

// 1. Səhnə və Kamera Yaradılması
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x88ccee); // Səma rəngi

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 10, 20);

// 2. İşıqlandırma
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(5, 10, 7.5);
scene.add(light);
scene.add(new THREE.AmbientLight(0xffffff, 0.3)); // Əlavə yumşaq işıq

// 3. Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// 4. Cannon.js Dünyasının Qurulması
const world = new CANNON.World();
world.gravity.set(0, -9.82, 0); // Yerçəkimi qüvvəsi
world.broadphase = new CANNON.NaiveBroadphase();
world.solver.iterations = 10;

// --- ZƏMİN (FLOOR) - Dronların düşməməsi üçün maneə rolunda ---
const floorShape = new CANNON.Plane();
const floorBody = new CANNON.Body({ mass: 0 }); // tərpənməz obyekt
floorBody.addShape(floorShape);
floorBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
world.addBody(floorBody);

const floorGeo = new THREE.PlaneGeometry(50, 50);
const floorMat = new THREE.MeshPhongMaterial({ color: 0x55aa55 });
const floorMesh = new THREE.Mesh(floorGeo, floorMat);
floorMesh.rotation.x = -Math.PI / 2;
scene.add(floorMesh);
// -------------------------------------------------------------

// 5. Beş ədəd DRL Ağıllı DroneAgent Nümunəsinin Yaradılması
const drones = [];
for (let i = 0; i < 5; i++) {
  const startPos = { x: i * 3 - 6, y: 5, z: 0 }; // Bir-birindən bir az aralı başlayırlar
  const type = (i % 2 === 0) ? 'box' : 'sphere';
  
  // Dron agentini yaradırıq (Sensor konfiqurasiyası: 8 şüa, maks məsafə: 20 metr)
  const drone = new DroneAgent(
    `drone${i}`, 
    startPos, 
    type, 
    1, // ölçü
    1, // kütlə
    0xff0000 + i * 0x0022ff, // fərqli rənglər
    scene, 
    world, 
    { numRays: 8, maxDistance: 20 }
  );
  drones.push(drone);
}

// 6. Animasiya və Simulyasiya Döngüsü
const timeStep = 1 / 60; // saniyədə 60 kadr
function animate() {
  requestAnimationFrame(animate);

  // Fizika simulyasiyasını irəlilət
  world.step(timeStep);

  // Hər bir ağıllı dronu yenilə (Sensorları oxuyacaq və neyron şəbəkə ilə qərar verəcək)
  drones.forEach(agent => agent.update(timeStep));

  // Səhnəni ekranda göstər
  renderer.render(scene, camera);
}

// Ekran ölçüsü dəyişəndə brauzerə uyğunlaşdır
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();