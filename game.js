// ========================================
// 奶娃快跑 - 核心游戏引擎
// ========================================

const LANES = [-3, 0, 3];        // 三条赛道 X 坐标
const LANE_CHANGE_SPEED = 12;    // 换道速度
const JUMP_FORCE = 12;           // 跳跃力度
const GRAVITY = -28;             // 重力
const INITIAL_SPEED = 14;        // 初始跑速
const MAX_SPEED = 38;            // 最大跑速
const SPEED_INCREMENT = 0.003;   // 加速率

// 游戏状态
let scene, camera, renderer, clock;
let player, playerMixer, playerModel;
let obstacles = [], coins = [], decorations = [];
let trackTiles = [];
let particleSystem;

let state = {
  running: false,
  paused: false,
  gameOver: false,
  lane: 1,            // 当前赛道 (0=左, 1=中, 2=右)
  targetX: 0,
  playerY: 0,
  velocityY: 0,
  isGrounded: true,
  isDucking: false,
  score: 0,
  coins: 0,
  bestScore: parseInt(localStorage.getItem('naiwa_best') || '0'),
  speed: INITIAL_SPEED,
  distance: 0,
  combo: 0,
  frameCount: 0,
};

let keys = {};

// ========== 初始化 ==========
function init() {
  const canvas = document.getElementById('canvas');

  // 渲染器
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;

  // 场景
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a1a);
  scene.fog = new THREE.FogExp2(0x0a0a1a, 0.018);

  // 摄像机
  camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 5, -10);
  camera.lookAt(0, 1, 10);

  clock = new THREE.Clock();

  // 灯光
  setupLights();

  // 场景构建
  buildTrack();
  buildPlayer();
  buildSkybox();
  buildParticles();

  // 事件
  window.addEventListener('resize', onResize);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', e => { keys[e.code] = false; });

  // 加载进度动画
  animateLoading();
}

function animateLoading() {
  let progress = 0;
  const fill = document.getElementById('progress-fill');
  const text = document.getElementById('loading-text');
  const msgs = ['正在铺设赛道...', '召唤神牛中...', '装载金币...', '准备就绪！'];
  
  const interval = setInterval(() => {
    progress += Math.random() * 15 + 5;
    if (progress >= 100) {
      progress = 100;
      clearInterval(interval);
      setTimeout(showStart, 400);
    }
    fill.style.width = progress + '%';
    text.textContent = msgs[Math.floor(progress / 26)] || msgs[3];
  }, 200);
}

function showStart() {
  const loading = document.getElementById('loading');
  loading.style.opacity = '0';
  setTimeout(() => {
    loading.style.display = 'none';
    document.getElementById('start-screen').style.display = 'flex';
  }, 500);
  // 开始渲染循环（背景动态）
  animate();
}

// ========== 灯光 ==========
function setupLights() {
  // 环境光
  const ambient = new THREE.AmbientLight(0x334466, 0.8);
  scene.add(ambient);

  // 主方向光（太阳）
  const sun = new THREE.DirectionalLight(0xFFCC88, 2.5);
  sun.position.set(10, 20, -10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.far = 100;
  sun.shadow.camera.left = -20;
  sun.shadow.camera.right = 20;
  sun.shadow.camera.top = 20;
  sun.shadow.camera.bottom = -20;
  scene.add(sun);

  // 补光
  const fill = new THREE.DirectionalLight(0x6688CC, 0.8);
  fill.position.set(-10, 5, 10);
  scene.add(fill);

  // 地面反光
  const ground = new THREE.HemisphereLight(0x223366, 0x112244, 0.5);
  scene.add(ground);
}

// ========== 赛道 ==========
const TILE_LENGTH = 30;
const TILE_COUNT = 8;

function buildTrack() {
  const roadGeo = new THREE.BoxGeometry(10, 0.3, TILE_LENGTH);
  const roadMat = new THREE.MeshStandardMaterial({
    color: 0x2a2a3e,
    roughness: 0.8,
    metalness: 0.1,
  });

  const lineGeo = new THREE.BoxGeometry(0.15, 0.32, TILE_LENGTH);
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xFFD700, emissive: 0xFFAA00, emissiveIntensity: 0.3 });

  const edgeGeo = new THREE.BoxGeometry(0.5, 0.5, TILE_LENGTH);
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0xFF6600, emissive: 0xFF4400, emissiveIntensity: 0.5 });

  for (let i = 0; i < TILE_COUNT; i++) {
    const group = new THREE.Group();
    const z = i * TILE_LENGTH;

    // 路面
    const road = new THREE.Mesh(roadGeo, roadMat);
    road.receiveShadow = true;
    group.add(road);

    // 中线
    const line = new THREE.Mesh(lineGeo, lineMat);
    group.add(line);

    // 赛道线（左右）
    [-1.5, 1.5].forEach(x => {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.31, TILE_LENGTH), lineMat);
      l.position.x = x;
      group.add(l);
    });

    // 边缘护栏
    [-5.2, 5.2].forEach(x => {
      const edge = new THREE.Mesh(edgeGeo, edgeMat);
      edge.position.set(x, 0.1, 0);
      group.add(edge);
    });

    group.position.z = z;
    scene.add(group);
    trackTiles.push(group);
  }
}

