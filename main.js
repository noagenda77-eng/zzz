const GAME = {
    PLAYER_HEIGHT: 1.7, PLAYER_RADIUS: 0.4, WALK_SPEED: 5, SPRINT_SPEED: 9,
    PLAYER_MAX_HEALTH: 100, PLAYER_HEALTH_REGEN_DELAY: 5000, PLAYER_HEALTH_REGEN_RATE: 10,
    MOUSE_SENSITIVITY: 0.002, DEFAULT_FOV: 75, ADS_FOV: 45, FOV_LERP_SPEED: 12,
    FIRE_RATE: 0.1, DAMAGE: 25, MAX_AMMO: 30, RESERVE_AMMO: 90, RELOAD_TIME: 2.0, WEAPON_RANGE: 100,
    GRENADE_COUNT: 4, GRENADE_THROW_FORCE: 18, GRENADE_ARC_GRAVITY: 15, GRENADE_FUSE_TIME: 3.0,
    GRENADE_EXPLOSION_RADIUS: 6, GRENADE_DAMAGE: 100,
    ENEMY_SPEED: 2.5, ENEMY_HEALTH: 100, ENEMY_DAMAGE: 20, ENEMY_ATTACK_COOLDOWN: 1.0,
    ENEMY_SPAWN_DISTANCE: 25, ENEMY_COUNT: 8, ARENA_SIZE: 50, CAVE_HEIGHT: 20
};

const COLORS = {
    CAVE_ROCK: 0x5c4033, CAVE_ROCK_LIGHT: 0x8b7355, CAVE_ROCK_DARK: 0x3d2817,
    WOOD_DARK: 0x3e2723, WOOD_MEDIUM: 0x5d4037, WOOD_LIGHT: 0x795548,
    WOOD_WEATHERED: 0x4a4a48, GROUND_DIRT: 0x3d2b1f,
    LANTERN_WARM: 0xff9944, LANTERN_ORANGE: 0xff6622, WINDOW_GLOW: 0xffaa55,
    FOG_COLOR: 0x1a1008
};

const state = { isPointerLocked: false, isDead: false, enemies: [], grenades: [], explosions: [] };

// Three.js setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(COLORS.FOG_COLOR);
scene.fog = new THREE.FogExp2(COLORS.FOG_COLOR, 0.008);

const camera = new THREE.PerspectiveCamera(GAME.DEFAULT_FOV, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.y = GAME.PLAYER_HEIGHT;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
document.body.appendChild(renderer.domElement);

// Lighting
function setupLighting() {
    scene.add(new THREE.AmbientLight(0x3a251a, 1.1));

    // Volumetric light from cave opening
    const caveLight = new THREE.SpotLight(0xfff2e0, 3.4, 90, Math.PI / 4, 0.45);
    caveLight.position.set(-15, GAME.CAVE_HEIGHT - 2, 10);
    caveLight.target.position.set(0, 0, 0);
    caveLight.castShadow = true;
    caveLight.shadow.mapSize.set(1024, 1024);
    scene.add(caveLight);
    scene.add(caveLight.target);

    // Lantern lights around the map
    const lanterns = [
        { x: 10, y: 3.5, z: 5 }, { x: -8, y: 3, z: 8 }, { x: 12, y: 4, z: -10 },
        { x: -12, y: 3.5, z: -8 }, { x: 0, y: 3, z: 15 }, { x: -15, y: 3, z: 0 },
        { x: 18, y: 3.5, z: -5 }, { x: -5, y: 3, z: -18 }, { x: 8, y: 4, z: -20 },
        { x: -18, y: 3, z: 12 }
    ];

    lanterns.forEach(pos => {
        const light = new THREE.PointLight(COLORS.LANTERN_WARM, 4.0, 26, 1.4);
        light.position.set(pos.x, pos.y, pos.z);
        light.castShadow = true;
        light.shadow.mapSize.set(256, 256);
        scene.add(light);
        createLantern(pos.x, pos.y, pos.z);
    });
}

function createLantern(x, y, z) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.1, 0.3, 6),
        new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9, roughness: 0.2 })
    );
    group.add(body);
    const glow = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 8, 8),
        new THREE.MeshBasicMaterial({ color: COLORS.LANTERN_WARM })
    );
    group.add(glow);
    group.position.set(x, y, z);
    scene.add(group);
}

