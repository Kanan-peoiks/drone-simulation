// DroneAgent.js
import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import * as tf from '@tensorflow/tfjs';

export class DroneAgent {
  constructor(id, startPos, color, scene, world) {
    this.id = id;
    this.scene = scene;
    this.lastAction = [0, 0, 0];

    // 1. Ssenari A-dakı Orijinal Saf 3D Mühəndislik Modeli (Tam Qorunub)
    this.mesh = new THREE.Group();
    
    const coreGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.12, 8);
    const coreMat = new THREE.MeshPhongMaterial({ color: color, specular: 0x555555, shininess: 30 });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.rotation.x = Math.PI / 2;
    this.mesh.add(core);

    const armGeo = new THREE.BoxGeometry(0.9, 0.03, 0.03);
    const armMat = new THREE.MeshPhongMaterial({ color: 0x222222 });
    
    const arm1 = new THREE.Mesh(armGeo, armMat);
    arm1.rotation.y = Math.PI / 4;
    const arm2 = new THREE.Mesh(armGeo, armMat);
    arm2.rotation.y = -Math.PI / 4;
    this.mesh.add(arm1);
    this.mesh.add(arm2);

    const motorGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.06, 8);
    const motorMat = new THREE.MeshPhongMaterial({ color: 0x888888 });
    const propGeo = new THREE.BoxGeometry(0.45, 0.01, 0.04);
    const propMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });

    this.propellers = [];
    const radius = 0.32; 
    const positions = [
      { x: radius, z: radius }, { x: -radius, z: radius },
      { x: radius, z: -radius }, { x: -radius, z: -radius }
    ];

    positions.forEach(pos => {
      const motor = new THREE.Mesh(motorGeo, motorMat);
      motor.position.set(pos.x, 0.04, pos.z);
      this.mesh.add(motor);

      const prop = new THREE.Mesh(propGeo, propMat);
      prop.position.set(pos.x, 0.07, pos.z);
      this.mesh.add(prop);
      this.propellers.push(prop);
    });

    scene.add(this.mesh);

    // 2. Cannon.js Fiziki Gövdə Tənzimləmələri
    const shape = new CANNON.Box(new CANNON.Vec3(0.3, 0.1, 0.3));
    this.body = new CANNON.Body({ mass: 1.0 });
    this.body.addShape(shape);
    this.body.position.set(startPos.x, startPos.y, startPos.z);
    
    this.body.angularDamping = 0.99;
    this.body.linearDamping = 0.95; 
    world.addBody(this.body);

    // 3. SSENARİ B ÜÇÜN 12 GİRİŞLİ NEURAL NETWORK (Giriş Ölçüsü Genişləndirildi)
    const inputSize = 12; 
    this.model = tf.sequential();
    this.model.add(tf.layers.dense({ units: 48, activation: 'relu', inputShape: [inputSize] }));
    this.model.add(tf.layers.dense({ units: 24, activation: 'relu' }));
    this.model.add(tf.layers.dense({ units: 3, activation: 'tanh' }));

    this.optimizer = tf.train.adam(0.004);
    this.model.compile({ optimizer: this.optimizer, loss: 'meanSquaredError' });
  }

  // Yenilənmiş Dövlət Metodu: Ən yaxın binanı və ona olan məsafəni hesablayan sensor
  getState(targetPos, obstacles = []) {
    const dx = targetPos.x - this.body.position.x;
    const dy = targetPos.y - this.body.position.y;
    const dz = targetPos.z - this.body.position.z;

    // Ən yaxın binanı tapmaq üçün skan alqoritmi
    let closestObs = null;
    let minDist = 9999;
    obstacles.forEach(obs => {
      const dist = this.body.position.distanceTo(obs.position);
      if (dist < minDist) {
        minDist = dist;
        closestObs = obs;
      }
    });

    // Nisbi koordinat fərqləri (Sensor çıxışları)
    const obsDx = closestObs ? closestObs.position.x - this.body.position.x : 0;
    const obsDy = closestObs ? closestObs.position.y - this.body.position.y : 0;
    const obsDz = closestObs ? closestObs.position.z - this.body.position.z : 0;

    return [
      this.body.position.x, this.body.position.y, this.body.position.z,
      this.body.velocity.x, this.body.velocity.y, this.body.velocity.z,
      dx, dy, dz,
      obsDx, obsDy, obsDz // Son 3 Yeni komponent (Sensor məlumatları)
    ];
  }

  update(dt, targetPos, isTargetSet, allDrones = [], obstacles = []) {
    const targetVec = new CANNON.Vec3(targetPos.x, targetPos.y, targetPos.z);

    if (!isTargetSet) {
      // HOVER REJİMİ (Hədəf seçilməyibsə mövqeyi saxla)
      const antiGravity = 1.0 * 9.82; 
      const brakeX = -this.body.velocity.x * 15;
      const brakeZ = -this.body.velocity.z * 15;
      const brakeY = -this.body.velocity.y * 10;
      this.body.force.set(brakeX, antiGravity + brakeY, brakeZ);
      this.body.velocity.set(this.body.velocity.x * 0.8, this.body.velocity.y * 0.8, this.body.velocity.z * 0.8);
      this.lastAction = [0, 0, 0];
      if (this.propellers) this.propellers.forEach(prop => { prop.rotation.y += 0.15; });
      this.mesh.position.copy(this.body.position);
      this.mesh.quaternion.copy(this.body.quaternion);
      return;
    }

    // Orijinal Formasiya və 180 dərəbəlik üzbəüz nizamlanma koordinat hesablanması
    let desiredX = targetPos.x;
    let desiredZ = targetPos.z;
    const offsetDistance = 2.0; 

    const otherDrone = allDrones.find(d => d.id !== this.id);
    if (otherDrone) {
      if (this.id === 'drone_0') {
        const dirToOther = new THREE.Vector3().subVectors(otherDrone.body.position, targetVec).setY(0);
        if (dirToOther.length() > 0.1) {
          dirToOther.normalize();
          desiredX = targetPos.x - dirToOther.x * offsetDistance;
          desiredZ = targetPos.z - dirToOther.z * offsetDistance;
        } else {
          desiredX = targetPos.x - offsetDistance;
          desiredZ = targetPos.z;
        }
      } else {
        const dirToOther = new THREE.Vector3().subVectors(this.body.position, targetVec).setY(0);
        if (dirToOther.length() > 0.1) {
          dirToOther.normalize();
          desiredX = targetPos.x + dirToOther.x * offsetDistance;
          desiredZ = targetPos.z + dirToOther.z * offsetDistance;
        } else {
          desiredX = targetPos.x + offsetDistance;
          desiredZ = targetPos.z;
        }
      }
    }

    const distToDesired = Math.sqrt(Math.pow(desiredX - this.body.position.x, 2) + Math.pow(desiredZ - this.body.position.z, 2));
    const distToY = Math.abs(targetPos.y - this.body.position.y);

    if (distToDesired < 0.2 && distToY < 0.2) {
      // Hədəf nöqtədə stabilləşmə (Əyləcləmə)
      const antiGravity = 1.0 * 9.82; 
      const brakeX = -this.body.velocity.x * 18;
      const brakeZ = -this.body.velocity.z * 18;
      const brakeY = -this.body.velocity.y * 12;

      this.body.force.set(brakeX, antiGravity + brakeY, brakeZ);
      this.body.velocity.set(this.body.velocity.x * 0.75, this.body.velocity.y * 0.75, this.body.velocity.z * 0.75);
      this.lastAction = [0, 0, 0];
      if (this.propellers) this.propellers.forEach(prop => { prop.rotation.y += 0.15; });
    } else {
      // 12 Girişli şəbəkədən proqnozun alınması
      const currentState = this.getState(targetPos, obstacles);
      const stateTensor = tf.tensor2d([currentState], [1, currentState.length]);
      const actionTensor = this.model.predict(stateTensor);
      const action = actionTensor.dataSync(); 

      stateTensor.dispose();
      actionTensor.dispose();

      this.lastAction = [action[0], action[1], action[2]];

      // POTENSİAL SAHƏLƏR METODU (Maneə İtələmə Mexanizmi)
      let avoidForceX = 0;
      let avoidForceZ = 0;
      let avoidForceY = 0;

      obstacles.forEach(obs => {
        const dist = this.body.position.distanceTo(obs.position);
        if (dist < 3.5) { // 3.5 metrdən etibarən binanı hiss et və qaç
          const forceMagnitude = (3.5 - dist) * 12.0;
          // Binadan kənara doğru itələmə vektoru
          avoidForceX += ((this.body.position.x - obs.position.x) / dist) * forceMagnitude;
          avoidForceZ += ((this.body.position.z - obs.position.z) / dist) * forceMagnitude;
          // Əgər bina çox hündürdürsə, dron yuxarıya doğru da manevr edə bilsin
          if (this.body.position.y < obs.position.y + 2) {
            avoidForceY += forceMagnitude * 1.5;
          }
        }
      });

      const dx = desiredX - this.body.position.x;
      const dz = desiredZ - this.body.position.z;
      const dY = targetPos.y - this.body.position.y;
      const dist = Math.sqrt(dx*dx + dz*dz);

      let forceX = action[0] * 4 + avoidForceX;
      let forceZ = action[2] * 4 + avoidForceZ;

      if (dist > 0.1) {
        forceX += (dx / dist) * 7; 
        forceZ += (dz / dist) * 7;
      }

      const forceY = (action[1] + 1.0) * 10.2 + (dY * 3) + avoidForceY; 
      this.body.applyForce(new CANNON.Vec3(forceX, forceY, forceZ), this.body.position);

      if (this.propellers) {
        this.propellers.forEach((prop, index) => { prop.rotation.y += 0.8 + (index * 0.05); });
      }
    }

    this.mesh.position.copy(this.body.position);
    this.mesh.quaternion.copy(this.body.quaternion);
  }

  // Toqquşmadan yayınma və Bina Cəriməsi ilə zənginləşdirilmiş Mükafat Funksiyası
  calculateReward(targetPos, allDrones, obstacles = []) {
    const currentDistToGoal = this.body.position.distanceTo(new CANNON.Vec3(targetPos.x, targetPos.y, targetPos.z));
    
    let Rg = 0; 
    let Rf = 0; 
    let Rc = 0; 
    let Ro = 0; // Ssenari B-nin Bina Cəriməsi

    // Hədəf mükafatı
    if (currentDistToGoal < 2.2) {
      const speed = this.body.velocity.length();
      Rg = 400 - (speed * 60); 
    } else {
      Rg = -currentDistToGoal * 25; 
    }

    // BİNALARA TOQQUŞMA CƏRİMƏSİ (Məqsəd 3)
    obstacles.forEach(obs => {
      const dist = this.body.position.distanceTo(obs.position);
      if (dist < 1.8) {
        Ro -= 900; // Sərt cərimə modelə binalardan yayınmağı mükəmməl öyrədir
      }
    });

    // Dronların bir-birinə dəymə cəriməsi
    const otherDrone = allDrones.find(d => d.id !== this.id);
    if (otherDrone) {
      const distToOther = this.body.position.distanceTo(otherDrone.body.position);
      if (distToOther < 1.5) Rc = -500; 

      const v1 = new THREE.Vector3().subVectors(this.body.position, new CANNON.Vec3(targetPos.x, targetPos.y, targetPos.z)).setY(0).normalize();
      const v2 = new THREE.Vector3().subVectors(otherDrone.body.position, new CANNON.Vec3(targetPos.x, targetPos.y, targetPos.z)).setY(0).normalize();
      const dotProduct = v1.dot(v2); 

      if (dotProduct < -0.9) {
        Rf = 600; // 180 dərəbəlik üzbəüz qruplaşma mükafatı
      } else {
        Rf = -dotProduct * 300; 
      }
    }

    return Rg + Rf + Rc + Ro;
  }

  async trainStep(state, action, reward) {
    const x = tf.tensor2d([state], [1, state.length]);
    const targetAction = action.map(a => a * (reward > 0 ? 1.02 : 0.98)); 
    const yTrue = tf.tensor2d([targetAction], [1, action.length]);

    this.optimizer.minimize(() => {
      const pred = this.model.predict(x);
      return tf.losses.meanSquaredError(yTrue, pred);
    });

    x.dispose();
    yTrue.dispose();
  }
}