function updateTrack() {
  const camZ = camera.position.z;
  trackTiles.forEach(tile => {
    if (tile.position.z < camZ - TILE_LENGTH) {
      tile.position.z += TILE_COUNT * TILE_LENGTH;
      // 清理该tile上的旧障碍（由obstacle系统管理，这里只移动地面）
    }
  });
}

// ========== 玩家：奶娃（奶龙+青蛙融合原创角色） ==========
function buildPlayer() {
  player = new THREE.Group();

  // 材质
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x7DD87D, roughness: 0.5, metalness: 0.0 }); // 嫩绿
  const bellyMat = new THREE.MeshStandardMaterial({ color: 0xFFF5E0, roughness: 0.4, metalness: 0.0 }); // 奶白腹部
  const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF });
  const eyePupilMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
  const eyeHighMat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, emissive: 0xFFFFFF, emissiveIntensity: 1 });
  const hornMat = new THREE.MeshStandardMaterial({ color: 0xAADDAA, roughness: 0.6 }); // 淡绿小龙角
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x5BB85B, roughness: 0.5 });
  const limbMat = new THREE.MeshStandardMaterial({ color: 0x6AC96A, roughness: 0.5 });

  // ---- 身体（梨形：下大上小，用球体缩放模拟） ----
  const bodyGeo = new THREE.SphereGeometry(0.9, 16, 16);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.scale.set(1, 1.25, 1);
  body.position.y = 1.1;
  body.castShadow = true;
  player.add(body);

  // 奶白腹部
  const bellyGeo = new THREE.SphereGeometry(0.6, 12, 12);
  const belly = new THREE.Mesh(bellyGeo, bellyMat);
  belly.scale.set(0.85, 1, 0.5);
  belly.position.set(0, 1.0, 0.55);
  player.add(belly);

  // ---- 头部 ----
  const headGeo = new THREE.SphereGeometry(0.72, 16, 16);
  const head = new THREE.Mesh(headGeo, bodyMat);
  head.scale.set(1, 0.95, 1);
  head.position.set(0, 2.35, 0.1);
  head.castShadow = true;
  player.add(head);

  // 青蛙宽嘴（扁椭圆）
  const mouthGeo = new THREE.SphereGeometry(0.38, 10, 6);
  const mouth = new THREE.Mesh(mouthGeo, bellyMat);
  mouth.scale.set(1, 0.28, 0.7);
  mouth.position.set(0, 2.05, 0.68);
  player.add(mouth);

  // 嘴线
  const smileGeo = new THREE.TorusGeometry(0.2, 0.025, 6, 12, Math.PI);
  const smileMat = new THREE.MeshStandardMaterial({ color: 0x559955 });
  const smile = new THREE.Mesh(smileGeo, smileMat);
  smile.position.set(0, 2.0, 0.75);
  smile.rotation.z = Math.PI;
  player.add(smile);

  // ---- 大圆眼睛 ----
  [-0.38, 0.38].forEach(x => {
    // 眼球
    const eyeGeo = new THREE.SphereGeometry(0.22, 12, 12);
    const eyeWhite = new THREE.Mesh(eyeGeo, eyeWhiteMat);
    eyeWhite.position.set(x, 2.55, 0.6);
    player.add(eyeWhite);

    // 瞳孔
    const pupilGeo = new THREE.SphereGeometry(0.12, 10, 10);
    const pupil = new THREE.Mesh(pupilGeo, eyePupilMat);
    pupil.position.set(x * 1.02, 2.55, 0.78);
    player.add(pupil);

    // 高光
    const hiGeo = new THREE.SphereGeometry(0.045, 6, 6);
    const hi = new THREE.Mesh(hiGeo, eyeHighMat);
    hi.position.set(x + 0.06, 2.65, 0.84);
    player.add(hi);
  });

  // ---- 小龙角（头顶两侧） ----
  [-0.28, 0.28].forEach(x => {
    const hornGeo = new THREE.ConeGeometry(0.08, 0.32, 8);
    const horn = new THREE.Mesh(hornGeo, hornMat);
    horn.position.set(x, 2.95, 0.0);
    horn.rotation.z = x > 0 ? 0.25 : -0.25;
    horn.rotation.x = -0.15;
    player.add(horn);
  });

  // ---- 短胖四肢 ----
  // 前腿（上半身两侧）
  [[-0.95, 1.2, 0.1], [0.95, 1.2, 0.1]].forEach(([x, y, z]) => {
    const armGeo = new THREE.CapsuleGeometry(0.18, 0.3, 6, 8);
    const arm = new THREE.Mesh(armGeo, limbMat);
    arm.position.set(x, y, z);
    arm.rotation.z = x > 0 ? -0.5 : 0.5;
    arm.castShadow = true;
    player.add(arm);
  });

  // 后腿（下方，青蛙式粗短腿）
  [[-0.55, 0.22, -0.3], [0.55, 0.22, -0.3]].forEach(([x, y, z]) => {
    const legGeo = new THREE.CapsuleGeometry(0.22, 0.35, 6, 8);
    const leg = new THREE.Mesh(legGeo, limbMat);
    leg.position.set(x, y, z);
    leg.rotation.x = 0.4;
    leg.castShadow = true;
    player.add(leg);
  });

  // ---- 龙尾巴 ----
  const tail1Geo = new THREE.SphereGeometry(0.2, 8, 8);
  const tail1 = new THREE.Mesh(tail1Geo, tailMat);
  tail1.position.set(0, 0.9, -0.85);
  player.add(tail1);

  const tail2Geo = new THREE.SphereGeometry(0.13, 8, 8);
  const tail2 = new THREE.Mesh(tail2Geo, tailMat);
  tail2.position.set(0, 0.7, -1.2);
  player.add(tail2);

  const tail3Geo = new THREE.ConeGeometry(0.09, 0.25, 8);
  const tail3 = new THREE.Mesh(tail3Geo, hornMat);
  tail3.position.set(0, 0.55, -1.45);
  tail3.rotation.x = 0.5;
  player.add(tail3);

  player.position.set(LANES[1], 0, 5);
  state.targetX = LANES[1];
  scene.add(player);
}