// World creation
function createWorld() {
    // Ground
    const groundGeo = new THREE.PlaneGeometry(150, 150, 30, 30);
    const positions = groundGeo.attributes.position;
    for (let i = 0; i < positions.count; i++) {
        positions.setZ(i, (Math.random() - 0.5) * 0.3);
    }
    groundGeo.computeVertexNormals();
    const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ color: COLORS.GROUND_DIRT, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    createCaveCeiling();
    createCaveWalls();
    createBuildings();
    createProps();
}

function createCaveCeiling() {
    const ceilingGeo = new THREE.PlaneGeometry(150, 150, 25, 25);
    const positions = ceilingGeo.attributes.position;
    for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i), y = positions.getY(i);
        positions.setZ(i, Math.sin(x * 0.1) * Math.cos(y * 0.1) * 4 + Math.random() * 2 - 5);
    }
    ceilingGeo.computeVertexNormals();
    const ceiling = new THREE.Mesh(ceilingGeo, new THREE.MeshStandardMaterial({ color: COLORS.CAVE_ROCK, roughness: 0.95, side: THREE.BackSide }));
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = GAME.CAVE_HEIGHT;
    scene.add(ceiling);

    // Stalactites
    for (let i = 0; i < 50; i++) {
        const height = 1 + Math.random() * 4;
        const stal = new THREE.Mesh(
            new THREE.ConeGeometry(0.15 + Math.random() * 0.3, height, 5),
            new THREE.MeshStandardMaterial({ color: COLORS.CAVE_ROCK_LIGHT, roughness: 0.9 })
        );
        stal.position.set((Math.random() - 0.5) * 100, GAME.CAVE_HEIGHT - height / 2, (Math.random() - 0.5) * 100);
        stal.rotation.x = Math.PI;
        stal.castShadow = true;
        scene.add(stal);
    }
}

function createCaveWalls() {
    const wallMat = new THREE.MeshStandardMaterial({ color: COLORS.CAVE_ROCK, roughness: 0.95 });
    for (let i = 0; i < 20; i++) {
        const angle = (i / 20) * Math.PI * 2;
        const radius = GAME.ARENA_SIZE + Math.sin(angle * 3) * 10;
        const wall = new THREE.Mesh(new THREE.BoxGeometry(8 + Math.random() * 5, GAME.CAVE_HEIGHT + 5, 3), wallMat);
        wall.position.set(Math.cos(angle) * radius, GAME.CAVE_HEIGHT / 2, Math.sin(angle) * radius);
        wall.lookAt(0, wall.position.y, 0);
        wall.castShadow = true;
        wall.receiveShadow = true;
        scene.add(wall);
    }
}

function createBuildings() {
    const buildings = [
        { x: 12, z: 5, w: 9, d: 11, h: 7, name: 'BANK' },
        { x: -10, z: 8, w: 8, d: 9, h: 6, name: 'SALOON' },
        { x: 0, z: -15, w: 10, d: 8, h: 6, name: '' },
        { x: -15, z: -10, w: 7, d: 8, h: 5.5, name: '' },
        { x: 18, z: -12, w: 8, d: 9, h: 6, name: '' },
        { x: -8, z: -22, w: 9, d: 7, h: 5, name: 'GENERAL STORE' }
    ];
    buildings.forEach(b => createBuilding(b.x, b.z, b.w, b.d, b.h, b.name));
}

