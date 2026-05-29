// main.js
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { DroneAgent } from './DroneAgent.js';

// 1. Səhnə, Kamera və Renderer
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb); // Səma rəngi

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 5, 10);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// 2. İşıqlandırma
scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(5, 10, 7.5);
scene.add(dirLight);

// 3. Fizika Dünyası
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });

// --- YER (FLOOR) YARADILMASI (Dronlar düşməsin deyə) ---
const floorShape = new CANNON.Plane();
const floorBody = new CANNON.Body({ mass: 0 }); // Mass 0 = Statik obyekt
floorBody.addShape(floorShape);
floorBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0); // Yerə paralel qoy
world.addBody(floorBody);

const floorGeo = new THREE.PlaneGeometry(20, 20);
const floorMat = new THREE.MeshLambertMaterial({ color: 0x44aa44 }); // Yaşıl rəng
const floorMesh = new THREE.Mesh(floorGeo, floorMat);
floorMesh.rotation.x = -Math.PI / 2;
scene.add(floorMesh);
// --------------------------------------------------------

// 4. Dron Agentlərinin Yaradılması
const drones = [];
for (let i = 0; i < 5; i++) {
    const shape = (i % 2 === 0) ? 'box' : 'sphere';
    const drone = new DroneAgent(scene, world, {
        shape: shape,
        size: 0.8, // Dronun ölçüsü
        mass: 1.5,
        color: (i % 2 === 0) ? 0x0000ff : 0xff0000 // Mavi və Qırmızı dronlar
    });
    // Dronları bir qədər yuxarıdan başladaq ki, düşmə effekti görsənsin
    drone.body.position.set(i * 2 - 4, 5, 0); 
    drones.push(drone);
}

// 5. Animasiya Döngüsü
const timeStep = 1 / 60;
function animate() {
    requestAnimationFrame(animate);

    // Fizika dünyasını irəlilət
    world.fixedStep();

    // Hər bir agenti güncəllə
    for (const drone of drones) {
        drone.update(timeStep);
    }

    renderer.render(scene, camera);
}

// Ekran ölçüsü dəyişdikdə kameranı tənzimlə
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();