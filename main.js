/**
 * ============================================================================
 * MULTI-AGENT AUTONOMOUS DRONE SIMULATION SYSTEM
 * ============================================================================
 * 
 * Sistem Mimarı:
 * - Three.js: 3D Renderləmə
 * - Cannon.js: Fizik Simulyasiyası
 * - TensorFlow.js: Neyron Şəbəkəsi Eğitmə
 * - DRL + Potential Field: Hibrid Kontrol Sistemi
 * 
 * ============================================================================
 */

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DroneAgent } from './DroneAgent.js';

const DataLogger = {
  rewards: [],
  collisions: 0,
  successes: 0,
  steps: 0,
  
  log(reward, isCollision, isSuccess) {
    this.rewards.push(reward);
    if (isCollision) this.collisions++;
    if (isSuccess) this.successes++;
    this.steps++;
  },

  exportData() {
    const data = {
      rewards: this.rewards,
      collisions: this.collisions,
      successes: this.successes,
      averageReward: this.rewards.length > 0 ? this.rewards.reduce((a, b) => a + b, 0) / this.rewards.length : 0
    };

    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `simulation_data_${new Date().getTime()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log("Məlumatlar endirildi!");
  }
};

window.DataLogger = DataLogger; // Qlobala çıxarırıq
console.log("DataLogger qlobala uğurla bağlandı.");
/**
 * ============================================================================
 * 1. DINAMIK MANEƏLƏRİN SINIFI (DynamicObstacle)
 * ============================================================================
 * 
 * Məqsəd: Maşın, Quş və Təyyarə kimi hərəkət edən nəsnələrin idarə edilməsi.
 * Kinematic body (mass=0) istifadə edərək, dronun sensorları tərəfindən 
 * tanınır lakin simülasiya hesablamalarını artırmaz.
 */
class DynamicObstacle {
  constructor(type, startPos, scene, world) {
    this.type = type; // 'car' və ya 'bird'
    this.scene = scene;
    this.world = world;
    this.position = new THREE.Vector3(startPos.x, startPos.y, startPos.z);
    this.velocity = new THREE.Vector3();
    this.time = 0;
    
    if (type === 'car') {
      // Maşın: Yol şəbəkəsində xətti hərəkət
      this.roadIndex = Math.floor(Math.random() * 4); // Hansı yolda hərəkət edəcəyini seç
      this.direction = Math.random() > 0.5 ? 1 : -1; // Yolda irəli və ya geri
      this.speed = 15 + Math.random() * 10; // 15-25 m/s
      this.roadLength = 160;
      this.pathType = Math.random() > 0.5 ? 'vertical' : 'horizontal';
      
      // Maşın vizual - kabin, gövdə, təkərlər və farlar
      this.mesh = new THREE.Group();
      const bodyMat = new THREE.MeshPhongMaterial({ color: new THREE.Color().setHSL(Math.random(), 0.8, 0.45), shininess: 70 });
      const windowMat = new THREE.MeshPhongMaterial({ color: 0x4488cc, transparent: true, opacity: 0.75 });
      const wheelMat = new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 10 });
      const lightMat = new THREE.MeshPhongMaterial({ color: 0xffffaa, emissive: 0xffff88, emissiveIntensity: 0.8 });

      const chassisGeo = new THREE.BoxGeometry(1.5, 0.7, 3);
      const chassis = new THREE.Mesh(chassisGeo, bodyMat);
      chassis.position.y = 0.35;
      chassis.castShadow = true;
      this.mesh.add(chassis);

      const cabinGeo = new THREE.BoxGeometry(1.2, 0.4, 1.2);
      const cabin = new THREE.Mesh(cabinGeo, windowMat);
      cabin.position.set(0, 0.65, 0);
      cabin.castShadow = true;
      this.mesh.add(cabin);

      const wheelGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.4, 12);
      for (let wx of [-0.6, 0.6]) {
        for (let wz of [-1.0, 1.0]) {
          const wheel = new THREE.Mesh(wheelGeo, wheelMat);
          wheel.rotation.z = Math.PI / 2;
          wheel.position.set(wx, 0.15, wz);
          wheel.castShadow = true;
          this.mesh.add(wheel);
        }
      }

      const headlightGeo = new THREE.SphereGeometry(0.08, 8, 8);
      const leftLight = new THREE.Mesh(headlightGeo, lightMat);
      const rightLight = leftLight.clone();
      leftLight.position.set(-0.45, 0.4, -1.5);
      rightLight.position.set(0.45, 0.4, -1.5);
      this.mesh.add(leftLight, rightLight);

      this.mesh.position.copy(this.position);
      scene.add(this.mesh);
      
      // Cannon.js kinematic body
      const carShape = new CANNON.Box(new CANNON.Vec3(0.75, 0.35, 1.5));
      this.body = new CANNON.Body({ mass: 0 }); // Kinematic
      this.body.addShape(carShape);
      this.body.position.set(startPos.x, startPos.y, startPos.z);
      world.addBody(this.body);
    } 
    else if (type === 'bird') {
      // Quş: Havada dairəvi/sinusidal trayektoriya
      this.centerX = startPos.x;
      this.centerZ = startPos.z;
      this.radius = 12 + Math.random() * 18; // 12-30 metrlə
      this.altitude = 22 + Math.random() * 12; // 22-34 metrlə
      this.angularVelocity = (Math.random() + 0.6) * 0.35; // Dairə içində hərəkət sürəti
      this.time = Math.random() * Math.PI * 2;
      this.subType = startPos.subType || 'gull';

      // Quş vizual - müxtəlif növlər üçün fərqli qanad və bədən forması
      this.mesh = new THREE.Group();
      let bodyMat, wingMat, beakMat;
      if (this.subType === 'gull') {
        bodyMat = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 40 });
        wingMat = new THREE.MeshPhongMaterial({ color: 0xdddddd, shininess: 10 });
        beakMat = new THREE.MeshPhongMaterial({ color: 0xffaa00, emissive: 0xee8800 });
      } else {
        bodyMat = new THREE.MeshPhongMaterial({ color: 0x999999, shininess: 40 });
        wingMat = new THREE.MeshPhongMaterial({ color: 0x555555, shininess: 10 });
        beakMat = new THREE.MeshPhongMaterial({ color: 0xffcc66, emissive: 0xddaa55 });
      }

      const bodyGeo = this.subType === 'gull'
        ? new THREE.SphereGeometry(0.45, 16, 16)
        : new THREE.OctahedronGeometry(0.45, 0);
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.castShadow = true;
      this.mesh.add(body);

      const wingGeo = this.subType === 'gull'
        ? new THREE.BoxGeometry(1.2, 0.08, 0.4)
        : new THREE.BoxGeometry(1.6, 0.08, 0.3);
      this.wingLeft = new THREE.Mesh(wingGeo, wingMat);
      this.wingRight = this.wingLeft.clone();
      this.wingLeft.position.set(-0.75, 0, 0);
      this.wingRight.position.set(0.75, 0, 0);
      this.wingLeft.rotation.z = this.subType === 'gull' ? 0.2 : 0.3;
      this.wingRight.rotation.z = this.subType === 'gull' ? -0.2 : -0.3;
      this.mesh.add(this.wingLeft, this.wingRight);

      const beakGeo = new THREE.ConeGeometry(0.12, 0.35, 10);
      const beak = new THREE.Mesh(beakGeo, beakMat);
      beak.rotation.x = Math.PI / 2;
      beak.position.set(0, 0, 0.55);
      this.mesh.add(beak);

      const eyeGeo = new THREE.SphereGeometry(0.06, 8, 8);
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
      const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
      const rightEye = leftEye.clone();
      leftEye.position.set(-0.18, 0.18, 0.35);
      rightEye.position.set(0.18, 0.18, 0.35);
      this.mesh.add(leftEye, rightEye);

      if (this.subType === 'swift') {
        const tailGeo = new THREE.ConeGeometry(0.15, 0.4, 8);
        const tail = new THREE.Mesh(tailGeo, bodyMat);
        tail.rotation.x = -Math.PI / 2;
        tail.position.set(0, 0, -0.4);
        this.mesh.add(tail);
      }

      this.mesh.position.copy(this.position);
      scene.add(this.mesh);
      
      // Cannon.js kinematic body
      const birdShape = new CANNON.Sphere(0.5);
      this.body = new CANNON.Body({ mass: 0 }); // Kinematic
      this.body.addShape(birdShape);
      this.body.position.set(startPos.x, startPos.y, startPos.z);
      world.addBody(this.body);
    } 
    else if (type === 'plane') {
      // Təyyarə: yuxarıdan keçir və sonra müəyyən vaxt sonra yenidən daxil olur
      this.active = false;
      this.waitTime = startPos.startDelay || 4.0;
      this.planeDirection = startPos.direction || 1;
      this.startAltitude = startPos.altitude || 40;
      this.flightZ = startPos.flightZ || -15;
      this.speed = 40 + Math.random() * 15;
      this.time = 0;

      this.mesh = new THREE.Group();
      const bodyMat = new THREE.MeshPhongMaterial({ color: 0x4444aa, shininess: 80, emissive: 0x112266, emissiveIntensity: 0.1 });
      const wingMat = new THREE.MeshPhongMaterial({ color: 0xeeeeee, shininess: 20 });
      const cockpitMat = new THREE.MeshPhongMaterial({ color: 0x222222, transparent: true, opacity: 0.7 });

      const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 5, 16), bodyMat);
      fuselage.rotation.z = Math.PI / 2;
      fuselage.castShadow = true;
      this.mesh.add(fuselage);

      const wing = new THREE.Mesh(new THREE.BoxGeometry(6, 0.1, 1.2), wingMat);
      wing.position.set(0, 0, 0);
      wing.castShadow = true;
      this.mesh.add(wing);

      const tail = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.2, 0.5), wingMat);
      tail.position.set(-2.2, 0.35, 0);
      tail.rotation.y = Math.PI / 12;
      this.mesh.add(tail);

      const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 16), cockpitMat);
      cockpit.position.set(1.2, 0.2, 0);
      this.mesh.add(cockpit);

      const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 1.0, 12), new THREE.MeshPhongMaterial({ color: 0x333333 }));
      engine.rotation.z = Math.PI / 2;
      engine.position.set(2.5, 0, 0);
      this.mesh.add(engine);

      scene.add(this.mesh);

      const planeShape = new CANNON.Box(new CANNON.Vec3(2.5, 0.3, 0.6));
      this.body = new CANNON.Body({ mass: 0 });
      this.body.addShape(planeShape);
      this.body.position.set(0, this.startAltitude, this.flightZ);
      world.addBody(this.body);
    }
  }
  
  update(dt) {
    const roadPositions = [-30, -10, 10, 30];
    
    if (this.type === 'car') {
      if (this.pathType === 'vertical') {
        // X-Y sabitdir, Z-də hərəkət
        this.position.x = roadPositions[this.roadIndex];
        this.position.z += this.direction * this.speed * dt;
        
        // Sona çatdıqda başlanğıca qay
        if (this.position.z > this.roadLength / 2) {
          this.position.z = -this.roadLength / 2;
        } else if (this.position.z < -this.roadLength / 2) {
          this.position.z = this.roadLength / 2;
        }
        
        this.velocity.set(0, 0, this.direction * this.speed);
      } else {
        // Z sabitdir, X-də hərəkət
        this.position.z = roadPositions[this.roadIndex];
        this.position.x += this.direction * this.speed * dt;
        
        if (this.position.x > this.roadLength / 2) {
          this.position.x = -this.roadLength / 2;
        } else if (this.position.x < -this.roadLength / 2) {
          this.position.x = this.roadLength / 2;
        }
        
        this.velocity.set(this.direction * this.speed, 0, 0);
      }
      this.position.y = 0.5;
    } 
    else if (this.type === 'bird') {
      // Dairəvi trayektoriya
      this.time += this.angularVelocity * dt;
      this.position.x = this.centerX + Math.cos(this.time) * this.radius;
      this.position.z = this.centerZ + Math.sin(this.time) * this.radius;
      this.position.y = this.altitude + Math.sin(this.time * 2) * 2.5; // Sinusidal hündürlük dəyişikliyi
      
      // Sürət vektoru (dairəvi hərəkət)
      this.velocity.x = -Math.sin(this.time) * this.radius * this.angularVelocity;
      this.velocity.z = Math.cos(this.time) * this.radius * this.angularVelocity;
      this.velocity.y = Math.cos(this.time * 2) * 2.5 * 2 * this.angularVelocity;
    }
    else if (this.type === 'plane') {
      this.time += dt;
      if (!this.active) {
        this.waitTime -= dt;
        if (this.waitTime <= 0) {
          this.active = true;
          this.position.y = this.startAltitude;
          this.position.z = this.flightZ;
          this.position.x = this.planeDirection === 1 ? -110 : 110;
          this.velocity.set(this.speed * this.planeDirection, 0, 0);
        }
      } else {
        // Yuxarıdan hərəkət edən uçuş
        this.position.addScaledVector(this.velocity, dt);
        this.position.y = this.startAltitude + Math.sin(this.time * 1.5) * 1.5;
        this.position.z = this.flightZ + Math.sin(this.time * 0.5) * 2;

        if (Math.abs(this.position.x) > 110) {
          this.active = false;
          this.waitTime = 8 + Math.random() * 6;
          this.velocity.set(0, 0, 0);
          this.position.y = -50;
        }
      }
    }
    
    // Mesh və body pozisiyasını yenilə
    this.mesh.position.copy(this.position);
    this.body.position.set(this.position.x, this.position.y, this.position.z);
    this.body.velocity.set(this.velocity.x, this.velocity.y, this.velocity.z);

    if (this.type === 'car') {
      if (this.pathType === 'vertical') {
        this.mesh.rotation.y = this.direction === 1 ? 0 : Math.PI;
      } else {
        this.mesh.rotation.y = this.direction === 1 ? Math.PI / 2 : -Math.PI / 2;
      }
    } else if (this.type === 'bird') {
      const flap = Math.sin(this.time * 10) * 0.35;
      if (this.wingLeft && this.wingRight) {
        this.wingLeft.rotation.z = 0.2 + flap;
        this.wingRight.rotation.z = -0.2 - flap;
      }
      this.mesh.rotation.y = Math.atan2(this.velocity.x, this.velocity.z);
    }
  }
}

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

// 7.5 DİNAMİK MANEƏLƏR (Ssenari C: Maşınlar və Quşlar)
const dynamicObstacles = [];

// Maşınları yollar üzərində yerləş
for (let i = 0; i < 4; i++) {
  const roadPositions = [-30, -10, 10, 30];
  const isVertical = i % 2 === 0;
  const roadPos = roadPositions[Math.floor(i / 2)];
  
  const carStart = isVertical 
    ? { x: roadPos, y: 0.5, z: -70 + i * 35 }
    : { x: -70 + i * 35, y: 0.5, z: roadPos };
  
  const car = new DynamicObstacle('car', carStart, scene, world);
  dynamicObstacles.push(car);
}

// Quşları şəhər üzərində yerləş
for (let i = 0; i < 5; i++) {
  const birdStart = {
    x: -42 + i * 21,
    y: 28 + (i % 2) * 2,
    z: -24 + (i % 3) * 18,
    subType: i % 2 === 0 ? 'gull' : 'swift'
  };
  const bird = new DynamicObstacle('bird', birdStart, scene, world);
  dynamicObstacles.push(bird);
}

// Təyyarə: yuxarıdan daxil olub uçan və sonra müəyyən vaxtdan sonra təkrar gələn obyekt
const airliner = new DynamicObstacle('plane', {
  startDelay: 3.5,
  direction: Math.random() > 0.5 ? 1 : -1,
  altitude: 36 + Math.random() * 6,
  flightZ: -12
}, scene, world);
dynamicObstacles.push(airliner);

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
    targetPos.z = point.z;
    targetPos.y = event.altKey ? point.y + 0.1 : 7.0; // Alt+double-click yer səviyyəsinə qoyur

    targetMesh.position.set(targetPos.x, targetPos.y, targetPos.z);
    targetMesh.visible = true; 
    isTargetSet = true; 

    const placementType = event.altKey ? 'ground' : 'flight';
    console.log(`[Şəhər Ssenarisi] Yeni Hədəf: X=${targetPos.x.toFixed(1)}, Z=${targetPos.z.toFixed(1)}, Y=${targetPos.y.toFixed(1)} (${placementType})`);
  }
});

window.addEventListener('keydown', (event) => {
  if (!isTargetSet) return;

  const delta = 1.0;
  if (event.key === 'Shift') {
    targetPos.y = Math.min(targetPos.y + delta, 40);
    targetMesh.position.y = targetPos.y;
    console.log(`Target height increased: Y=${targetPos.y.toFixed(1)}`);
  }
  if (event.key === 'Control') {
    targetPos.y = Math.max(targetPos.y - delta, 0);
    targetMesh.position.y = targetPos.y;
    console.log(`Target height decreased: Y=${targetPos.y.toFixed(1)}`);
  }
});

// 9. SİMULYASİYA TƏLİM DÖNGÜSÜ
const timeStep = 1 / 60;

async function animate() {
  requestAnimationFrame(animate);

  controls.update();
  world.step(timeStep);
  
  for (const dynObs of dynamicObstacles) {
    dynObs.update(timeStep);
  }

  for (const drone of drones) {
    const oldState = drone.getState(targetPos, obstacleBodies, dynamicObstacles);
    drone.update(timeStep, targetPos, isTargetSet, drones, obstacleBodies, dynamicObstacles); 

    if (isTargetSet) {
      const currentAction = drone.lastAction;
      const reward = drone.calculateReward(targetPos, drones, obstacleBodies, dynamicObstacles);
      
      // Dronun öz öyrənmə prosesi
      await drone.trainStep(oldState, currentAction, reward);

      // --- MƏLUMATI BURADA LOG EDİRİK ---
      // Dronun toqquşub-toqquşmadığını və hədəfə çatıb-çatmadığını yoxlayırıq
      // Bu dəyişənlər drone obyektində adətən belə olur:
      const isCollision = drone.checkCollision(); // Əgər belə bir funksiyan varsa
      const isSuccess = drone.checkSuccess(targetPos); // Əgər belə bir funksiyan varsa

      DataLogger.log(reward, isCollision, isSuccess);
      // ----------------------------------
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