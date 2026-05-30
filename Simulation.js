// Simulation.js
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DroneAgent } from './DroneAgent.js';

/**
 * ============================================================
 * CONFIG
 * ============================================================
 */
const FIXED_TIME_STEP = 1 / 60;
const WORLD_SIZE = 160;
const ROAD_WIDTH = 5;
const ROAD_POSITIONS = [-30, -10, 10, 30];
const BLOCK_CENTERS = [-20, 0, 20];

// Scenario mode:
// "A" = formation only
// "B" = static buildings
// "C" = static buildings + dynamic obstacles
const SCENARIO_MODE = (() => {
  const urlMode = new URLSearchParams(window.location.search).get('scenario');
  return (urlMode || 'C').toUpperCase();
})();

/**
 * ============================================================
 * BASIC DOM / RENDERER SETUP
 * ============================================================
 */
document.body.style.margin = '0';
document.body.style.overflow = 'hidden';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x88ccee);
scene.fog = new THREE.Fog(0x88ccee, 90, 240);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 30, 40);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxPolarAngle = Math.PI / 2 - 0.05;

/**
 * ============================================================
 * LIGHTING
 * ============================================================
 */
const dirLight = new THREE.DirectionalLight(0xffffff, 1.4);
dirLight.position.set(30, 50, 20);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
dirLight.shadow.camera.left = -80;
dirLight.shadow.camera.right = 80;
dirLight.shadow.camera.top = 80;
dirLight.shadow.camera.bottom = -80;
scene.add(dirLight);

scene.add(new THREE.AmbientLight(0xffffff, 0.5));

/**
 * ============================================================
 * PHYSICS WORLD
 * ============================================================
 */
const world = new CANNON.World();
world.gravity.set(0, -9.82, 0);
world.allowSleep = true;
world.broadphase = new CANNON.NaiveBroadphase();
world.solver.iterations = 8;

/**
 * ============================================================
 * GROUND / FLOOR
 * ============================================================
 */
const floorShape = new CANNON.Plane();
const floorBody = new CANNON.Body({ mass: 0 });
floorBody.addShape(floorShape);
floorBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
world.addBody(floorBody);

const floorGeo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE);
const floorMat = new THREE.MeshPhongMaterial({ color: 0x3b8216 });
const floorMesh = new THREE.Mesh(floorGeo, floorMat);
floorMesh.rotation.x = -Math.PI / 2;
floorMesh.receiveShadow = true;
scene.add(floorMesh);

/**
 * ============================================================
 * ROADS
 * ============================================================
 */
const roadMat = new THREE.MeshPhongMaterial({ color: 0x222222 });

for (const xPos of ROAD_POSITIONS) {
  const roadGeo = new THREE.PlaneGeometry(ROAD_WIDTH, WORLD_SIZE);
  const road = new THREE.Mesh(roadGeo, roadMat);
  road.rotation.x = -Math.PI / 2;
  road.position.set(xPos, 0.01, 0);
  road.receiveShadow = true;
  scene.add(road);
}

for (const zPos of ROAD_POSITIONS) {
  const roadGeo = new THREE.PlaneGeometry(WORLD_SIZE, ROAD_WIDTH);
  const road = new THREE.Mesh(roadGeo, roadMat);
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.015, zPos);
  road.receiveShadow = true;
  scene.add(road);
}

/**
 * ============================================================
 * STATIC BUILDINGS
 * ============================================================
 */
const obstacleMeshes = [];
const obstacleBodies = [];

function createBuilding(x, z, type, dimensions) {
  const colors = [0x4a5568, 0x2d3748, 0x718096, 0x1a202c];
  const randomColor = colors[Math.floor(Math.random() * colors.length)];
  const mat = new THREE.MeshPhongMaterial({
    color: randomColor,
    specular: 0x333333,
    shininess: 15,
  });

  let geo;
  if (type === 'cube') {
    geo = new THREE.BoxGeometry(dimensions.w, dimensions.h, dimensions.d);
  } else if (type === 'cylinder') {
    geo = new THREE.CylinderGeometry(dimensions.r, dimensions.r, dimensions.h, 16);
  } else {
    throw new Error(`Unknown building type: ${type}`);
  }

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, dimensions.h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  obstacleMeshes.push(mesh);

  let shape;
  if (type === 'cube') {
    shape = new CANNON.Box(
      new CANNON.Vec3(dimensions.w / 2, dimensions.h / 2, dimensions.d / 2)
    );
  } else {
    shape = new CANNON.Cylinder(dimensions.r, dimensions.r, dimensions.h, 16);
  }

  const body = new CANNON.Body({ mass: 0 });
  body.addShape(shape);
  body.position.set(x, dimensions.h / 2, z);
  world.addBody(body);
  obstacleBodies.push(body);
}

