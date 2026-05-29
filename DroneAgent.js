// DroneAgent.js
import * as CANNON from 'cannon-es';
import * as THREE from 'three';

export class DroneAgent {
  /**
   * @param {THREE.Scene} scene - Three.js səhnəsi
   * @param {CANNON.World} world - Cannon.js fizika dünyası
   * @param {Object} options - Dronun konfiqurasiyası
   *   shape: 'box' | 'sphere'            // Gövdənin növü
   *   size: Number                      // Ölçü vahidi (metr cinsindən)
   *   mass: Number                      // Kütlə (kg)
   *   color: 0x____                     // Mesh rəngi (hex)
   */
  constructor(scene, world, options = {}) {
    const { shape = 'box', size = 1, mass = 1, color = 0x00ff00 } = options;

    // Fizika gövdəsinin forması və Cannon.Shape yaradılması:
    if (shape === 'box') {
      // Kutu forması: ölçülərin yarısı (halfExtents) tələb olunur:
      const halfExtents = new CANNON.Vec3(size/2, size/2, size/2);
      const boxShape = new CANNON.Box(halfExtents);
      this.body = new CANNON.Body({ mass: mass });
      this.body.addShape(boxShape);
      // Mesh: Three.js-də uyğun ölçülü qutu geometrisi:
      const geometry = new THREE.BoxGeometry(size, size, size);
      const material = new THREE.MeshLambertMaterial({ color: color });
      this.mesh = new THREE.Mesh(geometry, material);
    } else if (shape === 'sphere') {
      // Sfera forması: radius (size/2 kimi götürək):
      const radius = size/2;
      const sphereShape = new CANNON.Sphere(radius);
      this.body = new CANNON.Body({ mass: mass });
      this.body.addShape(sphereShape);
      // Mesh: Three.js sfera
      const geometry = new THREE.SphereGeometry(radius, 16, 16);
      const material = new THREE.MeshLambertMaterial({ color: color });
      this.mesh = new THREE.Mesh(geometry, material);
    }

    // Başlanğıc mövqe (fərziyyə): dronları bir qədər aralayırıq
    this.body.position.set(Math.random()*2, 1 + Math.random()*0.5, Math.random()*2);
    // Dəyişənlərin başlanğıc dəyərləri:
    this.body.angularDamping = 0.5;  // açısal sönüm
    this.body.linearDamping = 0.2;   // xətlə sönüm

    // World və scene obyektlərinə əlavə:
    world.addBody(this.body);
    scene.add(this.mesh);
  }

  /** Fizika addımından sonra mesh transformunu güncəlləyir */
  update(deltaTime) {
    // (Məsələn, burada sabit thrust və yaw tətbiq oluna bilər)
    // *** Qeyd: Faktiki uçuş idarəsi bu misalda optimallaşdırılmayıb *** 

    // İtələmə qüvvəsi nümunəsi (məsələn, hər zaman yuxarı doğru sabit thrust):
    // const thrustForce = 10;
    // this.body.applyLocalForce(new CANNON.Vec3(0, thrustForce, 0), new CANNON.Vec3(0,0,0));

    // Mesh-in mövqeyini və rotasiyasını bədənlə sinxronlaşdır:
    this.mesh.position.copy(this.body.position);
    this.mesh.quaternion.copy(this.body.quaternion);
  }
}