function createBuilding(x, z, w, d, h, name) {
    const woodDark = new THREE.MeshStandardMaterial({ color: COLORS.WOOD_DARK, roughness: 0.9 });
    const woodMed = new THREE.MeshStandardMaterial({ color: COLORS.WOOD_MEDIUM, roughness: 0.85 });
    const woodWeathered = new THREE.MeshStandardMaterial({ color: COLORS.WOOD_WEATHERED, roughness: 0.95 });

    // Main body
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), woodDark);
    body.position.set(x, h / 2, z);
    body.castShadow = true;
    body.receiveShadow = true;
    scene.add(body);

    // Porch roof
    const porch = new THREE.Mesh(new THREE.BoxGeometry(w + 3, 0.15, 3.5), woodMed);
    porch.position.set(x, h * 0.55, z + d / 2 + 1.75);
    porch.castShadow = true;
    scene.add(porch);

    // Porch columns
    [-w / 2 + 0.5, w / 2 - 0.5].forEach(ox => {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, h * 0.55, 6), woodMed);
        col.position.set(x + ox, h * 0.275, z + d / 2 + 3);
        col.castShadow = true;
        scene.add(col);
    });

    // False front facade
    const facade = new THREE.Mesh(new THREE.BoxGeometry(w + 1, 2.5, 0.2), woodWeathered);
    facade.position.set(x, h + 1.25, z + d / 2);
    facade.castShadow = true;
    scene.add(facade);

    // Roof
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.25, d + 0.5), woodMed);
    roof.position.set(x, h + 0.125, z);
    roof.rotation.x = 0.08;
    scene.add(roof);

    // Windows with glow
    const windowMat = new THREE.MeshBasicMaterial({ color: COLORS.WINDOW_GLOW, transparent: true, opacity: 0.5 });
    [-w / 4, w / 4].forEach(ox => {
        const win = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.8), windowMat);
        win.position.set(x + ox, h * 0.45, z + d / 2 + 0.11);
        scene.add(win);
    });

    // Door
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.8, 0.1), new THREE.MeshStandardMaterial({ color: COLORS.WOOD_LIGHT, roughness: 0.7 }));
    door.position.set(x, 1.4, z + d / 2 + 0.06);
    door.castShadow = true;
    scene.add(door);

    // Wooden railings
    const railMat = new THREE.MeshStandardMaterial({ color: COLORS.WOOD_MEDIUM, roughness: 0.85 });
    const rail = new THREE.Mesh(new THREE.BoxGeometry(w + 2, 0.08, 0.08), railMat);
    rail.position.set(x, 1, z + d / 2 + 3.3);
    scene.add(rail);

    // Steps
    for (let i = 0; i < 2; i++) {
        const step = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.2, 0.5), woodMed);
        step.position.set(x, 0.1 + i * 0.2, z + d / 2 + 3.5 + i * 0.5);
        step.receiveShadow = true;
        scene.add(step);
    }
}

function createProps() {
    const barrelMat = new THREE.MeshStandardMaterial({ color: COLORS.WOOD_MEDIUM, roughness: 0.8 });
    const barrelGeo = new THREE.CylinderGeometry(0.4, 0.45, 1.1, 10);

    [{ x: 5, z: 10 }, { x: 6, z: 10.5 }, { x: -6, z: 12 }, { x: 15, z: -8 }, { x: -14, z: -5 }, { x: 3, z: -18 }, { x: -10, z: -20 }, { x: 20, z: 3 }].forEach(p => {
        const barrel = new THREE.Mesh(barrelGeo, barrelMat);
        barrel.position.set(p.x, 0.55, p.z);
        barrel.castShadow = true;
        barrel.receiveShadow = true;
        scene.add(barrel);
    });

    // Crates
    const crateMat = new THREE.MeshStandardMaterial({ color: COLORS.WOOD_LIGHT, roughness: 0.85 });
    [{ x: -4, z: 8 }, { x: 8, z: -6 }, { x: -12, z: -15 }, { x: 16, z: 8 }].forEach((p, i) => {
        const crate = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), crateMat);
        crate.position.set(p.x, 0.5 + (i % 2) * 0.5, p.z);
        crate.rotation.y = Math.random();
        crate.castShadow = true;
        crate.receiveShadow = true;
        scene.add(crate);
    });

    // Wagon wheels
    const wheelMat = new THREE.MeshStandardMaterial({ color: COLORS.WOOD_DARK, roughness: 0.7 });
    [{ x: 22, z: 10 }, { x: -20, z: -8 }].forEach(p => {
        const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.1, 8, 16), wheelMat);
        wheel.position.set(p.x, 0.9, p.z);
        wheel.rotation.y = Math.PI / 2;
        wheel.rotation.x = Math.random() * 0.4;
        wheel.castShadow = true;
        scene.add(wheel);
    });

    // Rocks
    const rockMat = new THREE.MeshStandardMaterial({ color: COLORS.CAVE_ROCK_DARK, roughness: 0.95 });
    for (let i = 0; i < 30; i++) {
        const size = 0.5 + Math.random() * 2;
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(size, 0), rockMat);
        const angle = Math.random() * Math.PI * 2;
        const dist = 15 + Math.random() * 30;
        rock.position.set(Math.cos(angle) * dist, size * 0.4, Math.sin(angle) * dist);
        rock.rotation.set(Math.random(), Math.random(), Math.random());
        rock.scale.y = 0.5 + Math.random() * 0.5;
        rock.castShadow = true;
        rock.receiveShadow = true;
        scene.add(rock);
    }

    // Fence
    const fenceMat = new THREE.MeshStandardMaterial({ color: COLORS.WOOD_WEATHERED, roughness: 0.9 });
    for (let i = 0; i < 8; i++) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.3, 0.15), fenceMat);
        post.position.set(-25 + i * 3, 0.65, 25);
        post.castShadow = true;
        scene.add(post);
        if (i < 7) {
            const rail = new THREE.Mesh(new THREE.BoxGeometry(3, 0.08, 0.08), fenceMat);
            rail.position.set(-23.5 + i * 3, 0.5, 25);
            scene.add(rail);
            const rail2 = rail.clone();
            rail2.position.y = 0.9;
            scene.add(rail2);
        }
    }
}