function buildCityBlocks() {
  BLOCK_CENTERS.forEach((bx) => {
    BLOCK_CENTERS.forEach((bz) => {
      const h1 = 8 + Math.random() * 6;
      createBuilding(bx, bz, 'cube', { w: 6, h: h1, d: 6 });

      const h2 = 5 + Math.random() * 4;
      createBuilding(bx - 4, bz - 4, 'cylinder', { r: 2, h: h2 });

      const h3 = 6 + Math.random() * 5;
      createBuilding(bx + 4, bz + 4, 'cube', { w: 3, h: h3, d: 3 });
    });
  });

  createBuilding(-45, -45, 'cube', { w: 12, h: 16, d: 12 });
  createBuilding(45, 45, 'cylinder', { r: 6, h: 18 });
}

/**
 * ============================================================
 * DYNAMIC OBSTACLES (CAR / BIRD / PLANE)
 * ============================================================
 */
class DynamicObstacle {
  constructor(type, startPos, scene, world) {
    this.type = type;
    this.scene = scene;
    this.world = world;
    this.position = new THREE.Vector3(startPos.x, startPos.y, startPos.z);
    this.velocity = new THREE.Vector3();
    this.time = 0;

    if (type === 'car') {
      this.roadIndex = Math.floor(Math.random() * 4);
      this.direction = Math.random() > 0.5 ? 1 : -1;
      this.speed = 15 + Math.random() * 10;
      this.roadLength = 160;
      this.pathType = Math.random() > 0.5 ? 'vertical' : 'horizontal';

      this.mesh = new THREE.Group();

      const bodyMat = new THREE.MeshPhongMaterial({
        color: new THREE.Color().setHSL(Math.random(), 0.8, 0.45),
        shininess: 70,
      });
      const windowMat = new THREE.MeshPhongMaterial({
        color: 0x4488cc,
        transparent: true,
        opacity: 0.75,
      });
      const wheelMat = new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 10 });
      const lightMat = new THREE.MeshPhongMaterial({
        color: 0xffffaa,
        emissive: 0xffff88,
        emissiveIntensity: 0.8,
      });

