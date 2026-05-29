// DroneAgent.js
import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import * as tf from '@tensorflow/tfjs';

export class DroneAgent {
  constructor(id, startPos, bodyType, size, mass, color, scene, world, sensorConfig = { numRays: 8, maxDistance: 20 }) {
    this.id = id;
    this.scene = scene;
    this.sensorConfig = sensorConfig;

    // 1. Three.js Mesh Yaradılması (Vizual Gövdə)
    let geometry = (bodyType === 'box')
        ? new THREE.BoxGeometry(size, size, size)
        : new THREE.SphereGeometry(size / 2, 16, 16);
    let material = new THREE.MeshPhongMaterial({ color: color });
    this.mesh = new THREE.Mesh(geometry, material);
    scene.add(this.mesh);

    // 2. Cannon.js Fiziki Gövdə Yaradılması
    let shape = (bodyType === 'box')
        ? new CANNON.Box(new CANNON.Vec3(size / 2, size / 2, size / 2))
        : new CANNON.Sphere(size / 2);
    this.body = new CANNON.Body({ mass: mass });
    this.body.addShape(shape);
    this.body.position.set(startPos.x, startPos.y, startPos.z);
    
    // Sabitlik üçün sönümləmə (Dronun idarəsiz fırlanmasının qarşısını alır)
    this.body.angularDamping = 0.8;
    this.body.linearDamping = 0.5;
    world.addBody(this.body);

    // 3. TensorFlow.js Ağıllı MLP Modelinin Arxitekturası (Beyin)
    // Giriş (Input): Mövqe(3) + Sürət(3) + Sensor şüaları(8) = 14 Ölçülü Vektor
    const inputSize = 3 + 3 + this.sensorConfig.numRays; 
    const hiddenSize1 = 64;
    const hiddenSize2 = 32;
    const outputSize = 2; // Çıxış: [thrust (itələmə), rotation (Y oxu ətrafında dönmə)]

    this.model = tf.sequential();
    this.model.add(tf.layers.dense({ units: hiddenSize1, activation: 'relu', inputShape: [inputSize] }));
    this.model.add(tf.layers.dense({ units: hiddenSize2, activation: 'relu' }));
    this.model.add(tf.layers.dense({ units: outputSize, activation: 'tanh' })); // Çıxış [-1, 1] aralığında sıxılır

    // Optimizator (Adam Optimizer)
    this.optimizer = tf.train.adam(0.005);
    this.model.compile({
      optimizer: this.optimizer,
      loss: 'meanSquaredError'
    });

    // Sensor üçün Raycaster obyekti
    this.raycaster = new THREE.Raycaster();
  }

  // Cari Ətraf Mühit Vəziyyətinin (State Vector) Alınması
  getState() {
    const stateArray = [];

    // 1. Koordinat məlumatları (X, Y, Z)
    stateArray.push(this.body.position.x, this.body.position.y, this.body.position.z);

    // 2. Sürət məlumatları (Vx, Vy, Vz)
    stateArray.push(this.body.velocity.x, this.body.velocity.y, this.body.velocity.z);

    // 3. 360 dərəcəlik məsafə sensorları (Ray-casting)
    const rayDistances = [];
    for (let i = 0; i < this.sensorConfig.numRays; i++) {
      const angle = (i / this.sensorConfig.numRays) * 2 * Math.PI;
      const dir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
      
      this.raycaster.set(this.mesh.position, dir);
      
      // Səhnədəki digər obyektlərlə toqquşma kəsişmələrini tapır
      const intersects = this.raycaster.intersectObjects(this.scene.children, true);
      
      // Öz gövdəsi ilə kəsişmələri süzgəcdən keçirmək üçün yoxlama
      const validIntersects = intersects.filter(hit => hit.object !== this.mesh);
      
      const dist = validIntersects.length ? validIntersects[0].distance : this.sensorConfig.maxDistance;
      rayDistances.push(dist);
    }

    return stateArray.concat(rayDistances);
  }

