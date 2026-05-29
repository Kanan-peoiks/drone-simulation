// DroneAgent.js
import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import * as tf from '@tensorflow/tfjs';

export class DroneAgent {
  constructor(id, startPos, color, scene, world) {
    this.id = id;
    this.scene = scene;
    this.lastAction = [0, 0, 0];

    // 1. THREE.JS REAL DRON MODELİ
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

    // 2. CANNON.JS FİZİKASI
    const shape = new CANNON.Box(new CANNON.Vec3(0.3, 0.1, 0.3));
    this.body = new CANNON.Body({ mass: 1.0 });
    this.body.addShape(shape);
    this.body.position.set(startPos.x, startPos.y, startPos.z);
    
    this.body.angularDamping = 0.99;
    this.body.linearDamping = 0.95; 
    world.addBody(this.body);

    // 3. TENSORFLOW.JS MODELİ
    const inputSize = 9; 
    this.model = tf.sequential();
    this.model.add(tf.layers.dense({ units: 32, activation: 'relu', inputShape: [inputSize] }));
    this.model.add(tf.layers.dense({ units: 16, activation: 'relu' }));
    this.model.add(tf.layers.dense({ units: 3, activation: 'tanh' }));

    this.optimizer = tf.train.adam(0.005);
    this.model.compile({ optimizer: this.optimizer, loss: 'meanSquaredError' });
  }

  getState(targetPos) {
    const dx = targetPos.x - this.body.position.x;
    const dy = targetPos.y - this.body.position.y;
    const dz = targetPos.z - this.body.position.z;

    return [
      this.body.position.x, this.body.position.y, this.body.position.z,
      this.body.velocity.x, this.body.velocity.y, this.body.velocity.z,
      dx, dy, dz
    ];
  }