      const chassis = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 0.7, 3),
        bodyMat
      );
      chassis.position.y = 0.35;
      chassis.castShadow = true;
      this.mesh.add(chassis);

      const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.4, 1.2),
        windowMat
      );
      cabin.position.set(0, 0.65, 0);
      cabin.castShadow = true;
      this.mesh.add(cabin);

      const wheelGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.4, 12);
      for (const wx of [-0.6, 0.6]) {
        for (const wz of [-1.0, 1.0]) {
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

      const carShape = new CANNON.Box(new CANNON.Vec3(0.75, 0.35, 1.5));
      this.body = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC });
      this.body.addShape(carShape);
      this.body.position.set(startPos.x, startPos.y, startPos.z);
      world.addBody(this.body);
    } else if (type === 'bird') {
      this.centerX = startPos.x;
      this.centerZ = startPos.z;
      this.radius = 12 + Math.random() * 18;
      this.altitude = 22 + Math.random() * 12;
      this.angularVelocity = (Math.random() + 0.6) * 0.35;
      this.time = Math.random() * Math.PI * 2;
      this.subType = startPos.subType || 'gull';

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

      const beak = new THREE.Mesh(
        new THREE.ConeGeometry(0.12, 0.35, 10),
        beakMat
      );
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
        const tail = new THREE.Mesh(
          new THREE.ConeGeometry(0.15, 0.4, 8),
          bodyMat
        );
        tail.rotation.x = -Math.PI / 2;
        tail.position.set(0, 0, -0.4);
        this.mesh.add(tail);
      }

      this.mesh.position.copy(this.position);
      scene.add(this.mesh);

      const birdShape = new CANNON.Sphere(0.5);
      this.body = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC });
      this.body.addShape(birdShape);
      this.body.position.set(startPos.x, startPos.y, startPos.z);
      world.addBody(this.body);
    } else if (type === 'plane') {
      this.active = false;
      this.waitTime = startPos.startDelay || 4.0;
      this.planeDirection = startPos.direction || 1;
      this.startAltitude = startPos.altitude || 40;
      this.flightZ = startPos.flightZ || -15;
      this.speed = 40 + Math.random() * 15;
      this.time = 0;

      this.mesh = new THREE.Group();

      const bodyMat = new THREE.MeshPhongMaterial({
        color: 0x4444aa,
        shininess: 80,
        emissive: 0x112266,
        emissiveIntensity: 0.1,
      });
      const wingMat = new THREE.MeshPhongMaterial({
        color: 0xeeeeee,
        shininess: 20,
      });
      const cockpitMat = new THREE.MeshPhongMaterial({
        color: 0x222222,
        transparent: true,
        opacity: 0.7,
      });

      const fuselage = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.6, 5, 16),
        bodyMat
      );
      fuselage.rotation.z = Math.PI / 2;
      fuselage.castShadow = true;
      this.mesh.add(fuselage);

      const wing = new THREE.Mesh(
        new THREE.BoxGeometry(6, 0.1, 1.2),
        wingMat
      );
      wing.castShadow = true;
      this.mesh.add(wing);

      const tail = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.2, 0.5),
        wingMat
      );
      tail.position.set(-2.2, 0.35, 0);
      tail.rotation.y = Math.PI / 12;
      this.mesh.add(tail);

      const cockpit = new THREE.Mesh(
        new THREE.SphereGeometry(0.35, 16, 16),
        cockpitMat
      );
      cockpit.position.set(1.2, 0.2, 0);
      this.mesh.add(cockpit);

      const engine = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.15, 1.0, 12),
        new THREE.MeshPhongMaterial({ color: 0x333333 })
      );
      engine.rotation.z = Math.PI / 2;
      engine.position.set(2.5, 0, 0);
      this.mesh.add(engine);

      scene.add(this.mesh);

      const planeShape = new CANNON.Box(new CANNON.Vec3(2.5, 0.3, 0.6));
      this.body = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC });
      this.body.addShape(planeShape);
      this.body.position.set(0, this.startAltitude, this.flightZ);
      world.addBody(this.body);
    } else {
      throw new Error(`Unknown dynamic obstacle type: ${type}`);
    }
  }

  update(dt) {
    const roadPositions = ROAD_POSITIONS;

    if (this.type === 'car') {
      if (this.pathType === 'vertical') {
        this.position.x = roadPositions[this.roadIndex];
        this.position.z += this.direction * this.speed * dt;

        if (this.position.z > this.roadLength / 2) {
          this.position.z = -this.roadLength / 2;
        } else if (this.position.z < -this.roadLength / 2) {
          this.position.z = this.roadLength / 2;
        }

        this.velocity.set(0, 0, this.direction * this.speed);
      } else {
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
    } else if (this.type === 'bird') {
      this.time += this.angularVelocity * dt;

      this.position.x = this.centerX + Math.cos(this.time) * this.radius;
      this.position.z = this.centerZ + Math.sin(this.time) * this.radius;
      this.position.y = this.altitude + Math.sin(this.time * 2) * 2.5;

      this.velocity.x = -Math.sin(this.time) * this.radius * this.angularVelocity;
      this.velocity.z = Math.cos(this.time) * this.radius * this.angularVelocity;
      this.velocity.y = Math.cos(this.time * 2) * 2.5 * 2 * this.angularVelocity;
    } else if (this.type === 'plane') {
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

/**
 * ============================================================
 * TARGET / GOAL
 * ============================================================
 */
let isTargetSet = false;
const targetPos = { x: 0, y: 7.0, z: 0 };

const targetMesh = new THREE.Mesh(
  new THREE.SphereGeometry(0.5, 32, 32),
  new THREE.MeshPhongMaterial({ color: 0xff0000, emissive: 0x330000 })
);
targetMesh.position.set(targetPos.x, targetPos.y, targetPos.z);
targetMesh.visible = false;
scene.add(targetMesh);

/**
 * ============================================================
 * DRONES
 * ============================================================
 */
const drones = [];
const startPositions = [
  { x: -38, y: 7.0, z: -38 },
  { x: 38, y: 7.0, z: 38 },
];
const droneColors = [0x0055ff, 0xffaa00];

for (let i = 0; i < 2; i++) {
  const drone = new DroneAgent(`drone_${i}`, startPositions[i], droneColors[i], scene, world);
  drones.push(drone);
}

/**
 * ============================================================
 * SCENARIO MANAGER
 * ============================================================
 */
const dynamicObstacles = [];

function buildScenarioA() {
  // Formation-focused scenario:
  // default target so the swarm can be observed immediately.
  targetPos.x = 0;
  targetPos.y = 7;
  targetPos.z = 0;
  targetMesh.position.set(targetPos.x, targetPos.y, targetPos.z);
  targetMesh.visible = true;
  isTargetSet = true;
}

function buildScenarioB() {
  buildCityBlocks();

  // Keep target available for user placement
  targetMesh.visible = false;
  isTargetSet = false;
}

function buildScenarioC() {
  buildCityBlocks();

  // Cars
  for (let i = 0; i < 4; i++) {
    const isVertical = i % 2 === 0;
    const roadPos = ROAD_POSITIONS[Math.floor(i / 2)];

    const carStart = isVertical
      ? { x: roadPos, y: 0.5, z: -70 + i * 35 }
      : { x: -70 + i * 35, y: 0.5, z: roadPos };

    dynamicObstacles.push(new DynamicObstacle('car', carStart, scene, world));
  }

  // Birds
  for (let i = 0; i < 5; i++) {
    const birdStart = {
      x: -42 + i * 21,
      y: 28 + (i % 2) * 2,
      z: -24 + (i % 3) * 18,
      subType: i % 2 === 0 ? 'gull' : 'swift',
    };

    dynamicObstacles.push(new DynamicObstacle('bird', birdStart, scene, world));
  }

  // Plane
  dynamicObstacles.push(
    new DynamicObstacle(
      'plane',
      {
        startDelay: 3.5,
        direction: Math.random() > 0.5 ? 1 : -1,
        altitude: 36 + Math.random() * 6,
        flightZ: -12,
      },
      scene,
      world
    )
  );

  targetMesh.visible = false;
  isTargetSet = false;
}

function initScenario(mode) {
  if (mode === 'A') {
    buildScenarioA();
  } else if (mode === 'B') {
    buildScenarioB();
  } else {
    buildScenarioC();
  }

  console.log(`Simulation scenario loaded: ${mode}`);
}

initScenario(SCENARIO_MODE);

/**
 * ============================================================
 * INPUT HANDLING
 * ============================================================
 */
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
    targetPos.y = event.altKey ? point.y + 0.1 : 7.0;

    targetMesh.position.set(targetPos.x, targetPos.y, targetPos.z);
    targetMesh.visible = true;
    isTargetSet = true;

    const placementType = event.altKey ? 'ground' : 'flight';
    console.log(
      `[Scenario ${SCENARIO_MODE}] Target: X=${targetPos.x.toFixed(1)}, ` +
      `Z=${targetPos.z.toFixed(1)}, Y=${targetPos.y.toFixed(1)} (${placementType})`
    );
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

/**
 * ============================================================
 * MAIN LOOP (Düzəldilmiş)
 * ============================================================
 */
const clock = new THREE.Clock();
let accumulator = 0;

async function animate() {
  requestAnimationFrame(animate);

  const delta = Math.min(clock.getDelta(), 0.1);
  accumulator += delta;

  controls.update();

  while (accumulator >= FIXED_TIME_STEP) {
    // 1. Fiziki dünyanı yenilə
    world.step(FIXED_TIME_STEP);

    // 2. Dinamik maneələri (maşın, quş, təyyarə) yenilə
    for (const dynObs of dynamicObstacles) {
      dynObs.update(FIXED_TIME_STEP);
    }

    // 3. Dronların beynini və hərəkətini yenilə
    for (const drone of drones) {
      // Əvvəlki vəziyyəti al (qərar vermək üçün)
      const oldState = drone.getState(targetPos, obstacleBodies, dynamicObstacles);
      
      // Dronun hərəkətini hesabla və icra et
      drone.update(
        FIXED_TIME_STEP,
        targetPos,
        isTargetSet,
        drones,
        obstacleBodies,
        dynamicObstacles
      );

      // Əgər hədəf qoyulubsa, öyrənmə prosesini və məlumat yığımını başlat
      if (isTargetSet) {
        const currentAction = drone.lastAction;
        const reward = drone.calculateReward(
          targetPos,
          drones,
          obstacleBodies,
          dynamicObstacles
        );

        // Neyron şəbəkəni məşq etdir
        await drone.trainStep(oldState, currentAction, reward);

        // --- DİPLOM ÜÇÜN MƏLUMAT YIĞIMI ---
        // Toqquşma baş veribmi? (DroneAgent.js-dəki metod)
        const isCollision = drone.checkCollision();
        // Hədəfə çatıbmı? (DroneAgent.js-dəki metod)
        const isSuccess = drone.checkSuccess(targetPos);
        
        // Məlumatları logger-ə yaz
        DataLogger.log(reward, isCollision, isSuccess);
      }
    }

    accumulator -= FIXED_TIME_STEP;
  }

  // Səhnəni render et
  renderer.render(scene, camera);
}


animate();

/**
 * ============================================================
 * RESIZE HANDLING
 * ============================================================
 */
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});