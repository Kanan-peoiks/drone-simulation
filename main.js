// main.js
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { DroneAgent } from './DroneAgent.js';

// 1. Səhnə və Kameranın Qurulması
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x88ccee); // Səma mavi rəngi

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 15, 25);
camera.lookAt(0, 5, 0);

// 2. İşıqlandırma Sisteminin Qurulması
const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(10, 20, 10);
scene.add(dirLight);
scene.add(new THREE.AmbientLight(0xffffff, 0.4)); // Yumşaq ətraf işığı

// 3. WebGL Renderer Tənzimləməsi
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// 4. Cannon.js Fizika Dünyasının Parametrləri
const world = new CANNON.World();
world.gravity.set(0, -9.82, 0); // Yerçəkimi qüvvəsi
world.broadphase = new CANNON.NaiveBroadphase();
world.solver.iterations = 12;

// Fiziki Zəmin (Floor) - Dronların düşməməsi üçün
const floorShape = new CANNON.Plane();
const floorBody = new CANNON.Body({ mass: 0 }); // Kütlə 0 = Tərpənməz statik obyekt
floorBody.addShape(floorShape);
floorBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
world.addBody(floorBody);

// Vizual Zəmin (Three.js)
const floorGeo = new THREE.PlaneGeometry(60, 60);
const floorMat = new THREE.MeshPhongMaterial({ color: 0x449944 }); // Yaşıl çəmən rəngi
const floorMesh = new THREE.Mesh(floorGeo, floorMat);
floorMesh.rotation.x = -Math.PI / 2;
scene.add(floorMesh);

// 5. Diplom İşinin Əsas Elementi: Qırmızı Hədəf Nöqtəsi (Target)
const targetPos = { x: 0, y: 10, z: 0 }; 
const targetGeo = new THREE.SphereGeometry(0.6, 32, 32);
const targetMat = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true });
const targetMesh = new THREE.Mesh(targetGeo, targetMat);
targetMesh.position.set(targetPos.x, targetPos.y, targetPos.z);
scene.add(targetMesh);

// 6. 5 Ədəd DroneAgent Nümunəsinin Yaradılması
const drones = [];
for (let i = 0; i < 5; i++) {
  // Başlanğıcda dronları yan-yana düzürük
  const startPos = { x: i * 3 - 6, y: 2, z: 0 }; 
  const type = (i % 2 === 0) ? 'box' : 'sphere';
  
  const drone = new DroneAgent(
    `drone${i}`, 
    startPos, 
    type, 
    0.8, // Ölçü
    1.2, // Kütlə (kq)
    (i % 2 === 0) ? 0x0000ff : 0x00fffa, // Fərqli rənglər
    scene, 
    world,
    { numRays: 8, maxDistance: 20 } // Sensor sazlamaları
  );
  drones.push(drone);
}

// 7. Əsas Simulyasiya və DRL Təlim Döngüsü
const timeStep = 1 / 60;

async function animate() {
  requestAnimationFrame(animate);

  // Fizika dünyasını bir addım irəlilət
  world.step(timeStep);

  // Hər bir agent üçün DRL dövrünü işlət
  for (const drone of drones) {
    // Addım A: Cari vəziyyəti (State) yadda saxla
    const oldState = drone.getState();

    // Addım B: Neyron şəbəkə qərarı ilə dronu hərəkət etdir (Fizika və vizual yenilənir)
    drone.update(timeStep);

    // Addım C: Hərəkətdən sonrakı yeni vəziyyəti al
    const nextState = drone.getState();

    // Addım D: Bu hərəkətin nə qədər doğru olduğunu mükafat funksiyası ilə hesabla
    // Güc və burulma əmsallarını [-1, 1] aralığına normallaşdırıb ötürürük
    const currentAction = [drone.body.force.y / 28, drone.body.torque.y / 2.5]; 
    const reward = drone.calculateReward(targetPos, currentAction, drones);

    // Addım E: Alınan nəticə ilə neyron şəbəkəsini dərhal təlim et (Real-time Learning)
    await drone.trainStep(oldState, currentAction, reward, nextState);
  }

  // Səhnəni ekranda render et
  renderer.render(scene, camera);
}

// Brauzer pəncərəsi dəyişdikdə ekranın pozulmaması üçün adaptivlik
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Simulyasiyanı başlat
animate();