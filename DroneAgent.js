// DroneAgent.js
import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import * as tf from '@tensorflow/tfjs';

export class DroneAgent {
  constructor(id, startPos, bodyType, size, mass, color, scene, world, sensorConfig = { numRays: 8, maxDistance: 20 }) {
    this.id = id;
    this.scene = scene;
    this.sensorConfig = sensorConfig;

    // 1. Three.js Mesh Yaradılması (Vizual)
    let geometry = (bodyType === 'box')
        ? new THREE.BoxGeometry(size, size, size)
        : new THREE.SphereGeometry(size / 2, 16, 16); // radius = size/2
    let material = new THREE.MeshPhongMaterial({ color });
    this.mesh = new THREE.Mesh(geometry, material);
    scene.add(this.mesh);

    // 2. Cannon.js Gövdə Yaradılması (Fizika)
    let shape = (bodyType === 'box')
        ? new CANNON.Box(new CANNON.Vec3(size / 2, size / 2, size / 2))
        : new CANNON.Sphere(size / 2);
    this.body = new CANNON.Body({ mass: mass });
    this.body.addShape(shape);
    this.body.position.set(startPos.x, startPos.y, startPos.z);
    
    // Sürtünmələri əlavə edək ki, havada idarəsiz fırlanmasınlar
    this.body.angularDamping = 0.7;
    this.body.linearDamping = 0.4;
    world.addBody(this.body);

    // 3. TensorFlow.js ilə MLP Modelinin Qurulması (Beyin)
    // Giriş: Mövqe(3) + Sürət(3) + Sensor şüaları(8) = 14
    const inputSize = 3 + 3 + this.sensorConfig.numRays; 
    const hiddenSize1 = 32;
    const hiddenSize2 = 16;
    const outputSize = 2; // [thrust, rotation]

    this.model = tf.sequential();
    this.model.add(tf.layers.dense({ units: hiddenSize1, activation: 'relu', inputShape: [inputSize] }));
    this.model.add(tf.layers.dense({ units: hiddenSize2, activation: 'relu' }));
    this.model.add(tf.layers.dense({ units: outputSize, activation: 'tanh' })); // Çıxış [-1, 1] aralığında olacaq

    // Təlim üçün optimizator (Bunu növbəti addımda istifadə edəcəyik)
    this.optimizer = tf.train.adam();
    this.model.compile({
      optimizer: this.optimizer,
      loss: 'meanSquaredError'
    });

    // Raycaster sensor obyekti
    this.raycaster = new THREE.Raycaster();
  }

  // Virtual sensorlardan və koordinatlardan cari "Vəziyyət Vektoru"nu (State) alırıq
  getState() {
    const stateArray = [];

    // 1. Dronun cari mövqeyi (X, Y, Z)
    stateArray.push(this.body.position.x, this.body.position.y, this.body.position.z);

    // 2. Dronun sürəti (Vx, Vy, Vz)
    stateArray.push(this.body.velocity.x, this.body.velocity.y, this.body.velocity.z);

    // 3. 360 dərəcəlik Ray-casting sensor məlumatları
    const rayDistances = [];
    for (let i = 0; i < this.sensorConfig.numRays; i++) {
      const angle = (i / this.sensorConfig.numRays) * 2 * Math.PI;
      // Şüanın yönü
      const dir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
      
      this.raycaster.set(this.mesh.position, dir);
      
      // Səhnədəki digər obyektlərlə kəsişməni yoxla (dron özünü vurmasın deyə bu mesh-i çıxmaq olar, indilik hamısını yoxlayır)
      const intersects = this.raycaster.intersectObjects(this.scene.children, true);
      
      // Əgər maneə varsa məsafəni yaz, yoxdursa maksimum görmə məsafəsini (20) qəbul et
      const dist = intersects.length ? intersects[0].distance : this.sensorConfig.maxDistance;
      rayDistances.push(dist);
    }

    // Sensor məlumatlarını dövlət vektoruna əlavə et
    return stateArray.concat(rayDistances);
  }

  // Hər kadrda dronun hərəkətini təyin edən yeniləmə metodu
  update(dt) {
    // 1. Cari vəziyyəti al və Tensor formasına sal
    const currentState = this.getState();
    const stateTensor = tf.tensor2d([currentState], [1, currentState.length]);

    // 2. Modeldən qərar (Action) çıxar: [thrust, rotation]
    const actionTensor = this.model.predict(stateTensor);
    const action = actionTensor.dataSync(); // Array formatına çevir

    // Tensorları yaddaşda yer tutmasın deyə təmizləyirik
    stateTensor.dispose();
    actionTensor.dispose();

    // 3. Qərara əsasən fiziki qüvvə tətbiq et
    // Thrust: Lokal Y (yuxarı) oxuna güc tətbiq et (Məsələn maksimum 25 Nyuton qüvvə)
    const up = new CANNON.Vec3(0, 1, 0);
    const thrustScale = (action[0] + 1) * 12.5; // [-1, 1] aralığını [0, 25] aralığına gətiririk ki, dron aşağı uçmasın, sadəcə thrust azalsın
    this.body.applyLocalForce(up.scale(thrustScale), new CANNON.Vec3(0, 0, 0));

    // Rotasiya: Y oxu ətrafında dönmə momentini tənzimlə (Zəhmət olmasa diqqət yetir, fırlanma üçün torque.y daha uyğundur)
    this.body.torque.y += action[1] * 2;

    // 4. Fizika nəticəsini vizual Mesh üzərinə köçür
    this.mesh.position.copy(this.body.position);
    this.mesh.quaternion.copy(this.body.quaternion);
  }

  // Təlim şablonu (Gələcəkdə mükafat funksiyası ilə işləyəcək)
  async trainStep(state, action, reward, nextState, done) {
    const stateTensor = tf.tensor2d([state], [1, state.length]);
    const nextStateTensor = tf.tensor2d([nextState], [1, nextState.length]);
    
    this.optimizer.minimize(() => {
       // Bu hissə Fəsil 2.4-də (Mükafat funksiyası inteqrasiyasında) yazılacaq
       // İndilik sadəcə şablon olaraq qalır
       return tf.scalar(0); 
    });

    stateTensor.dispose();
    nextStateTensor.dispose();
  }
}