// ========== 障碍物 ==========
const obstacleTypes = [
  { name: 'rock', w: 1.5, h: 1.5, d: 1.5, color: 0x888888, isLow: false },
  { name: 'barrier', w: 3, h: 1.2, d: 0.5, color: 0xFF4400, isLow: false },
  { name: 'log', w: 1, h: 0.6, d: 3, color: 0x8B5E3C, isLow: true },
  { name: 'crate', w: 1.2, h: 1.2, d: 1.2, color: 0xD4A017, isLow: false },
  { name: 'barrel', w: 1, h: 1.4, d: 1, color: 0x334466, isLow: false },
];

function spawnObstacle(z) {
  const type = obstacleTypes[Math.floor(Math.random() * obstacleTypes.length)];
  
  // 随机选道，留一条空道
  const blockedLanes = [];
  const numBlocked = Math.random() < 0.3 ? 2 : 1;
  while (blockedLanes.length < numBlocked) {
    const l = Math.floor(Math.random() * 3);
    if (!blockedLanes.includes(l)) blockedLanes.push(l);
  }

  blockedLanes.forEach(laneIdx => {
    const geo = new THREE.BoxGeometry(type.w, type.h, type.d);
    const mat = new THREE.MeshStandardMaterial({
      color: type.color, roughness: 0.7, metalness: 0.1
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(LANES[laneIdx], type.h / 2, z);
    mesh.castShadow = true;
    mesh.userData = {
      type: 'obstacle',
      isLow: type.isLow,
      height: type.h,
      halfW: type.w / 2,
      halfH: type.h / 2,
      halfD: type.d / 2,
    };
    scene.add(mesh);
    obstacles.push(mesh);
  });
}

function spawnCoin(z) {
  const laneIdx = Math.floor(Math.random() * 3);
  const count = Math.floor(Math.random() * 4) + 2;
  
  for (let i = 0; i < count; i++) {
    const geo = new THREE.CylinderGeometry(0.25, 0.25, 0.08, 12);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xFFD700, emissive: 0xFFAA00, emissiveIntensity: 0.5,
      roughness: 0.2, metalness: 0.8,
    });
    const coin = new THREE.Mesh(geo, mat);
    coin.position.set(LANES[laneIdx], 1.2 + i * 0.5, z - i * 1.5);
    coin.rotation.x = Math.PI / 2;
    coin.userData = { type: 'coin', collected: false };
    scene.add(coin);
    coins.push(coin);
  }
}