// Weapon Model
class WeaponModel {
    constructor() {
        this.group = new THREE.Group();
        this.defaultPos = new THREE.Vector3(0.3, -0.25, -0.5);
        this.adsPos = new THREE.Vector3(0, -0.15, -0.4);
        this.currentPos = this.defaultPos.clone();
        this.bobTime = 0;
        this.recoilOffset = 0;
        this.createModel();
        camera.add(this.group);
    }

    createModel() {
        const metalDark = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.95, roughness: 0.25 });
        const metalLight = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, metalness: 0.9, roughness: 0.3 });
        const wood = new THREE.MeshStandardMaterial({ color: 0x4a3020, metalness: 0.1, roughness: 0.75 });

        // Receiver
        const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.075, 0.32), metalDark);
        this.group.add(receiver);

        // Barrel
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.35, 8), metalLight);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.015, -0.32);
        this.group.add(barrel);

        // Barrel shroud
        const shroud = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.025, 0.22, 8), metalDark);
        shroud.rotation.x = Math.PI / 2;
        shroud.position.set(0, 0.015, -0.22);
        this.group.add(shroud);

        // Magazine
        const mag = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.14, 0.07), metalDark);
        mag.position.set(0, -0.1, 0.04);
        this.group.add(mag);

        // Stock
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.09, 0.18), wood);
        stock.position.set(0, -0.015, 0.2);
        this.group.add(stock);

        // Stock butt
        const butt = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.04), wood);
        butt.position.set(0, -0.01, 0.31);
        this.group.add(butt);

        // Grip
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.09, 0.04), wood);
        grip.position.set(0, -0.085, 0.1);
        grip.rotation.x = 0.3;
        this.group.add(grip);

        // Sights
        const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.022, 0.008), metalLight);
        frontSight.position.set(0, 0.045, -0.38);
        this.group.add(frontSight);

        const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.018, 0.008), metalLight);
        rearSight.position.set(0, 0.045, -0.08);
        this.group.add(rearSight);

        // Muzzle flash
        this.muzzleFlash = new THREE.Mesh(
            new THREE.SphereGeometry(0.06, 8, 8),
            new THREE.MeshBasicMaterial({ color: 0xffff44, transparent: true, opacity: 0 })
        );
        this.muzzleFlash.position.set(0, 0.015, -0.5);
        this.group.add(this.muzzleFlash);

        this.group.position.copy(this.defaultPos);
    }

    shoot() {
        this.recoilOffset = 0.04;
        this.muzzleFlash.material.opacity = 1;
        this.muzzleFlash.scale.setScalar(0.8 + Math.random() * 0.4);
    }

    update(dt, isMoving, isSprinting, isAiming, isReloading) {
        const targetPos = isAiming ? this.adsPos : this.defaultPos;
        this.currentPos.lerp(targetPos, dt * 12);

        if (isMoving && !isAiming) {
            this.bobTime += dt * (isSprinting ? 14 : 10);
            const bobX = Math.sin(this.bobTime) * (isSprinting ? 0.025 : 0.012);
            const bobY = Math.abs(Math.cos(this.bobTime)) * (isSprinting ? 0.02 : 0.01);
            this.group.position.set(this.currentPos.x + bobX, this.currentPos.y + bobY, this.currentPos.z);
        } else {
            this.bobTime = 0;
            this.group.position.copy(this.currentPos);
        }

        if (this.recoilOffset > 0) {
            this.recoilOffset -= dt * 0.4;
            this.group.position.z += this.recoilOffset;
            this.group.rotation.x = -this.recoilOffset * 1.5;
        } else {
            this.group.rotation.x *= 0.9;
        }

        if (isReloading) {
            this.group.rotation.x = Math.sin(Date.now() * 0.005) * 0.3 - 0.4;
            this.group.position.y = this.currentPos.y - 0.12;
        }

        if (this.muzzleFlash.material.opacity > 0) {
            this.muzzleFlash.material.opacity -= dt * 25;
        }
    }
}

