// Port Solano — the city itself.
// Builds the whole open world from one seed: ground with painted roads,
// instanced buildings per district, palms, streetlights, containers and
// landmarks (Solano Tower, stadium, pier, cranes, plaza). Exports the
// collision boxes and helpers the cars, player and police share.
import * as THREE from 'three';
import { WORLD, DISTRICTS, LANDMARKS, PALETTE, districtAt } from './config.js';
import { makeRng } from './rng.js';

const BLOCK_CENTERS = [];
for (let i = 0; i < 9; i += 1) BLOCK_CENTERS.push(-192 + 48 * i);

function groundTexture(rng) {
  const S = 2048;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d');
  const toPx = (v) => ((v + 240) / 480) * S;
  const px = (v) => (v / 480) * S;

  // Base: dry grass.
  g.fillStyle = '#9aa578';
  g.fillRect(0, 0, S, S);
  // Beach sand along the bay.
  g.fillStyle = '#e8d29a';
  g.fillRect(0, toPx(204), S, S - toPx(204));
  // The bay.
  g.fillStyle = '#2e7f9e';
  g.fillRect(0, toPx(216), S, S - toPx(216));
  g.fillStyle = '#3a90ad';
  for (let i = 0; i < 40; i += 1) {
    g.fillRect(rng.range(0, S), toPx(220 + rng.range(0, 18)), rng.range(30, 120), 3);
  }
  // Parks: two green blocks.
  g.fillStyle = '#7d9b5e';
  g.fillRect(toPx(-192), toPx(-96), px(36), px(36));
  g.fillRect(toPx(96), toPx(96), px(36), px(36));
  // Sidewalks: light border around every block.
  g.fillStyle = '#b9b3a4';
  for (const bx of BLOCK_CENTERS) {
    for (const bz of BLOCK_CENTERS) {
      g.fillRect(toPx(bx - 19), toPx(bz - 19), px(38), px(38));
    }
  }
  // Asphalt roads between the blocks.
  g.fillStyle = '#3a3d42';
  for (const line of [-216, -168, -120, -72, -24, 24, 72, 120, 168, 216]) {
    g.fillRect(0, toPx(line - 6), S, px(12));
    g.fillRect(toPx(line - 6), 0, px(12), S);
  }
  // Lane dashes.
  g.fillStyle = '#d8c95a';
  for (const line of [-216, -168, -120, -72, -24, 24, 72, 120, 168, 216]) {
    for (let d = -228; d < 240; d += 24) {
      g.fillRect(toPx(d), toPx(line - 0.6), px(10), px(1.2));
      g.fillRect(toPx(line - 0.6), toPx(d), px(1.2), px(10));
    }
  }
  // Civic Plaza: paved circle.
  g.fillStyle = '#c9bfa8';
  g.beginPath();
  g.arc(toPx(48), toPx(48), px(17), 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#4a90b8';
  g.beginPath();
  g.arc(toPx(48), toPx(48), px(5), 0, Math.PI * 2);
  g.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function facadeTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#d8d2c4';
  g.fillRect(0, 0, 128, 256);
  // Window grid.
  for (let y = 12; y < 244; y += 24) {
    for (let x = 10; x < 118; x += 22) {
      const lit = Math.random() < 0.25;
      g.fillStyle = lit ? '#ffe9a8' : '#4a6a80';
      g.fillRect(x, y, 14, 16);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildCity(scene, seed = 1337) {
  const rng = makeRng(seed);
  const colliders = []; // {x0, z0, x1, z1}
  const updaters = [];

  // --- Lights and sky -------------------------------------------------
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(0x9ec7de, 260, 620);
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe3b3, 2.2);
  sun.position.set(180, 220, 120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -260; sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260; sun.shadow.camera.bottom = -260;
  sun.shadow.camera.far = 700;
  scene.add(sun);

  // --- Ground ----------------------------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.size, WORLD.size),
    new THREE.MeshLambertMaterial({ map: groundTexture(rng) }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Animated bay shimmer over the painted water.
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(480, 24),
    new THREE.MeshPhongMaterial({ color: 0x2e7f9e, transparent: true, opacity: 0.35, shininess: 120 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.08, 228);
  scene.add(water);
  updaters.push((t) => { water.material.opacity = 0.3 + Math.sin(t * 0.7) * 0.08; });

  // --- Buildings (one instanced mesh, per-instance colour) -------------
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  boxGeo.translate(0, 0.5, 0);
  const facade = facadeTexture();
  const buildingMat = new THREE.MeshLambertMaterial({ map: facade });
  const placements = [];
  const towerColors = [0xd8d2c4, 0xc4ccd8, 0xe0cfa8, 0xb8c4c8, 0xd8b8a0];
  const houseColors = [0xe8dcc0, 0xd8a878, 0xc8d8e0, 0xe0b8b0, 0xf0e8d8, 0xc8b898];

  function addBuilding(cx, cz, w, d, h, color) {
    placements.push({ cx, cz, w, d, h, color });
    colliders.push({ x0: cx - w / 2, z0: cz - d / 2, x1: cx + w / 2, z1: cz + d / 2 });
  }

  for (const bx of BLOCK_CENTERS) {
    for (const bz of BLOCK_CENTERS) {
      const district = districtAt(bx, bz);
      // The plaza block stays open; the tower block holds Solano Tower.
      if (bx === 48 && bz === 48) continue;
      if (bx === 0 && bz === 0) continue;
      if (bx === -168 && bz === 48) continue; // stadium block
      if (district.style === 'tower') {
        const h = rng.range(district.height[0], district.height[1]);
        addBuilding(bx, bz, rng.range(20, 26), rng.range(20, 26), h, rng.pick(towerColors));
        if (rng.chance(0.4)) {
          addBuilding(bx + 10, bz - 10, 10, 10, rng.range(12, 20), rng.pick(towerColors));
        }
      } else if (district.style === 'oldtown') {
        for (let k = 0; k < 4; k += 1) {
          const ox = (k % 2 === 0 ? -9 : 9);
          const oz = (k < 2 ? -9 : 9);
          addBuilding(bx + ox, bz + oz, rng.range(11, 14), rng.range(11, 14),
            rng.range(district.height[0], district.height[1]), rng.pick(houseColors));
        }
      } else if (district.style === 'villa') {
        addBuilding(bx - 8, bz, rng.range(12, 16), rng.range(10, 14), rng.range(7, 12), rng.pick(houseColors));
        addBuilding(bx + 9, bz + 6, rng.range(10, 13), rng.range(9, 12), rng.range(7, 14), rng.pick(houseColors));
      } else if (district.style === 'marina') {
        addBuilding(bx - 8, bz - 6, rng.range(13, 17), rng.range(12, 15), rng.range(10, 20), rng.pick(towerColors));
        addBuilding(bx + 9, bz + 7, rng.range(12, 15), rng.range(11, 14), rng.range(12, 26), rng.pick(towerColors));
      } else if (district.style === 'beach') {
        addBuilding(bx, bz - 6, rng.range(14, 18), rng.range(12, 15), rng.range(8, 16), rng.pick(houseColors));
      } else if (district.style === 'port') {
        // Warehouses only on the block edges; the middle stays drivable.
        addBuilding(bx - 12, bz, rng.range(10, 12), rng.range(20, 26), rng.range(6, 10), 0x9aa0a8);
      }
    }
  }

  const buildings = new THREE.InstancedMesh(boxGeo, buildingMat, placements.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v3 = new THREE.Vector3();
  const s3 = new THREE.Vector3();
  const col = new THREE.Color();
  placements.forEach((p, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0);
    m4.compose(v3.set(p.cx, 0, p.cz), q, s3.set(p.w, p.h, p.d));
    buildings.setMatrixAt(i, m4);
    buildings.setColorAt(i, col.setHex(p.color));
  });
  buildings.castShadow = true;
  buildings.receiveShadow = true;
  scene.add(buildings);

  // --- Solano Tower (landmark) -----------------------------------------
  const tower = new THREE.Group();
  const towerMat = new THREE.MeshLambertMaterial({ map: facade, color: 0xe8e0cc });
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(26, 118, 26), towerMat);
  shaft.position.y = 59;
  shaft.castShadow = true;
  tower.add(shaft);
  const crown = new THREE.Mesh(
    new THREE.BoxGeometry(30, 6, 30),
    new THREE.MeshLambertMaterial({ color: 0x2a4a6a, emissive: 0x224466 }),
  );
  crown.position.y = 121;
  tower.add(crown);
  const spire = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 1.2, 18, 8),
    new THREE.MeshLambertMaterial({ color: 0x888888 }),
  );
  spire.position.y = 132;
  tower.add(spire);
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(1.2, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff4444 }),
  );
  beacon.position.y = 141;
  tower.add(beacon);
  tower.position.set(0, 0, 0);
  scene.add(tower);
  colliders.push({ x0: -14, z0: -14, x1: 14, z1: 14 });
  updaters.push((t) => { beacon.material.color.setHex(Math.sin(t * 3) > 0 ? 0xff4444 : 0x881111); });

  // --- Harbor Stadium ----------------------------------------------------
  const stadium = new THREE.Group();
  const bowl = new THREE.Mesh(
    new THREE.CylinderGeometry(20, 22, 10, 24, 1, true),
    new THREE.MeshLambertMaterial({ color: 0xd8d0c0, side: THREE.DoubleSide }),
  );
  bowl.position.y = 5;
  bowl.castShadow = true;
  stadium.add(bowl);
  const field = new THREE.Mesh(
    new THREE.CircleGeometry(17, 24),
    new THREE.MeshLambertMaterial({ color: 0x4a8a4a }),
  );
  field.rotation.x = -Math.PI / 2;
  field.position.y = 0.15;
  stadium.add(field);
  stadium.position.set(-168, 0, 48);
  scene.add(stadium);
  colliders.push({ x0: -190, z0: 26, x1: -146, z1: 70 });

  // --- Sunset Pier -------------------------------------------------------
  const pier = new THREE.Group();
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(10, 1, 34),
    new THREE.MeshLambertMaterial({ color: 0x8a6a48 }),
  );
  deck.position.set(0, 1, 17);
  deck.castShadow = true;
  pier.add(deck);
  for (let i = 0; i < 5; i += 1) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.4, 3, 6),
      new THREE.MeshLambertMaterial({ color: 0x5a4a38 }),
    );
    post.position.set(i % 2 === 0 ? -4 : 4, 0.5, 4 + i * 6);
    pier.add(post);
  }
  const light = new THREE.Mesh(
    new THREE.SphereGeometry(1.4, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xfff2c8 }),
  );
  light.position.set(0, 8, 33);
  pier.add(light);
  const lampPost = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.25, 8, 6),
    new THREE.MeshLambertMaterial({ color: 0x444444 }),
  );
  lampPost.position.set(0, 4, 33);
  pier.add(lampPost);
  pier.position.set(-120, 0, 208);
  scene.add(pier);
  colliders.push({ x0: -126, z0: 206, x1: -114, z1: 242 });

  // --- Port cranes ---------------------------------------------------------
  const craneMat = new THREE.MeshLambertMaterial({ color: 0xd8a03a });
  for (const [cx, cz] of [[168, 24], [192, 72], [144, 120]]) {
    const crane = new THREE.Group();
    const legA = new THREE.Mesh(new THREE.BoxGeometry(2, 26, 2), craneMat);
    legA.position.set(-6, 13, 0);
    const legB = new THREE.Mesh(new THREE.BoxGeometry(2, 26, 2), craneMat);
    legB.position.set(6, 13, 0);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(30, 2, 2), craneMat);
    beam.position.set(4, 26, 0);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(5, 4, 4), craneMat);
    cab.position.set(0, 24, 0);
    crane.add(legA, legB, beam, cab);
    crane.position.set(cx, 0, cz);
    scene.add(crane);
    colliders.push({ x0: cx - 8, z0: cz - 2, x1: cx + 8, z1: cz + 2 });
  }

  // --- Shipping containers (instanced) ------------------------------------
  const containerGeo = new THREE.BoxGeometry(6, 2.6, 2.6);
  const containerMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const containerSpots = [];
  for (const bx of [96, 144, 192]) {
    for (const bz of [0, 48, 96, 120]) {
      if (rng.chance(0.75)) containerSpots.push([bx + rng.range(-10, 10), bz + rng.range(-12, 12), rng.pick([0, Math.PI / 2])]);
    }
  }
  const containers = new THREE.InstancedMesh(containerGeo, containerMat, containerSpots.length);
  const cColors = [0xb8442a, 0x2a6ab8, 0x3a8a4a, 0xd8a03a, 0x7a4a8a];
  containerSpots.forEach(([x, z, rot], i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
    m4.compose(v3.set(x, 1.3, z), q, s3.set(1, 1, 1));
    containers.setMatrixAt(i, m4);
    containers.setColorAt(i, col.setHex(rng.pick(cColors)));
    colliders.push({ x0: x - 3.2, z0: z - 1.6, x1: x + 3.2, z1: z + 1.6 });
  });
  containers.castShadow = true;
  scene.add(containers);

  // --- Palms (instanced trunks + fronds) -----------------------------------
  const palmSpots = [];
  for (let i = 0; i < 130; i += 1) {
    const x = rng.range(-228, 228);
    const z = rng.range(-228, 210);
    const d = districtAt(x, z);
    if (d.style === 'marina' || d.style === 'beach' || rng.chance(0.25)) palmSpots.push([x, z]);
  }
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 6, 6);
  trunkGeo.translate(0, 3, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x8a6a48 }), palmSpots.length);
  const frondGeo = new THREE.ConeGeometry(2.6, 3.2, 7);
  frondGeo.translate(0, 7.2, 0);
  const fronds = new THREE.InstancedMesh(frondGeo, new THREE.MeshLambertMaterial({ color: 0x3a7a3a }), palmSpots.length);
  palmSpots.forEach(([x, z], i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.range(0, Math.PI * 2));
    m4.compose(v3.set(x, 0, z), q, s3.set(1, rng.range(0.8, 1.3), 1));
    trunks.setMatrixAt(i, m4);
    fronds.setMatrixAt(i, m4);
  });
  trunks.castShadow = true;
  scene.add(trunks, fronds);

  // --- Streetlights (instanced) --------------------------------------------
  const lampSpots = [];
  for (const line of [-216, -168, -120, -72, -24, 24, 72, 120, 168, 216]) {
    for (let d = -216; d <= 216; d += 48) {
      lampSpots.push([line + 7, d]);
      lampSpots.push([d, line + 7]);
    }
  }
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 7, 6);
  poleGeo.translate(0, 3.5, 0);
  const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ color: 0x3a3d42 }), lampSpots.length);
  lampSpots.forEach(([x, z], i) => {
    m4.compose(v3.set(x, 0, z), q.identity(), s3.set(1, 1, 1));
    poles.setMatrixAt(i, m4);
  });
  scene.add(poles);

  // --- Clouds ----------------------------------------------------------------
  // Clouds: unlit white puffs, so they read as clouds from below.
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
  const clouds = [];
  for (let i = 0; i < 10; i += 1) {
    const cloud = new THREE.Group();
    for (let k = 0; k < 3; k += 1) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(rng.range(6, 12), 8, 8), cloudMat);
      puff.position.set(k * rng.range(6, 10) - 8, rng.range(-1, 1), rng.range(-3, 3));
      puff.scale.y = 0.45;
      cloud.add(puff);
    }
    cloud.position.set(rng.range(-300, 300), rng.range(90, 140), rng.range(-300, 300));
    scene.add(cloud);
    clouds.push(cloud);
  }
  updaters.push((t, dt) => {
    for (const c of clouds) {
      c.position.x += dt * 1.2;
      if (c.position.x > 320) c.position.x = -320;
    }
  });

  // --- Collision + helpers ---------------------------------------------------
  function collideCircle(x, z, r) {
    for (const b of colliders) {
      const cx = Math.max(b.x0, Math.min(x, b.x1));
      const cz = Math.max(b.z0, Math.min(z, b.z1));
      const dx = x - cx, dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 < 1e-6) return { x: b.x1 + r, z };
        const d = Math.sqrt(d2);
        const push = (r - d) / d;
        x += dx * push;
        z += dz * push;
      }
    }
    return { x, z };
  }

  function isWater(x, z) {
    return z > 216;
  }

  function clampToCity(x, z, margin = 4) {
    return {
      x: Math.max(-WORLD.half + margin, Math.min(WORLD.half - margin, x)),
      z: Math.max(-WORLD.half + margin, Math.min(WORLD.half - margin, z)),
    };
  }

  return {
    colliders,
    collideCircle,
    isWater,
    clampToCity,
    buildingCount: placements.length,
    update(t, dt) { for (const u of updaters) u(t, dt); },
  };
}