// ========== 粒子系统（尘土效果） ==========
function buildParticles() {
  const geo = new THREE.BufferGeometry();
  const count = 200;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i++) positions[i] = (Math.random() - 0.5) * 10;
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  
  const mat = new THREE.PointsMaterial({
    color: 0xFFAA44, size: 0.08, transparent: true, opacity: 0.6,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  particleSystem = new THREE.Points(geo, mat);
  particleSystem.visible = false;
  scene.add(particleSystem);
}

// ========== 背景装饰 ==========
function buildSkybox() {
  // 星星
  const starGeo = new THREE.BufferGeometry();
  const starCount = 1000;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    starPos[i * 3] = (Math.random() - 0.5) * 400;
    starPos[i * 3 + 1] = Math.random() * 100 + 10;
    starPos[i * 3 + 2] = (Math.random() - 0.5) * 400;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xFFFFFF, size: 0.15, transparent: true, opacity: 0.8 });
  scene.add(new THREE.Points(starGeo, starMat));

  // 远处建筑轮廓
  const buildingMat = new THREE.MeshStandardMaterial({ color: 0x1a1a3e, roughness: 1 });
  for (let i = 0; i < 20; i++) {
    const h = Math.random() * 15 + 5;
    const w = Math.random() * 3 + 1;
    const geo = new THREE.BoxGeometry(w, h, w);
    const mesh = new THREE.Mesh(geo, buildingMat);
    const side = Math.random() > 0.5 ? 1 : -1;
    mesh.position.set(side * (Math.random() * 20 + 10), h / 2, Math.random() * 200 - 20);
    scene.add(mesh);
  }
}

// ========== 输入 ==========
function onKeyDown(e) {
  keys[e.code] = true;

  if (!state.running || state.gameOver) return;

  if (e.code === 'KeyP' || e.code === 'Escape') {
    togglePause(); return;
  }
  if (state.paused) return;

  // 换道
  if ((e.code === 'ArrowLeft' || e.code === 'KeyA') && state.lane > 0) {
    state.lane--;
    state.targetX = LANES[state.lane];
  }
  if ((e.code === 'ArrowRight' || e.code === 'KeyD') && state.lane < 2) {
    state.lane++;
    state.targetX = LANES[state.lane];
  }

  // 跳跃
  if ((e.code === 'ArrowUp' || e.code === 'Space' || e.code === 'KeyW') && state.isGrounded) {
    state.velocityY = JUMP_FORCE;
    state.isGrounded = false;
  }

  // 下蹲
  if (e.code === 'ArrowDown' || e.code === 'KeyS') {
    state.isDucking = true;
  }
}

