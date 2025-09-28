document.addEventListener('DOMContentLoaded', () => {
    const CUBE_SIZE = 3;
    const CUBIE_UNIT_SIZE = 1;

    window.AndroidInterface = {
        performMove: (move) => {
            performMove(move);
        },
        shuffleCube: () => {
            shuffleCube();
        },
        resetCubeState: () => {
            resetCubeState();
        },
        undoLastMove: () => {
            undoLastMove();
        },
        showHint: () => {
            showHint();
        },
        setDifficulty: (difficulty) => {
            const difficultyBtn = document.querySelector(`.difficulty-btn[data-difficulty="${difficulty}"]`);
            if (difficultyBtn) {
                difficultyBtn.click();
            }
        },
        togglePrimeMode: () => {
            const primeToggleBtn = document.getElementById('prime-toggle-btn');
            if (primeToggleBtn) {
                primeToggleBtn.click();
            }
        },
        openInstructions: () => {
            const instructionsBtn = document.getElementById('instructions-btn');
            if (instructionsBtn) {
                instructionsBtn.click();
            }
        },
        closeInstructions: () => {
            const closeInstructionsBtn = document.getElementById('close-instructions-btn');
            if (closeInstructionsBtn) {
                closeInstructionsBtn.click();
            }
        }
    };

    const SPACING = 0.05;
    const CUBIE_ACTUAL_SIZE = CUBIE_UNIT_SIZE - SPACING;

    let scene, camera, renderer, controls, raycaster;
    let cube, cubies = [];

    let isAnimating = false;
    let isSolved = true;
    let isTimerRunning = false;
    let timerInterval;
    let startTime;
    let isPrimeMode = false;

    let moveHistory = [];
    let shuffleHistory = [];
    let currentDifficulty = 'Medium';
    const shuffleCounts = { Easy: 15, Medium: 25, Hard: 40 };

    const clickSound = document.getElementById('click-sound');
    const solvedPopup = document.getElementById('solved-popup');
    const finalTimeElem = document.getElementById('final-time');
    const timerDisplay = document.getElementById('timer-display');
    const container = document.getElementById('canvas-container');

    let isDraggingOnCube = false;
    let dragStartPoint = new THREE.Vector2();
    let dragCurrentPoint = new THREE.Vector2();
    let intersectedObject = null;
    let helperPlane = new THREE.Mesh(
        new THREE.PlaneBufferGeometry(100, 100),
        new THREE.MeshBasicMaterial({ visible: false, depthWrite: false })
    );

    const faceMaterials = {};
    const insideMaterial = new THREE.MeshStandardMaterial({ color: 0x1A1A1A, roughness: 0.8, metalness: 0.1 });
    const textureLoader = new THREE.TextureLoader();
    const defaultFaceColors = { F: 0x009b48, B: 0x0046ad, U: 0xffffff, D: 0xffd500, L: 0xff5800, R: 0xb71234 };
    const imageUrls = {
        F: 'images/face_f.jpg', B: 'images/face_b.jpg', U: 'images/face_u.jpg',
        D: 'images/face_d.jpg', L: 'images/face_l.jpg', R: 'images/face_r.jpg'
    };

    function init() {
        scene = new THREE.Scene();
        scene.background = null;
        camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 1000);
        camera.position.set(3.8, 3.8, 3.8);
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        container.appendChild(renderer.domElement);

        const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
        scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
        directionalLight.position.set(8, 12, 10);
        scene.add(directionalLight);
        scene.add(helperPlane);

        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.enableZoom = false;
        controls.enablePan = false;
        controls.minDistance = 4;

        raycaster = new THREE.Raycaster();

        Object.keys(defaultFaceColors).forEach(face => {
            faceMaterials[face] = new THREE.MeshStandardMaterial({ color: defaultFaceColors[face], roughness: 0.3 });
        });
        loadInitialTextures();
        createCube();
        setupEventListeners();
        updateButtonStates();
        animate();
    }

    function loadInitialTextures() {
        Object.keys(imageUrls).forEach(faceKey => {
            textureLoader.load(imageUrls[faceKey],
                (texture) => {
                    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
                    faceMaterials[faceKey].map = texture;
                    faceMaterials[faceKey].color.set(0xffffff);
                    faceMaterials[faceKey].needsUpdate = true;
                },
                undefined,
                (err) => console.error(`Error loading texture for face ${faceKey}:`, err)
            );
        });
    }

    function createCubieGeometry(x, y, z) {
        const geometry = new THREE.BoxGeometry(CUBIE_ACTUAL_SIZE, CUBIE_ACTUAL_SIZE, CUBIE_ACTUAL_SIZE);
        const uvAttribute = geometry.attributes.uv;
        const segment = 1 / CUBE_SIZE;
        const uvMaps = {
            R: { faceIndex: 0, u: 2 - z, v: y }, U: { faceIndex: 2, u: x, v: 2 - z }, F: { faceIndex: 4, u: x, v: y },
            L: { faceIndex: 1, u: z,     v: y }, D: { faceIndex: 3, u: x, v: z },     B: { faceIndex: 5, u: 2 - x, v: y }
        };
        for (const map of Object.values(uvMaps)) {
            const u0 = map.u * segment, v0 = map.v * segment;
            const u1 = u0 + segment, v1 = v0 + segment;
            const i = map.faceIndex * 4;
            uvAttribute.setXY(i, u0, v1); uvAttribute.setXY(i + 1, u1, v1);
            uvAttribute.setXY(i + 2, u0, v0); uvAttribute.setXY(i + 3, u1, v0);
        }
        return geometry;
    }

    function createCube() {
        if (cube) scene.remove(cube);
        cube = new THREE.Group();
        cubies = [];
        const positionOffset = (CUBE_SIZE - 1) / 2;
        for (let x = 0; x < CUBE_SIZE; x++) for (let y = 0; y < CUBE_SIZE; y++) for (let z = 0; z < CUBE_SIZE; z++) {
            const geometry = createCubieGeometry(x, y, z);
            const materials = [
                x === CUBE_SIZE - 1 ? faceMaterials.R : insideMaterial, x === 0 ? faceMaterials.L : insideMaterial,
                y === CUBE_SIZE - 1 ? faceMaterials.U : insideMaterial, y === 0 ? faceMaterials.D : insideMaterial,
                z === CUBE_SIZE - 1 ? faceMaterials.F : insideMaterial, z === 0 ? faceMaterials.B : insideMaterial,
            ];
            const cubie = new THREE.Mesh(geometry, materials);
            const edges = new THREE.EdgesGeometry(cubie.geometry);
            const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xfefefe, transparent: true, opacity: 0.7 }));
            cubie.add(line);
            cubie.position.set((x - positionOffset) * CUBIE_UNIT_SIZE, (y - positionOffset) * CUBIE_UNIT_SIZE, (z - positionOffset) * CUBIE_UNIT_SIZE);
            cubie.userData.initialPosition = cubie.position.clone();
            cubie.userData.initialQuaternion = cubie.quaternion.clone();
            cube.add(cubie);
            cubies.push(cubie);
        }
        scene.add(cube);
    }

    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
        const secs = (seconds % 60).toString().padStart(2, '0');
        return `${mins}:${secs}`;
    }

    function startTimer() {
        if (isTimerRunning) return;
        isTimerRunning = true;
        startTime = Date.now();
        timerInterval = setInterval(() => {
            const elapsedTime = Math.floor((Date.now() - startTime) / 1000);
            timerDisplay.textContent = formatTime(elapsedTime);
        }, 1000);
    }

    function stopTimer() {
        isTimerRunning = false;
        clearInterval(timerInterval);
    }

    function resetTimer() {
        stopTimer();
        timerDisplay.textContent = "00:00";
        timerDisplay.style.color = 'var(--text-color)';
    }

    function resetCubeState() {
        if (isAnimating) return;
        createCube();
        resetTimer();
        isSolved = true;
        isPrimeMode = false;
        document.getElementById('prime-toggle-btn').classList.remove('active');
        solvedPopup.classList.remove('show');
        moveHistory = [];
        shuffleHistory = [];
        updateButtonStates();
    }

    function undoLastMove() {
        if (isAnimating || moveHistory.length === 0) return;
        const lastMove = moveHistory.pop();
        const reversedMove = lastMove.includes("'") ? lastMove.charAt(0) : lastMove + "'";
        if (shuffleHistory.length > 0) {
             shuffleHistory.push(lastMove);
        }
        performMove(reversedMove, { isUndo: true });
    }

    function showHint() {
        if (isAnimating) return;
        let hintMove;
        if (shuffleHistory.length === 0) {
            const moves = ['U', 'D', 'L', 'R', 'F', 'B'];
            hintMove = moves[Math.floor(Math.random() * moves.length)];
        } else {
            const lastShuffle = shuffleHistory[shuffleHistory.length - 1];
            hintMove = lastShuffle.includes("'") ? lastShuffle.charAt(0) : lastShuffle + "'";
        }
        const baseMove = hintMove.charAt(0);
        const isPrime = hintMove.includes("'");
        const moveBtn = document.querySelector(`.move-btn[data-move="${baseMove}"]`);
        const primeBtn = document.getElementById('prime-toggle-btn');
        if (moveBtn) {
            moveBtn.classList.add('highlight');
            setTimeout(() => moveBtn.classList.remove('highlight'), 800);
        }
        if (isPrime && primeBtn) {
            primeBtn.classList.add('move-btn.highlight-prime');
            setTimeout(() => primeBtn.classList.remove('move-btn.highlight-prime'), 800);
        }
    }

    function setupEventListeners() {
        window.addEventListener('resize', onWindowResize, false);
        document.getElementById('shuffle-btn').addEventListener('click', () => {
            if (!isAnimating) {
                shuffleCube();
                if (typeof Android !== 'undefined' && Android.showInterstitialAd) {
                    Android.showInterstitialAd();
                }
            }
        });
        document.getElementById('reset-btn').addEventListener('click', () => { if (!isAnimating) resetCubeState(); });
        document.getElementById('undo-btn').addEventListener('click', undoLastMove);
        document.getElementById('hint-btn').addEventListener('click', showHint);

        document.querySelector('.difficulty-controls').addEventListener('click', e => {
            if (e.target.classList.contains('difficulty-btn') && !isAnimating) {
                const newDifficulty = e.target.dataset.difficulty;
                currentDifficulty = newDifficulty;
                document.querySelectorAll('.difficulty-btn').forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.difficulty === newDifficulty);
                });
                if (typeof Android !== 'undefined' && Android.showInterstitialAd) {
                    Android.showInterstitialAd();
                }
            }
        });

        const primeToggleBtn = document.getElementById('prime-toggle-btn');
        primeToggleBtn.addEventListener('click', () => {
            isPrimeMode = !isPrimeMode;
            primeToggleBtn.classList.toggle('active', isPrimeMode);
        });

        document.querySelector('.moves-grid').addEventListener('click', e => {
            if (e.target.classList.contains('move-btn')) {
                const baseMove = e.target.dataset.move;
                const finalMove = baseMove + (isPrimeMode ? "'" : "");
                performMove(finalMove);
            }
        });

        const instructionsBtn = document.getElementById('instructions-btn');
        const closeInstructionsBtn = document.getElementById('close-instructions-btn');
        const instructionsPanel = document.getElementById('instructions-panel');
        const overlay = document.getElementById('overlay');

        const openInstructions = () => {
            instructionsPanel.classList.add('show');
            overlay.classList.add('active');
        };
        const closeInstructions = () => {
            instructionsPanel.classList.remove('show');
            overlay.classList.remove('active');
        };

        instructionsBtn.addEventListener('click', openInstructions);
        closeInstructionsBtn.addEventListener('click', closeInstructions);
        overlay.addEventListener('click', closeInstructions);

        container.addEventListener('pointerdown', onPointerDown, { passive: false });
        container.addEventListener('pointermove', onPointerMove, { passive: false });
        container.addEventListener('pointerup', onPointerUp, { passive: false });
    }

    function onPointerDown(event) {
        if (isAnimating) return;
        const pointer = (event.touches) ? event.touches[0] : event;
        const mouseNDC = new THREE.Vector2((pointer.clientX / container.clientWidth) * 2 - 1, -(pointer.clientY / container.clientHeight) * 2 + 1);
        raycaster.setFromCamera(mouseNDC, camera);
        const intersects = raycaster.intersectObjects(cubies);

        if (intersects.length > 0) {
            event.preventDefault();
            controls.enabled = false;
            isDraggingOnCube = true;
            intersectedObject = intersects[0];
            helperPlane.position.copy(intersectedObject.point);
            helperPlane.lookAt(camera.position);
            dragStartPoint = getPlaneIntersect(mouseNDC);
            dragCurrentPoint.copy(dragStartPoint);
        }
    }

    function onPointerMove(event) {
        if (!isDraggingOnCube || isAnimating) return;
        event.preventDefault();
        const pointer = (event.touches) ? event.touches[0] : event;
        const mouseNDC = new THREE.Vector2((pointer.clientX / container.clientWidth) * 2 - 1, -(pointer.clientY / container.clientHeight) * 2 + 1);
        dragCurrentPoint = getPlaneIntersect(mouseNDC);
    }

    function onPointerUp() {
        controls.enabled = true;
        if (!isDraggingOnCube) return;
        isDraggingOnCube = false;

        const dragVector = dragCurrentPoint.clone().sub(dragStartPoint);
        if (dragVector.length() < 0.1) return;

        const move = determineMove(dragVector);
        if (move) performMove(move);
    }

    function getPlaneIntersect(mouseNDC) {
        raycaster.setFromCamera(mouseNDC, camera);
        const intersects = raycaster.intersectObject(helperPlane);
        return intersects[0] ? intersects[0].point : new THREE.Vector3();
    }

    function determineMove(dragVector) {
        const worldNormal = intersectedObject.face.normal.clone().applyQuaternion(intersectedObject.object.quaternion).round();
        const rotationAxis = new THREE.Vector3().crossVectors(worldNormal, dragVector).normalize().round();
        const dominantAxis = ['x', 'y', 'z'].find(axis => Math.abs(rotationAxis[axis]) > 0.5);

        if (!dominantAxis) return null;

        const layerPosition = intersectedObject.object.position[dominantAxis];
        const epsilon = 0.1;
        let face;
        if (dominantAxis === 'x') {
            if (layerPosition > epsilon) face = 'R'; else if (layerPosition < -epsilon) face = 'L'; else face = 'M';
        } else if (dominantAxis === 'y') {
            if (layerPosition > epsilon) face = 'U'; else if (layerPosition < -epsilon) face = 'D'; else face = 'E';
        } else {
            if (layerPosition > epsilon) face = 'F'; else if (layerPosition < -epsilon) face = 'B'; else face = 'S';
        }

        const checkVector = new THREE.Vector3().crossVectors(worldNormal, rotationAxis);
        const dot = dragVector.dot(checkVector);
        const isPrime = dot > 0;

        if (['L', 'D', 'B', 'M', 'E'].includes(face)) return face + (isPrime ? "" : "'");
        return face + (isPrime ? "'" : "");
    }

    function updateButtonStates() {
        const allButtons = document.querySelectorAll('button');
        allButtons.forEach(btn => btn.disabled = isAnimating);

        if (!isAnimating) {
            document.getElementById('undo-btn').disabled = moveHistory.length === 0;
            document.getElementById('hint-btn').disabled = isSolved || shuffleHistory.length === 0;
        }
    }

    function performMove(move, options = {}) {
        if (isAnimating) return;

        const { isUndo = false, isShuffle = false } = options;

        if (!isSolved && !isTimerRunning && !isShuffle) {
            startTimer();
        }

        if (!isUndo && !isShuffle) {
            moveHistory.push(move);
            if (shuffleHistory.length > 0) {
               const lastShuffleMove = shuffleHistory[shuffleHistory.length - 1];
               const reversedMove = lastShuffleMove.includes("'") ? lastShuffleMove.charAt(0) : lastShuffleMove + "'";
               if (move === reversedMove) {
                   shuffleHistory.pop();
               } else {
                   shuffleHistory = [];
               }
            }
        }

        isAnimating = true;
        updateButtonStates();

        clickSound.currentTime = 0;
        clickSound.play();
        const [face, isPrime] = move.includes("'") ? [move.charAt(0), true] : [move, false];
        let angle = (Math.PI / 2) * (isPrime ? -1 : 1);
        let axis, layerIndex;
        switch (face) {
            case 'U': axis = 'y'; layerIndex = 1; break; case 'E': axis = 'y'; layerIndex = 0; angle *= -1; break;
            case 'D': axis = 'y'; layerIndex = -1; angle *= -1; break; case 'R': axis = 'x'; layerIndex = 1; break;
            case 'M': axis = 'x'; layerIndex = 0; angle *= -1; break; case 'L': axis = 'x'; layerIndex = -1; angle *= -1; break;
            case 'F': axis = 'z'; layerIndex = 1; break; case 'S': axis = 'z'; layerIndex = 0; break;
            case 'B': axis = 'z'; layerIndex = -1; angle *= -1; break;
        }
        const pivot = new THREE.Group();
        scene.add(pivot);
        cubies.filter(c => Math.abs(c.position[axis] - layerIndex * CUBIE_UNIT_SIZE) < 0.1).forEach(c => pivot.attach(c));
        const duration = 250;
        const startTime = performance.now();
        function animateRotation() {
            const progress = Math.min((performance.now() - startTime) / duration, 1);
            const easedProgress = 0.5 * (1 - Math.cos(progress * Math.PI));
            pivot.rotation[axis] = angle * easedProgress;
            if (progress < 1) requestAnimationFrame(animateRotation);
            else {
                pivot.rotation[axis] = angle;
                pivot.updateWorldMatrix(true, true);
                while(pivot.children.length > 0) cube.attach(pivot.children[0]);
                scene.remove(pivot);
                isAnimating = false;
                if (!isShuffle) {
                    isSolved = false;
                    checkSolvedState();
                }
                updateButtonStates();
            }
        }
        animateRotation();
    }

    async function shuffleCube() {
        resetCubeState();
        isSolved = false;
        isAnimating = true;
        updateButtonStates();

        const moves = ['U','D','L','R','F','B'];
        const numShuffles = shuffleCounts[currentDifficulty];
        let lastMoveAxis = '';

        for (let i = 0; i < numShuffles; i++) {
            let randomMove;
            let currentMoveAxis;

            do {
                randomMove = moves[Math.floor(Math.random() * moves.length)];
                if (['U', 'D'].includes(randomMove)) currentMoveAxis = 'y';
                else if (['L', 'R'].includes(randomMove)) currentMoveAxis = 'x';
                else currentMoveAxis = 'z';
            } while (currentMoveAxis === lastMoveAxis);

            lastMoveAxis = currentMoveAxis;
            if (Math.random() > 0.5) randomMove += "'";

            shuffleHistory.push(randomMove);
            await new Promise(res => rotateFaceAsync(randomMove, res));
        }
        isAnimating = false;
        updateButtonStates();
    }

    function rotateFaceAsync(move, onComplete) {
        const [face, isPrime] = move.includes("'") ? [move.charAt(0), true] : [move, false];
        let angle = (Math.PI / 2) * (isPrime ? -1 : 1);
        let axis, layerIndex;
        switch (face) {
            case 'U': axis = 'y'; layerIndex = 1; break; case 'D': axis = 'y'; layerIndex = -1; angle *= -1; break;
            case 'R': axis = 'x'; layerIndex = 1; break; case 'L': axis = 'x'; layerIndex = -1; angle *= -1; break;
            case 'F': axis = 'z'; layerIndex = 1; break; case 'B': axis = 'z'; layerIndex = -1; angle *= -1; break;
        }
        const pivot = new THREE.Group();
        scene.add(pivot);
        cubies.filter(c => Math.abs(c.position[axis] - layerIndex * CUBIE_UNIT_SIZE) < 0.1).forEach(c => pivot.attach(c));
        pivot.rotation[axis] = angle;
        pivot.updateWorldMatrix(true, true);
        while(pivot.children.length > 0) cube.attach(pivot.children[0]);
        scene.remove(pivot);
        if (onComplete) onComplete();
    }

    function checkSolvedState() {
        if (isSolved) return;
        const epsilon = 0.01;
        for (const cubie of cubies) {
            const initialPos = cubie.userData.initialPosition;
            const currentPos = cubie.position;
            if (Math.abs(initialPos.x - currentPos.x) > epsilon ||
                Math.abs(initialPos.y - currentPos.y) > epsilon ||
                Math.abs(initialPos.z - currentPos.z) > epsilon ||
                !cubie.quaternion.equals(cubie.userData.initialQuaternion)) {
                return;
            }
        }
        isSolved = true;
        stopTimer();
        showSolvedPopup();
        moveHistory = [];
        shuffleHistory = [];
        updateButtonStates();
    }

    function showSolvedPopup() {
        finalTimeElem.textContent = `Your time: ${timerDisplay.textContent}`;
        timerDisplay.style.color = 'var(--success-color)';
        solvedPopup.classList.add('show');
        setTimeout(() => {
            solvedPopup.classList.remove('show');
        }, 4000);
    }

    function onWindowResize() {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    }

    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    }

    init();
});