// Player Controller
class PlayerController {
    constructor() {
        this.position = new THREE.Vector3(0, GAME.PLAYER_HEIGHT, 0);
        this.velocity = new THREE.Vector3();
        this.rotation = { x: 0, y: 0 };
        this.health = GAME.PLAYER_MAX_HEALTH;
        this.lastDamageTime = 0;
        this.isSprinting = false;
        this.isAiming = false;
        this.moveInput = { forward: 0, right: 0 };
    }

    get isMoving() { return this.moveInput.forward !== 0 || this.moveInput.right !== 0; }

    handleMouseMove(e) {
        if (!state.isPointerLocked || state.isDead) return;
        this.rotation.y -= e.movementX * GAME.MOUSE_SENSITIVITY;
        this.rotation.x -= e.movementY * GAME.MOUSE_SENSITIVITY;
        this.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.rotation.x));
    }

    handleKeyDown(key) {
        const k = key.toLowerCase();
        if (k === 'w') this.moveInput.forward = 1;
        else if (k === 's') this.moveInput.forward = -1;
        else if (k === 'a') this.moveInput.right = -1;
        else if (k === 'd') this.moveInput.right = 1;
        else if (k === 'shift') this.isSprinting = true;
    }

    handleKeyUp(key) {
        const k = key.toLowerCase();
        if (k === 'w' || k === 's') this.moveInput.forward = 0;
        else if (k === 'a' || k === 'd') this.moveInput.right = 0;
        else if (k === 'shift') this.isSprinting = false;
    }

    takeDamage(amount) {
        if (state.isDead) return;
        this.health -= amount;
        this.lastDamageTime = Date.now();
        if (this.health <= 0) { this.health = 0; this.die(); }
        this.updateHUD();
    }

    die() {
        state.isDead = true;
        document.getElementById('death-screen').style.display = 'flex';
        document.exitPointerLock();
    }

    update(dt) {
        if (state.isDead) return;

        if (Date.now() - this.lastDamageTime > GAME.PLAYER_HEALTH_REGEN_DELAY && this.health < GAME.PLAYER_MAX_HEALTH) {
            this.health = Math.min(GAME.PLAYER_MAX_HEALTH, this.health + GAME.PLAYER_HEALTH_REGEN_RATE * dt);
            this.updateHUD();
        }

        const speed = this.isSprinting ? GAME.SPRINT_SPEED : GAME.WALK_SPEED;
        const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotation.y);
        const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotation.y);
        const dir = new THREE.Vector3();
        dir.addScaledVector(forward, this.moveInput.forward);
        dir.addScaledVector(right, this.moveInput.right);

        if (dir.length() > 0) {
            dir.normalize();
            this.velocity.x = dir.x * speed;
            this.velocity.z = dir.z * speed;
        } else {
            this.velocity.x *= 0.85;
            this.velocity.z *= 0.85;
        }

        const boundary = GAME.ARENA_SIZE - GAME.PLAYER_RADIUS;
        this.position.x = Math.max(-boundary, Math.min(boundary, this.position.x + this.velocity.x * dt));
        this.position.z = Math.max(-boundary, Math.min(boundary, this.position.z + this.velocity.z * dt));

        camera.position.copy(this.position);
        camera.rotation.order = 'YXZ';
        camera.rotation.y = this.rotation.y;
        camera.rotation.x = this.rotation.x;

        const targetFov = this.isAiming ? GAME.ADS_FOV : GAME.DEFAULT_FOV;
        camera.fov += (targetFov - camera.fov) * GAME.FOV_LERP_SPEED * dt;
        camera.updateProjectionMatrix();
    }

    updateHUD() { document.getElementById('health-value').textContent = Math.ceil(this.health); }
}