function mobileInput(dir, pressed) {
  if (!state.running || state.paused || state.gameOver) return;
  
  if (dir === 'left' && pressed && state.lane > 0) {
    state.lane--; state.targetX = LANES[state.lane];
  }
  if (dir === 'right' && pressed && state.lane < 2) {
    state.lane++; state.targetX = LANES[state.lane];
  }
  if (dir === 'jump' && pressed && state.isGrounded) {
    state.velocityY = JUMP_FORCE; state.isGrounded = false;
  }
  if (dir === 'down') {
    state.isDucking = pressed;
  }
}

// ========== 碰撞检测 ==========
function checkCollisions() {
  const px = player.position.x;
  const py = player.position.y;
  const pz = player.position.z;
  const pw = state.isDucking ? 0.5 : 0.6;
  const ph = state.isDucking ? 0.8 : 1.6;

  // 障碍物碰撞
  for (let obs of obstacles) {
    const dx = Math.abs(px - obs.position.x);
    const dz = Math.abs(pz - obs.position.z);
    const dy = Math.abs((py + ph / 2) - obs.position.y);

    if (dx < pw + obs.userData.halfW &&
        dz < 0.9 + obs.userData.halfD &&
        dy < ph / 2 + obs.userData.halfH) {
      
      // 下蹲可以躲低障碍
      if (obs.userData.isLow && state.isDucking) continue;
      // 跳跃可以跳过矮障碍
      if (!obs.userData.isLow && py > obs.userData.height * 0.7) continue;

      triggerGameOver();
      return;
    }
  }

  // 金币收集
  for (let coin of coins) {
    if (coin.userData.collected) continue;
    const dx = Math.abs(px - coin.position.x);
    const dz = Math.abs(pz - coin.position.z);
    if (dx < 0.8 && dz < 0.8) {
      coin.userData.collected = true;
      coin.visible = false;
      state.coins++;
      state.score += 50;
      updateHUD();
    }
  }
}

// ========== 生成管理 ==========
let lastObstacleZ = 80;
let lastCoinZ = 60;

function manageSpawning() {
  const camZ = camera.position.z;
  const spawnAhead = 120;

  if (lastObstacleZ < camZ + spawnAhead) {
    const gap = Math.max(15, 30 - state.speed * 0.3);
    spawnObstacle(lastObstacleZ);
    lastObstacleZ += gap + Math.random() * 10;
  }

  if (lastCoinZ < camZ + spawnAhead) {
    spawnCoin(lastCoinZ);
    lastCoinZ += 20 + Math.random() * 15;
  }

  // 清理身后的物体
  const cleanBehind = camZ - 30;
  obstacles = obstacles.filter(obs => {
    if (obs.position.z < cleanBehind) {
      scene.remove(obs);
      obs.geometry.dispose();
      return false;
    }
    return true;
  });
  coins = coins.filter(coin => {
    if (coin.position.z < cleanBehind) {
      scene.remove(coin);
      coin.geometry.dispose();
      return false;
    }
    return true;
  });
}

// ========== HUD ==========
function updateHUD() {
  document.getElementById('score-display').textContent = Math.floor(state.score);
  document.getElementById('coin-display').textContent = '🪙 ' + state.coins;
}

// ========== 游戏流程 ==========
function startGame() {
  document.getElementById('start-screen').style.display = 'none';
  document.getElementById('hud').style.display = 'flex';
  document.getElementById('mobile-controls').style.display = window.matchMedia('(hover: none)').matches ? 'flex' : 'none';

  // 重置
  resetState();
  state.running = true;
}

function resetState() {
  // 清理场景
  obstacles.forEach(o => { scene.remove(o); o.geometry.dispose(); });
  coins.forEach(c => { scene.remove(c); c.geometry.dispose(); });
  obstacles = []; coins = [];

  state.running = false;
  state.paused = false;
  state.gameOver = false;
  state.lane = 1;
  state.targetX = LANES[1];
  state.playerY = 0;
  state.velocityY = 0;
  state.isGrounded = true;
  state.isDucking = false;
  state.score = 0;
  state.coins = 0;
  state.speed = INITIAL_SPEED;
  state.distance = 0;
  state.frameCount = 0;

  player.position.set(LANES[1], 0, 5);
  lastObstacleZ = camera.position.z + 80;
  lastCoinZ = camera.position.z + 60;
  updateHUD();
}