  // Hər bir kadrda hərəkətin icra olunması və yenilənməsi
  update(dt) {
    // Şəbəkədən qərar al
    const currentState = this.getState();
    const stateTensor = tf.tensor2d([currentState], [1, currentState.length]);

    const actionTensor = this.model.predict(stateTensor);
    const action = actionTensor.dataSync(); // [thrust, rotation] dəyərlərini al

    // Yaddaş sızmasının qarşısını almaq üçün tensorları təmizlə
    stateTensor.dispose();
    actionTensor.dispose();

    // Qərara əsasən fiziki qüvvələrin tətbiqi
    // Thrust: Lokal Y oxuna şaquli qüvvə verilir (Maksimum 28 Nyuton)
    const up = new CANNON.Vec3(0, 1, 0);
    const thrustScale = (action[0] + 1) * 14.0; // [-1, 1] -> [0, 28] aralığına miqyaslanır
    this.body.applyLocalForce(up.scale(thrustScale), new CANNON.Vec3(0, 0, 0));

    // Rotation: Şaquli Y oxu ətrafında dönmə momenti (Torque)
    this.body.torque.y += action[1] * 2.5;

    // Fizika dünyasındakı koordinatları vizual Three.js mesh-inə köçür
    this.mesh.position.copy(this.body.position);
    this.mesh.quaternion.copy(this.body.quaternion);
  }

  // === DİPLOM İŞİ FƏSİL 2.4: MÜKAFAT FUNKSİYASI METODLARI ===

  goalReward(currentDistToGoal) {
    return currentDistToGoal < 1.2 ? 120 : (12 - currentDistToGoal);
  }

  collisionPenalty(minDistanceToObstacle) {
    return minDistanceToObstacle < 0.7 ? -150 : 0;
  }

  smoothnessReward(action) {
    return -(action[0] * action[0] + action[1] * action[1]);
  }

  formationReward(allDrones) {
    const idealDistance = 2.5; // Dronlar arası hədəflənən ideal məsafə
    let totalFormationPenalty = 0;
    let count = 0;

    allDrones.forEach(otherDrone => {
      if (otherDrone.id !== this.id) {
        const dist = this.body.position.distanceTo(otherDrone.body.position);
        totalFormationPenalty += Math.abs(dist - idealDistance);
        count++;
      }
    });

    return count > 0 ? -(totalFormationPenalty / count) : 0;
  }

  // R_total hesablanması
  calculateReward(targetPos, action, allDrones) {
    const currentDistToGoal = this.body.position.distanceTo(new CANNON.Vec3(targetPos.x, targetPos.y, targetPos.z));

    const sensorReadings = this.getState().slice(6);
    const minDistanceToObstacle = Math.min(...sensorReadings);

    const Rg = this.goalReward(currentDistToGoal);
    const Rc = this.collisionPenalty(minDistanceToObstacle);
    const Rs = this.smoothnessReward(action);
    const Rf = this.formationReward(allDrones);

    // Çəki əmsalları (Weights)
    const w1 = 1.5; // Goal
    const w2 = 2.5; // Collision (Ən yüksək prioritet - Təhlükəsizlik)
    const w3 = 0.2; // Smoothness
    const w4 = 1.0; // Formation (Grup koordinasiyası)

    return (w1 * Rg) + (w2 * Rc) + (w3 * Rs) + (w4 * Rf);
  }

  // DRL Təlim Addımı (Gradiyentlərin optimallaşdırılması)
  async trainStep(state, action, reward, nextState) {
    const x = tf.tensor2d([state], [1, state.length]);
    const yTrue = tf.tensor2d([action], [1, action.length]);

    this.optimizer.minimize(() => {
      const pred = this.model.predict(x);
      // Mükafat siqnalına əsasən itki (loss) funksiyasının korreksiyası
      const loss = pred.sub(yTrue).square().mean().mul(tf.scalar(-reward));
      return loss;
    });

    x.dispose();
    yTrue.dispose();
  }
}