  update(dt, targetPos, isTargetSet, allDrones = []) {
    const targetVec = new CANNON.Vec3(targetPos.x, targetPos.y, targetPos.z);
    const currentDistToGoal = this.body.position.distanceTo(targetVec);

    if (!isTargetSet) {
      // HOVER REJİMİ (Hədəf yoxdursa)
      const antiGravity = 1.0 * 9.82; 
      const brakeX = -this.body.velocity.x * 15;
      const brakeZ = -this.body.velocity.z * 15;
      const brakeY = -this.body.velocity.y * 10;
      this.body.force.set(brakeX, antiGravity + brakeY, brakeZ);
      this.body.velocity.set(this.body.velocity.x * 0.8, this.body.velocity.y * 0.8, this.body.velocity.z * 0.8);
      this.lastAction = [0, 0, 0];
      if (this.propellers) this.propellers.forEach(prop => { prop.rotation.y += 0.15; });
      return;
    }

    // Əgər hədəf varsa, digər dronun mövqeyinə əsasən optimal əks hədəf nöqtəsi (Desire Position) hesablayaq
    let desiredX = targetPos.x;
    let desiredZ = targetPos.z;
    const offsetDistance = 2.0; // Hədəfdən durulacaq ideal məsafə (radius)

    const otherDrone = allDrones.find(d => d.id !== this.id);
    
    if (otherDrone) {
      if (this.id === 'drone_0') {
        // Drone 0 (Mavi) üçün istiqamət: Narıncının hədəfə nəzərən tam əks nöqtəsi
        const dirToOther = new THREE.Vector3().subVectors(otherDrone.body.position, targetVec).setY(0);
        if (dirToOther.length() > 0.1) {
          dirToOther.normalize();
          // Tam əks istiqamətdə nöqtə təyin edirik
          desiredX = targetPos.x - dirToOther.x * offsetDistance;
          desiredZ = targetPos.z - dirToOther.z * offsetDistance;
        } else {
          desiredX = targetPos.x - offsetDistance;
          desiredZ = targetPos.z;
        }
      } else {
        // Drone 1 (Narıncı) birbaşa hədəfin müəyyən bir tərəfinə (məsələn, sağ tərəfə) nizamlanır
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

    // İndiki vəziyyətdən bizim riyazi hesabladığımız "üzbəüz ideal nöqtəyə" olan məsafə
    const distToDesired = Math.sqrt(Math.pow(desiredX - this.body.position.x, 2) + Math.pow(desiredZ - this.body.position.z, 2));
    const distToY = Math.abs(targetPos.y - this.body.position.y);

    // Əgər dron hədəf ətrafındakı öz KƏSİŞMƏ NÖQTƏSİNƏ tam çatıbsa, orada qıfıllansın
    if (distToDesired < 0.2 && distToY < 0.2) {
      const antiGravity = 1.0 * 9.82; 
      const brakeX = -this.body.velocity.x * 18;
      const brakeZ = -this.body.velocity.z * 18;
      const brakeY = -this.body.velocity.y * 12;

      this.body.force.set(brakeX, antiGravity + brakeY, brakeZ);
      this.body.velocity.set(this.body.velocity.x * 0.75, this.body.velocity.y * 0.75, this.body.velocity.z * 0.75);
      this.lastAction = [0, 0, 0];

      if (this.propellers) this.propellers.forEach(prop => { prop.rotation.y += 0.15; });
    } else {
      // HƏDƏFƏ VƏ ÜZBƏÜZ MÖVQEYƏ DOĞRU AKTİV SÜRƏTLƏNMƏ REJİMİ
      const currentState = this.getState(targetPos);
      const stateTensor = tf.tensor2d([currentState], [1, currentState.length]);
      const actionTensor = this.model.predict(stateTensor);
      const action = actionTensor.dataSync(); 

      stateTensor.dispose();
      actionTensor.dispose();

      this.lastAction = [action[0], action[1], action[2]];

      // Süni İntellekt çıxışını tam geometrik əks xəttə məcbur edirik
      const dx = desiredX - this.body.position.x;
      const dz = desiredZ - this.body.position.z;
      const dY = targetPos.y - this.body.position.y;
      const dist = Math.sqrt(dx*dx + dz*dz);

      let forceX = action[0] * 4;
      let forceZ = action[2] * 4;

      if (dist > 0.1) {
        forceX += (dx / dist) * 7; // Üzbəüz xəttə çəkmə qüvvəsi
        forceZ += (dz / dist) * 7;
      }

      const forceY = (action[1] + 1.0) * 10.2 + (dY * 3); 
      this.body.applyForce(new CANNON.Vec3(forceX, forceY, forceZ), this.body.position);

      if (this.propellers) {
        this.propellers.forEach((prop, index) => { prop.rotation.y += 0.8 + (index * 0.05); });
      }
    }

    // Vizual sinxronizasiya
    this.mesh.position.copy(this.body.position);
    this.mesh.quaternion.copy(this.body.quaternion);
  }

  calculateReward(targetPos, allDrones) {
    const currentDistToGoal = this.body.position.distanceTo(new CANNON.Vec3(targetPos.x, targetPos.y, targetPos.z));
    
    let Rg = 0; 
    let Rf = 0; 
    let Rc = 0; 

    if (currentDistToGoal < 2.2) {
      const speed = this.body.velocity.length();
      Rg = 400 - (speed * 60); 
    } else {
      Rg = -currentDistToGoal * 25; 
    }

    const otherDrone = allDrones.find(d => d.id !== this.id);
    if (otherDrone) {
      const distToOther = this.body.position.distanceTo(otherDrone.body.position);
      
      if (distToOther < 1.5) {
        Rc = -500; 
      }

      const v1 = new THREE.Vector3().subVectors(this.body.position, new CANNON.Vec3(targetPos.x, targetPos.y, targetPos.z)).setY(0).normalize();
      const v2 = new THREE.Vector3().subVectors(otherDrone.body.position, new CANNON.Vec3(targetPos.x, targetPos.y, targetPos.z)).setY(0).normalize();
      const dotProduct = v1.dot(v2); 

      if (dotProduct < -0.9) {
        Rf = 600; // Tam 180 dərəcəlik üzbəüzlük mükafatı maksimuma qaldırıldı
      } else {
        Rf = -dotProduct * 300; 
      }
    }

    return Rg + Rf + Rc;
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