function restartGame() {
  document.getElementById('gameover-screen').style.display = 'none';
  document.getElementById('hud').style.display = 'flex';
  resetState();
  state.running = true;
}

function goHome() {
  document.getElementById('gameover-screen').style.display = 'none';
  document.getElementById('pause-screen').style.display = 'none';
  document.getElementById('hud').style.display = 'none';
  resetState();
  document.getElementById('start-screen').style.display = 'flex';
}

function togglePause() {
  if (state.gameOver) return;
  state.paused = !state.paused;
  document.getElementById('pause-screen').style.display = state.paused ? 'flex' : 'none';
  if (!state.paused) clock.getDelta(); // 消耗掉暂停期间的delta
}

function triggerGameOver() {
  if (state.gameOver) return;
  state.gameOver = true;
  state.running = false;

  // 更新最高分
  if (state.score > state.bestScore) {
    state.bestScore = state.score;
    localStorage.setItem('naiwa_best', state.bestScore);
  }

  // 抖动效果
  setTimeout(() => {
    document.getElementById('hud').style.display = 'none';
    document.getElementById('final-score').textContent = '本次得分：' + Math.floor(state.score);
    document.getElementById('best-score').textContent = '最高记录：' + Math.floor(state.bestScore);
    document.getElementById('gameover-screen').style.display = 'flex';
  }, 300);
}

// ========== 主循环 ==========
function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);

  if (state.running && !state.paused && !state.gameOver) {
    update(delta);
  }

  // 金币旋转动画（始终）
  coins.forEach(coin => {
    if (!coin.userData.collected) coin.rotation.z += delta * 2;
  });

  renderer.render(scene, camera);
}

function update(delta) {
  state.frameCount++;

  // 加速
  state.speed = Math.min(MAX_SPEED, INITIAL_SPEED + state.distance * SPEED_INCREMENT);

  // 前进距离
  state.distance += state.speed * delta;
  state.score += state.speed * delta * 0.5;

  // 玩家 X 轴平滑移动
  const dx = state.targetX - player.position.x;
  player.position.x += dx * LANE_CHANGE_SPEED * delta;

  // 重力 & 跳跃
  if (!state.isGrounded) {
    state.velocityY += GRAVITY * delta;
    state.playerY += state.velocityY * delta;
    if (state.playerY <= 0) {
      state.playerY = 0;
      state.velocityY = 0;
      state.isGrounded = true;
    }
  }
  player.position.y = state.playerY;

  // 下蹲形变
  if (state.isDucking && state.isGrounded) {
    player.scale.y = 0.55;
    player.position.y = -0.4;
    if (!keys['ArrowDown'] && !keys['KeyS']) state.isDucking = false;
  } else {
    player.scale.y += (1 - player.scale.y) * 10 * delta;
  }

  // 奔跑摇晃
  const wobble = Math.sin(state.frameCount * 0.25) * 0.04;
  player.rotation.z = wobble + dx * 0.05;

  // 摄像机跟随
  const targetCamZ = player.position.z - 10;
  camera.position.z += (targetCamZ - camera.position.z) * 8 * delta;
  camera.position.x += (player.position.x * 0.15 - camera.position.x) * 6 * delta;
  camera.position.y = 5 + state.playerY * 0.3;
  camera.lookAt(player.position.x * 0.3, player.position.y + 1.5, player.position.z + 15);

  // 地面向前移动（视觉欺骗：实际是摄像机跟着玩家走）
  player.position.z += state.speed * delta;

  updateTrack();
  manageSpawning();
  checkCollisions();
  updateHUD();

  // 尘土粒子
  if (state.isGrounded && particleSystem) {
    particleSystem.visible = true;
    particleSystem.position.copy(player.position);
    particleSystem.position.y = 0.1;
    particleSystem.rotation.y += delta * 2;
  }
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// 启动
window.addEventListener('DOMContentLoaded', init);
