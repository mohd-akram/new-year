const debug = false;
let time = 0;
const loader = new THREE.FontLoader();

async function loadFont(path) {
  return await new Promise(resolve => loader.load(path, resolve));
}

function createText(text, size, color, font, smooth = true) {
  const geometry = new THREE.TextGeometry(text, {
    font,
    size,
    height: 0.05,
    curveSegments: smooth ? 12 : 2,
    bevelEnabled: smooth,
    bevelThickness: 0.004,
    bevelSize: 0.005,
    bevelSegments: 12
  }).center();
  geometry.computeBoundingBox();
  geometry.computeVertexNormals();
  const material = new THREE.MeshPhysicalMaterial({ color });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createParticleText(text, size, font, numParticles, source = null) {
  const mesh = createText(text, size, 0, font, false);
  mesh.material.side = THREE.DoubleSide;
  const boundingBox = mesh.geometry.boundingBox;

  const raycaster = new THREE.Raycaster();
  const ray = new THREE.Vector3(0, 0, 1);

  const particles = [];

  const maxColor = 1 << 24;
  const palette = [];
  for (let i = 0; i < 4; i++) {
    palette.push(new THREE.Color(Math.round(Math.random() * maxColor)));
  }

  const numLights = 12;

  while (particles.length < numParticles) {
    const point = new THREE.Vector3(
      THREE.Math.randFloat(boundingBox.min.x, boundingBox.max.x),
      THREE.Math.randFloat(boundingBox.min.y, boundingBox.max.y),
      THREE.Math.randFloat(boundingBox.min.z, boundingBox.max.z)
    );
    raycaster.set(point, ray);
    const intersects = raycaster.intersectObject(mesh);
    if (intersects.length % 2 == 1) {
      const color = palette[Math.floor(Math.random() * palette.length)];
      particles.push({ position: point, color });
    }
  }

  if (source)
    particles.sort((a, b) => {
      const distanceA = a.position.distanceToSquared(source);
      const distanceB = b.position.distanceToSquared(source);
      return distanceA - distanceB;
    });

  const lights = {};
  for (let i = 0; i < numLights; i++) {
    const idx = Math.floor(Math.random() * particles.length);
    const particle = particles[idx];
    const pos = particle.position;
    const light = new THREE.PointLight(particle.color, 0, 0, 2);
    light.castShadow = true;
    light.position.set(pos.x, pos.y, pos.z);
    particle.light = light;
    lights[idx] = light;
  }

  const vertices = [];
  for (const particle of particles) {
    vertices.push(
      particle.position.x, particle.position.y, particle.position.z
    );
  }

  const colors = [];
  for (const particle of particles) {
    colors.push(
      particle.color.r, particle.color.g, particle.color.b
    );
  }

  const pointsMaterial = new THREE.PointsMaterial({
    size: 0.01,
    vertexColors: THREE.VertexColors,
    map: createCircleTexture(0xffffff, 256),
    transparent: true,
    depthWrite: false
  });

  const pointsGeometry = new THREE.BufferGeometry();
  pointsGeometry.addAttribute(
    'position', new THREE.Float32BufferAttribute(vertices, 3)
  );
  pointsGeometry.addAttribute(
    'color', new THREE.Float32BufferAttribute(colors, 3)
  );
  const points = new THREE.Points(pointsGeometry, pointsMaterial);

  return [points, lights];
}

function createCircleTexture(color, size) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.Texture(canvas);
  const center = size / 2;
  ctx.beginPath();
  ctx.arc(center, center, size / 2, 0, 2 * Math.PI, false);
  ctx.closePath();
  ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
  ctx.fill();
  texture.needsUpdate = true;
  return texture;
}

async function main() {
  const canvas = document.querySelector('canvas');
  const camera = new THREE.PerspectiveCamera(
    75, canvas.clientWidth / canvas.clientHeight, 0.1, 1000
  );
  const renderer = new THREE.WebGLRenderer({ antialias: true, canvas });
  renderer.physicallyCorrectLights = true;
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  function onWindowResize() {
    camera.aspect = canvas.clientWidth / canvas.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  }
  window.addEventListener('resize', onWindowResize, false);

  const animateParticles = true;
  const animateCamera = true;

  const numParticles = 5000;

  const duration = 6 * 60 * 60;
  const newTextZ = 2.5;

  const cameraZ = 0.8;
  const disintegration = numParticles / (duration ** 2);
  const acceleration = 4000 / (duration ** 2);
  const speed = 0;

  const font = await loadFont('fonts/optimer_regular.typeface.json');

  const scene = new THREE.Scene();

  camera.position.z = cameraZ;

  let controls;
  if (debug)
    controls = new THREE.TrackballControls(camera);

  const source = new THREE.Vector3(-1, -1, -1);

  const year = new Date().getFullYear();

  const [points, lights] = createParticleText(
    year.toString(), 0.5, font, numParticles, source
  );
  scene.add(points);
  for (const light of Object.values(lights))
    scene.add(light);

  const newText = createText((year + 1).toString(), 2, 0, font);
  newText.position.z = newTextZ;
  scene.add(newText);

  const position = points.geometry.getAttribute('position');
  position.dynamic = true;

  const d = new Date();
  const s = d.getSeconds() + (60 * (d.getMinutes() + (60 * d.getHours())));
  time = s - 18 * 60 * 60;
  let last = null;

  const originalPosition = position.clone();

  function draw(time) {
    const a = acceleration;

    for (let i = 0; i < position.count; i++) {
      const x = originalPosition.getX(i);
      const y = originalPosition.getY(i);
      const z = originalPosition.getZ(i);
      const pos = new THREE.Vector3(x, y, z);
      if (pos.z > newTextZ + 2.5)
        pos.z = newTextZ + 2.5;
      const startTime = Math.sqrt(i / disintegration);
      const v = speed + acceleration * startTime;
      if (time >= startTime) {
        const t = time - startTime;
        const tSq = t * t;
        pos.add(new THREE.Vector3(
          x * (v * t + a * tSq),
          y * (v * t + a * tSq),
          (1 + z) * (v * t + a * tSq)
        ));
      }
      position.setXYZ(i, pos.x, pos.y, pos.z);
      const light = lights[i];
      if (light) {
        light.position.set(pos.x, pos.y, pos.z);
        light.intensity = 4 * pos.lengthSq();
      }
    }
    position.needsUpdate = true;
  }

  function animate(timestamp) {
    if (!last) last = timestamp;
    const dt = (timestamp - last) / 1000;
    time += dt;
    last = timestamp;
    requestAnimationFrame(animate);
    if (time < 0)
      return;
    if (animateParticles)
      draw(time);
    const t = time > duration ? 1 : time / duration;
    const tSq = t * t;
    const d = tSq;
    if (debug)
      controls.update();
    if (!debug && animateCamera)
      camera.position.z = cameraZ + (newTextZ + 2.2 - cameraZ) * d;
    renderer.render(scene, camera);
  }

  document.querySelector('#loading').style.display = 'none';
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

if (document.querySelector('canvas'))
  main();
else
  document.addEventListener('DOMContentLoaded', main);