// Weapon
class Weapon {
    constructor(model) {
        this.model = model;
        this.ammo = GAME.MAX_AMMO;
        this.reserveAmmo = GAME.RESERVE_AMMO;
        this.isReloading = false;
        this.reloadTimer = 0;
        this.fireCooldown = 0;
        this.updateHUD();
    }

    shoot(player) {
        if (this.isReloading || this.fireCooldown > 0 || this.ammo <= 0 || state.isDead) return;
        this.ammo--;
        this.fireCooldown = GAME.FIRE_RATE;
        this.updateHUD();
        this.model.shoot();

        const raycaster = new THREE.Raycaster();
        raycaster.set(camera.position, new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion));
        raycaster.far = GAME.WEAPON_RANGE;

        const hits = raycaster.intersectObjects(state.enemies.map(e => e.mesh));
        if (hits.length > 0) {
            const enemy = state.enemies.find(e => e.mesh === hits[0].object);
            if (enemy) {
                enemy.takeDamage(GAME.DAMAGE);
                const hit = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff3300 }));
                hit.position.copy(hits[0].point);
                scene.add(hit);
                setTimeout(() => scene.remove(hit), 80);
            }
        }

        if (this.ammo === 0 && this.reserveAmmo > 0) this.reload();
    }

    reload() {
        if (this.isReloading || this.reserveAmmo <= 0 || this.ammo === GAME.MAX_AMMO) return;
        this.isReloading = true;
        this.reloadTimer = GAME.RELOAD_TIME;
    }

    update(dt, player) {
        if (this.fireCooldown > 0) this.fireCooldown -= dt;
        if (this.isReloading) {
            this.reloadTimer -= dt;
            if (this.reloadTimer <= 0) {
                const needed = GAME.MAX_AMMO - this.ammo;
                const available = Math.min(needed, this.reserveAmmo);
                this.ammo += available;
                this.reserveAmmo -= available;
                this.isReloading = false;
                this.updateHUD();
            }
        }
        this.model.update(dt, player.isMoving, player.isSprinting, player.isAiming, this.isReloading);
    }

    updateHUD() {
        document.getElementById('ammo-value').textContent = this.ammo;
        document.getElementById('reserve-value').textContent = this.reserveAmmo;
    }
}

// Grenade
class Grenade {
    constructor(pos, dir) {
        this.velocity = dir.clone().multiplyScalar(GAME.GRENADE_THROW_FORCE);
        this.velocity.y += 5;
        this.fuseTimer = GAME.GRENADE_FUSE_TIME;
        this.isExploded = false;
        this.mesh = new THREE.Mesh(
            new THREE.SphereGeometry(0.1, 8, 8),
            new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.3, metalness: 0.8 })
        );
        this.mesh.position.copy(pos);
        this.mesh.castShadow = true;
        scene.add(this.mesh);
    }

    update(dt) {
        if (this.isExploded) return;
        this.velocity.y -= GAME.GRENADE_ARC_GRAVITY * dt;
        this.mesh.position.addScaledVector(this.velocity, dt);

        if (this.mesh.position.y < 0.1) {
            this.mesh.position.y = 0.1;
            this.velocity.y *= -0.4;
            this.velocity.x *= 0.7;
            this.velocity.z *= 0.7;
        }

        const b = GAME.ARENA_SIZE - 0.1;
        if (Math.abs(this.mesh.position.x) > b) { this.mesh.position.x = Math.sign(this.mesh.position.x) * b; this.velocity.x *= -0.5; }
        if (Math.abs(this.mesh.position.z) > b) { this.mesh.position.z = Math.sign(this.mesh.position.z) * b; this.velocity.z *= -0.5; }

        this.fuseTimer -= dt;
        if (this.fuseTimer <= 0) this.explode();
    }

    explode() {
        this.isExploded = true;
        scene.remove(this.mesh);
        state.explosions.push(new Explosion(this.mesh.position.clone()));

        state.enemies.forEach(e => {
            const d = e.mesh.position.distanceTo(this.mesh.position);
            if (d < GAME.GRENADE_EXPLOSION_RADIUS) e.takeDamage(GAME.GRENADE_DAMAGE * (1 - d / GAME.GRENADE_EXPLOSION_RADIUS));
        });

        const pd = player.position.distanceTo(this.mesh.position);
        if (pd < GAME.GRENADE_EXPLOSION_RADIUS) player.takeDamage(GAME.GRENADE_DAMAGE * (1 - pd / GAME.GRENADE_EXPLOSION_RADIUS) * 0.5);
    }
}

class Explosion {
    constructor(pos) {
        this.lifetime = 0.5;
        this.age = 0;
        this.mesh = new THREE.Mesh(
            new THREE.SphereGeometry(1, 12, 12),
            new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.9 })
        );
        this.mesh.position.copy(pos);
        scene.add(this.mesh);
        this.light = new THREE.PointLight(0xff6600, 8, 18);
        this.light.position.copy(pos);
        scene.add(this.light);
    }

    update(dt) {
        this.age += dt;
        const p = this.age / this.lifetime;
        this.mesh.scale.setScalar(1 + p * (GAME.GRENADE_EXPLOSION_RADIUS - 1));
        this.mesh.material.opacity = 0.9 * (1 - p);
        this.light.intensity = 8 * (1 - p);
        return this.age < this.lifetime;
    }

    destroy() { scene.remove(this.mesh); scene.remove(this.light); }
}

class GrenadeManager {
    constructor() { this.count = GAME.GRENADE_COUNT; this.cooldown = 0; }

    throw(player) {
        if (this.count <= 0 || this.cooldown > 0 || state.isDead) return;
        this.count--;
        this.cooldown = 0.5;
        this.updateHUD();
        const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        state.grenades.push(new Grenade(camera.position.clone().addScaledVector(dir, 0.5), dir));
    }

    update(dt) {
        if (this.cooldown > 0) this.cooldown -= dt;
        state.grenades = state.grenades.filter(g => { g.update(dt); return !g.isExploded; });
        state.explosions = state.explosions.filter(e => { const alive = e.update(dt); if (!alive) e.destroy(); return alive; });
    }

    updateHUD() { document.getElementById('grenade-value').textContent = this.count; }
}

// Enemy
class Enemy {
    constructor(pos) {
        this.health = GAME.ENEMY_HEALTH;
        this.attackCooldown = 0;
        this.isDead = false;

        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x4a5a4a, roughness: 0.9 });
        this.mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1, 4, 8), bodyMat);
        this.mesh.position.copy(pos);
        this.mesh.position.y = 1;
        this.mesh.castShadow = true;
        scene.add(this.mesh);

        this.head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 8), new THREE.MeshStandardMaterial({ color: 0x5a6a5a, roughness: 0.85 }));
        this.head.position.y = 0.95;
        this.mesh.add(this.head);

        const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2200 });
        [-0.08, 0.08].forEach(x => {
            const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), eyeMat);
            eye.position.set(x, 0.03, -0.2);
            this.head.add(eye);
        });

        const armMat = new THREE.MeshStandardMaterial({ color: 0x5a6a5a, roughness: 0.85 });
        this.leftArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.45, 4, 6), armMat);
        this.leftArm.position.set(-0.38, 0.25, -0.15);
        this.leftArm.rotation.x = -1.1;
        this.mesh.add(this.leftArm);

        this.rightArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.45, 4, 6), armMat);
        this.rightArm.position.set(0.38, 0.25, -0.15);
        this.rightArm.rotation.x = -1.1;
        this.mesh.add(this.rightArm);
    }

    takeDamage(amount) {
        this.health -= amount;
        this.mesh.material.emissive.setHex(0xff0000);
        setTimeout(() => { if (!this.isDead) this.mesh.material.emissive.setHex(0); }, 100);
        if (this.health <= 0) this.die();
    }

    die() {
        this.isDead = true;
        scene.remove(this.mesh);
        setTimeout(() => {
            if (!state.isDead) {
                const idx = state.enemies.indexOf(this);
                if (idx > -1) state.enemies[idx] = spawnEnemy();
            }
        }, 3000);
    }

    update(dt, playerPos) {
        if (this.isDead) return;
        const dir = new THREE.Vector3().subVectors(playerPos, this.mesh.position).setY(0).normalize();
        this.mesh.position.addScaledVector(dir, GAME.ENEMY_SPEED * dt);
        this.mesh.lookAt(playerPos.x, this.mesh.position.y, playerPos.z);

        this.attackCooldown -= dt;
        if (this.mesh.position.distanceTo(playerPos) < 1.5 && this.attackCooldown <= 0) {
            player.takeDamage(GAME.ENEMY_DAMAGE);
            this.attackCooldown = GAME.ENEMY_ATTACK_COOLDOWN;
        }

        const t = Date.now() * 0.008;
        this.mesh.rotation.z = Math.sin(t) * 0.07;
        this.leftArm.rotation.x = -1.1 + Math.sin(t) * 0.2;
        this.rightArm.rotation.x = -1.1 + Math.sin(t + Math.PI) * 0.2;
    }
}

function spawnEnemy() {
    const angle = Math.random() * Math.PI * 2;
    const dist = GAME.ENEMY_SPAWN_DISTANCE + Math.random() * 10;
    const x = Math.max(-GAME.ARENA_SIZE + 2, Math.min(GAME.ARENA_SIZE - 2, Math.cos(angle) * dist));
    const z = Math.max(-GAME.ARENA_SIZE + 2, Math.min(GAME.ARENA_SIZE - 2, Math.sin(angle) * dist));
    return new Enemy(new THREE.Vector3(x, 0, z));
}

function initEnemies() { for (let i = 0; i < GAME.ENEMY_COUNT; i++) state.enemies.push(spawnEnemy()); }

// Input
function setupInput() {
    renderer.domElement.addEventListener('click', () => { if (!state.isPointerLocked && !state.isDead) renderer.domElement.requestPointerLock(); });
    document.addEventListener('pointerlockchange', () => { state.isPointerLocked = document.pointerLockElement === renderer.domElement; });
    document.addEventListener('mousemove', e => player.handleMouseMove(e));
    document.addEventListener('mousedown', e => { if (!state.isPointerLocked) return; if (e.button === 0) weapon.shoot(player); if (e.button === 2) player.isAiming = true; });
    document.addEventListener('mouseup', e => { if (e.button === 2) player.isAiming = false; });
    document.addEventListener('keydown', e => { if (e.repeat) return; player.handleKeyDown(e.key); if (e.key.toLowerCase() === 'r') { if (state.isDead) restartGame(); else weapon.reload(); } if (e.key.toLowerCase() === 'g') grenadeManager.throw(player); });
    document.addEventListener('keyup', e => player.handleKeyUp(e.key));
    document.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });
}

function restartGame() {
    player.position.set(0, GAME.PLAYER_HEIGHT, 0);
    player.health = GAME.PLAYER_MAX_HEALTH;
    player.rotation.x = player.rotation.y = 0;
    player.updateHUD();
    weapon.ammo = GAME.MAX_AMMO;
    weapon.reserveAmmo = GAME.RESERVE_AMMO;
    weapon.isReloading = false;
    weapon.updateHUD();
    grenadeManager.count = GAME.GRENADE_COUNT;
    grenadeManager.updateHUD();
    state.enemies.forEach(e => { if (!e.isDead) scene.remove(e.mesh); });
    state.enemies = [];
    initEnemies();
    state.grenades.forEach(g => scene.remove(g.mesh));
    state.grenades = [];
    state.explosions.forEach(e => e.destroy());
    state.explosions = [];
    state.isDead = false;
    document.getElementById('death-screen').style.display = 'none';
    renderer.domElement.requestPointerLock();
}

// Game loop
let lastTime = performance.now();
function gameLoop() {
    requestAnimationFrame(gameLoop);
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;

    if (!state.isDead) {
        player.update(dt);
        weapon.update(dt, player);
        grenadeManager.update(dt);
        state.enemies.forEach(e => { if (!e.isDead) e.update(dt, player.position); });
    }

    renderer.render(scene, camera);
}

// Initialize
const player = new PlayerController();
const weaponModel = new WeaponModel();
const weapon = new Weapon(weaponModel);
const grenadeManager = new GrenadeManager();

setupLighting();
createWorld();
initEnemies();
setupInput();
gameLoop();

console.log('FPS Zombies - Buried loaded. Click to start!');
