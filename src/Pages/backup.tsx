import { useRef, useEffect, useState, FC } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { PMREMGenerator } from 'three';

interface ModelViewerProps {
  modelPath?: string;
}

const ModelViewer: FC<ModelViewerProps> = ({ modelPath = '/assets/Mezz-new.glb' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const modelRef = useRef<THREE.Group | null>(null);
  const directionalLightRef = useRef<THREE.DirectionalLight | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [_hoveredMeshName, setHoveredMeshName] = useState<string | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const mouseMoveListenerAttachedRef = useRef<boolean>(false);
  const lastHighlightChangeRef = useRef<number>(0);
  const autoRotateRef = useRef<boolean>(true);
  const userInteractedRef = useRef<boolean>(false);
  const modelCenterRef = useRef<THREE.Vector3 | null>(null);
  const initialCameraPositionRef = useRef<THREE.Vector3 | null>(null);
  const initialTargetRef = useRef<THREE.Vector3 | null>(null);
  const frameCountRef = useRef<number>(0);

  // Maps to store target meshes and their original materials
  const targetMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const originalMaterialsRef = useRef<Map<string, THREE.Material | THREE.Material[]>>(new Map());
  const highlightMaterialRef = useRef<THREE.Material | null>(null);
  const currentlyHighlightedMeshRef = useRef<THREE.Mesh | null>(null);
  
  const getTargetNumber = (name: string): number | null => {
    const endMatch = name.match(/_(\d+)$/);
    if (endMatch && endMatch[1]) {
      const num = parseInt(endMatch[1], 10);
      if (num >= 1 && num <= 69) return num;
    }
    
    const complexMatch = name.match(/Mesh\d+_(\d+)/);
    if (complexMatch && complexMatch[1]) {
      const num = parseInt(complexMatch[1], 10);
      if (num >= 1 && num <= 69) return num;
    }
    
    const anyNumberMatch = name.match(/\b([1-9]|[1-5][0-9]|6[0-9])\b/);
    if (anyNumberMatch && anyNumberMatch[1]) {
      const num = parseInt(anyNumberMatch[1], 10);
      if (num >= 1 && num <= 69) return num;
    }
    
    return null;
  };
  
  const isTargetMesh = (name: string): boolean => {
    const targetNum = getTargetNumber(name);
    return targetNum !== null && targetNum >= 1 && targetNum <= 69;
  };

  const checkIntersection = () => {
    if (!cameraRef.current || targetMeshesRef.current.size === 0) return;
    
    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
    
    const targetMeshes = Array.from(targetMeshesRef.current.values());
    
    raycasterRef.current.params.Mesh = { 
      threshold: 0.01
    };
    
    const intersects = raycasterRef.current.intersectObjects(targetMeshes, false);
    
    const currentTime = Date.now();
    const debounceTime = 100;
    
    if (intersects.length === 0) {
      if (currentlyHighlightedMeshRef.current && 
          (currentTime - lastHighlightChangeRef.current > debounceTime)) {
        const originalMaterial = originalMaterialsRef.current.get(currentlyHighlightedMeshRef.current.uuid);
        if (originalMaterial) {
          currentlyHighlightedMeshRef.current.material = originalMaterial;
        }
        currentlyHighlightedMeshRef.current = null;
        setHoveredMeshName(null);
        lastHighlightChangeRef.current = currentTime;
      }
      return;
    }
    
    const firstIntersect = intersects[0];
    if (!firstIntersect || !firstIntersect.object) return;
    
    const mesh = firstIntersect.object as THREE.Mesh;
    
    if (currentlyHighlightedMeshRef.current === mesh) return;
    
    if (currentTime - lastHighlightChangeRef.current < debounceTime) return;
    
    if (currentlyHighlightedMeshRef.current) {
      const originalMaterial = originalMaterialsRef.current.get(currentlyHighlightedMeshRef.current.uuid);
      if (originalMaterial) {
        currentlyHighlightedMeshRef.current.material = originalMaterial;
      }
    }
    
    currentlyHighlightedMeshRef.current = mesh;
    
    const targetNum = getTargetNumber(mesh.name);
    if (targetNum !== null) {
      setHoveredMeshName(targetNum.toString());
    } else {
      setHoveredMeshName(mesh.name);
    }
    
    if (highlightMaterialRef.current) {
      if (!originalMaterialsRef.current.has(mesh.uuid)) {
        originalMaterialsRef.current.set(mesh.uuid, mesh.material);
      }
      
      mesh.material = highlightMaterialRef.current;
    }
    
    lastHighlightChangeRef.current = currentTime;
  };

  const setupMouseEvents = () => {
    const container = containerRef.current;
    if (!container || mouseMoveListenerAttachedRef.current) return;
    
    const onMouseMove = (event: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };
    
    const onUserInteraction = () => {
      userInteractedRef.current = true;
      autoRotateRef.current = false;
    };
    
    container.addEventListener('mousemove', onMouseMove);
    
    container.addEventListener('mousedown', onUserInteraction);
    container.addEventListener('wheel', onUserInteraction);
    container.addEventListener('touchstart', onUserInteraction);
    mouseMoveListenerAttachedRef.current = true;
    
    return () => {
      container.removeEventListener('mousemove', onMouseMove);
      container.removeEventListener('mousedown', onUserInteraction);
      container.removeEventListener('wheel', onUserInteraction);
      container.removeEventListener('touchstart', onUserInteraction);
      mouseMoveListenerAttachedRef.current = false;
    };
  };
  
  const resetCameraView = () => {
    if (!controlsRef.current || !cameraRef.current) return;
    
    if (initialCameraPositionRef.current && initialTargetRef.current) {
      const controls = controlsRef.current;
      const camera = cameraRef.current;
      
      const startPosition = camera.position.clone();
      const startTarget = controls.target.clone();
      
      const endPosition = initialCameraPositionRef.current.clone();
      const endTarget = initialTargetRef.current.clone();
      
      const duration = 1000;
      const startTime = Date.now();
      
      const wasAutoRotating = autoRotateRef.current;
      autoRotateRef.current = false;
      
      const animateReset = () => {
        const now = Date.now();
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
        const easedProgress = easeOut(progress);
        
        camera.position.lerpVectors(startPosition, endPosition, easedProgress);
        controls.target.lerpVectors(startTarget, endTarget, easedProgress);
        controls.update();
        
        if (progress < 1) {
          requestAnimationFrame(animateReset);
        } else {
          autoRotateRef.current = wasAutoRotating;
        }
      };
      
      animateReset();
      
      userInteractedRef.current = true;
    } else if (modelCenterRef.current) {
      controlsRef.current.target.copy(modelCenterRef.current);
      controlsRef.current.update();
    }
  };

  const updateControlTargetBasedOnView = () => {
    if (!cameraRef.current || !controlsRef.current || !sceneRef.current) return;
    
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    
    const direction = new THREE.Vector3(0, 0, -1);
    direction.applyQuaternion(camera.quaternion);
    
    const raycaster = new THREE.Raycaster(camera.position, direction);
    
    const meshes: THREE.Mesh[] = [];
    sceneRef.current.traverse((object) => {
      if ((object as THREE.Mesh).isMesh) {
        meshes.push(object as THREE.Mesh);
      }
    });
    
    const intersects = raycaster.intersectObjects(meshes, false);
    
    if (intersects.length > 0) {
      const intersection = intersects[0];
      if (!intersection) return; 
      
      const distanceToObject = intersection.distance;
      const distanceToTarget = camera.position.distanceTo(controls.target);
      const closeToWall = distanceToObject < 1.5;
      
      if (closeToWall || distanceToObject < distanceToTarget * 0.6) {
        const newTargetDistance = Math.min(distanceToObject * 0.7, distanceToTarget);
        
        const newTarget = camera.position.clone().add(
          direction.clone().multiplyScalar(newTargetDistance)
        );
        
        let dampingFactor = 0.05;
        if (closeToWall) {
          dampingFactor = 0.03;
        }
        
        controls.target.lerp(newTarget, dampingFactor);
        controls.update();
      }
    }
  };
  
  const adjustControlsBasedOnZoomLevel = () => {
    if (!cameraRef.current || !controlsRef.current || !modelCenterRef.current) return;
    
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const modelCenter = modelCenterRef.current;
    
    const distanceToModel = camera.position.distanceTo(modelCenter);
    const distanceToTarget = camera.position.distanceTo(controls.target);
    
    let modelSize = 10;
    if (modelRef.current) {
      const box = new THREE.Box3().setFromObject(modelRef.current);
      const size = box.getSize(new THREE.Vector3());
      modelSize = Math.max(size.x, size.y, size.z);
    }
    
    const farZoomThreshold = modelSize * 0.85;
    const midZoomThreshold = modelSize * 0.45;
    const closeZoomThreshold = modelSize * 0.25;
    const veryCloseZoomThreshold = modelSize * 0.15;
    
    if (distanceToModel > farZoomThreshold) {
      controls.rotateSpeed = 0.7;
      controls.dampingFactor = 0.05;
      controls.panSpeed = 0.8;
    } 
    else if (distanceToModel > midZoomThreshold) {
      controls.rotateSpeed = 0.65;
      controls.dampingFactor = 0.07;
      controls.panSpeed = 0.7;
    }
    else if (distanceToModel > closeZoomThreshold) {
      controls.rotateSpeed = 0.55;
      controls.dampingFactor = 0.12;
      controls.panSpeed = 0.6;
    }
    else if (distanceToModel > veryCloseZoomThreshold) {
      controls.rotateSpeed = 0.4;
      controls.dampingFactor = 0.25;
      controls.panSpeed = 0.4;
    }
    else {
      controls.rotateSpeed = 0.3;
      controls.dampingFactor = 0.35;
      controls.panSpeed = 0.25;
    }
    
    if (distanceToTarget < closeZoomThreshold * 0.3) {
      const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      const newTargetDistance = Math.max(distanceToTarget, 0.6);
      const newTarget = camera.position.clone().add(direction.multiplyScalar(newTargetDistance));
      
      controls.target.lerp(newTarget, 0.06);
    }
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    targetMeshesRef.current.clear();
    originalMaterialsRef.current.clear();
    currentlyHighlightedMeshRef.current = null;
    setHoveredMeshName(null);
    userInteractedRef.current = false;
    autoRotateRef.current = true;

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0xf5f5f5);

    const camera = new THREE.PerspectiveCamera(
      55,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    camera.position.set(5, 8, 15);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      precision: 'mediump',
      alpha: true,
      stencil: true
    });
    rendererRef.current = renderer;
    renderer.setSize(container.clientWidth, container.clientHeight);
    
    const pixelRatio = Math.min(window.devicePixelRatio, 1.5); // Reduced pixel ratio
    renderer.setPixelRatio(pixelRatio);
    
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.5;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controlsRef.current = controls;
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = true;
    controls.maxPolarAngle = Math.PI / 2.60;
    controls.minDistance = 0.8;
    controls.maxDistance = 20.0;
    controls.zoomSpeed = 0.8;
    controls.rotateSpeed = 0.7;
    controls.enableZoom = true;
    controls.panSpeed = 0.8;
    const minTargetY = -12.2; 
    
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN
    };
    
    const enforceMinimumTargetY = () => {
      if (controlsRef.current && controlsRef.current.target.y < minTargetY) {
        controlsRef.current.target.y = minTargetY;
      }
    };
    
    controls.addEventListener('start', () => {
      userInteractedRef.current = true;
      autoRotateRef.current = false;
    });
    
    controls.addEventListener('change', () => {
      enforceMinimumTargetY();
      if (cameraRef.current && controlsRef.current) {
        adjustControlsBasedOnZoomLevel();
      }
    });
    
    controls.update();

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 1.0);
    mainLight.position.set(15, 20, 15);
    mainLight.castShadow = true;
    
    // Optimize shadow map resolution
    mainLight.shadow.mapSize.width = 1024; // Reduced from 2048
    mainLight.shadow.mapSize.height = 1024; // Reduced from 2048
    mainLight.shadow.camera.near = 0.5;
    mainLight.shadow.camera.far = 100;
    mainLight.shadow.camera.left = -25;
    mainLight.shadow.camera.right = 25;
    mainLight.shadow.camera.top = 25;
    mainLight.shadow.camera.bottom = -25;
    mainLight.shadow.bias = -0.0005;
    
    directionalLightRef.current = mainLight;
    scene.add(mainLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
    fillLight.position.set(-15, 10, -15);
    scene.add(fillLight);

    const groundGeometry = new THREE.PlaneGeometry(200, 200);
    const groundMaterial = new THREE.ShadowMaterial({ opacity: 0.8 });
    groundMaterial.color = new THREE.Color(0x000000);
    const groundPlane = new THREE.Mesh(groundGeometry, groundMaterial);
    groundPlane.rotation.x = -Math.PI / 2;
    groundPlane.position.y = -0.1;
    groundPlane.receiveShadow = true;
    scene.add(groundPlane);

    const highlightMaterial = new THREE.MeshStandardMaterial({
      color: 0xFFECB3,
      emissive: 0xFFD54F,
      emissiveIntensity: 0.5,
      roughness: 0.5,
      metalness: 0.8,
      transparent: false,
      opacity: 1.0,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      side: THREE.FrontSide,
      depthWrite: true,
      depthTest: true,
      clipShadows: true
    });
    
    highlightMaterialRef.current = highlightMaterial;

    const cleanupMouseEvents = setupMouseEvents();

    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.5/');
    dracoLoader.setDecoderConfig({ type: 'js' });

    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);
    
    let introAnimation = true;
    let animationStartTime = 0;
    const animationDuration = 1500;

    const loadManager = new THREE.LoadingManager();
    loadManager.onProgress = (_, loaded, total) => {
      if (total > 0) {
        const progress = Math.min(Math.floor((loaded / total) * 100), 100);
        setLoadingProgress(progress);
      }
    };
    
    loader.manager = loadManager;
    
    loader.load(
      modelPath,
      (gltf: GLTF) => {
        const model = gltf.scene;
        modelRef.current = model;

        const box = new THREE.Box3().setFromObject(model);
        const center = new THREE.Vector3();
        box.getCenter(center);
        
        modelCenterRef.current = center.clone();
        
        model.position.sub(center);
        
        const size = box.getSize(new THREE.Vector3()).length();
        const baseScale = 12 / size;
        const extraZoom = 1.8;
        const scale = baseScale * extraZoom;
        model.scale.set(scale, scale, scale);
        
        model.rotation.y = 0;

        targetMeshesRef.current.clear();
        originalMaterialsRef.current.clear();
        
        // Optimize model traversal
        model.traverse((child: THREE.Object3D) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            
            // Only enable shadows on larger objects
            if (mesh.geometry && mesh.geometry.boundingSphere && mesh.geometry.boundingSphere.radius > 0.5) {
              mesh.castShadow = true;
              mesh.receiveShadow = true;
            }
            
            mesh.frustumCulled = true;
            
            if (Array.isArray(mesh.material)) {
              mesh.material.forEach((mat) => {
                if (mat.isMaterial) {
                  mat.polygonOffset = true;
                  mat.polygonOffsetFactor = 0.1;
                  mat.polygonOffsetUnits = 0.1;
                }
              });
            } else if (mesh.material && mesh.material.isMaterial) {
              mesh.material.polygonOffset = true;
              mesh.material.polygonOffsetFactor = 0.1;
              mesh.material.polygonOffsetUnits = 0.1;
            }
            
            if (isTargetMesh(child.name)) {
              targetMeshesRef.current.set(child.name, mesh);
              originalMaterialsRef.current.set(child.uuid, mesh.material);
            }
            
            if (mesh.geometry) {
              mesh.geometry.computeBoundingBox();
              mesh.geometry.computeBoundingSphere();
            }
            
            // Optimize materials
            if (Array.isArray(mesh.material)) {
              mesh.material.forEach((mat, index) => {
                if ((mat as THREE.MeshBasicMaterial).isMeshBasicMaterial) {
                  const basicMat = mat as THREE.MeshBasicMaterial;
                  const newMat = new THREE.MeshStandardMaterial({
                    color: basicMat.color,
                    map: basicMat.map,
                    transparent: basicMat.transparent,
                    opacity: basicMat.opacity,
                    roughness: 0.7,
                    metalness: 0.0
                  });
                  (mesh.material as THREE.Material[])[index] = newMat;
                }
              });
            } else if ((mesh.material as THREE.MeshBasicMaterial).isMeshBasicMaterial) {
              const basicMat = mesh.material as THREE.MeshBasicMaterial;
              const newMat = new THREE.MeshStandardMaterial({
                color: basicMat.color,
                map: basicMat.map,
                transparent: basicMat.transparent,
                opacity: basicMat.opacity,
                roughness: 0.7,
                metalness: 0.0
              });
              mesh.material = newMat;
            }
          }
        });

        scene.add(model);

        const boundingBox = new THREE.Box3().setFromObject(model);
        const boundingSphere = new THREE.Sphere();
        boundingBox.getBoundingSphere(boundingSphere);
        
        controls.target.copy(boundingSphere.center);
        
        const radius = boundingSphere.radius;
        
        camera.position.set(
          boundingSphere.center.x,
          boundingSphere.center.y + radius * 0.4,
          boundingSphere.center.z + radius * 1.3
        );
        
        const initialCameraPosition = camera.position.clone();
        initialCameraPositionRef.current = initialCameraPosition.clone();
        
        const targetCameraPosition = new THREE.Vector3(
          boundingSphere.center.x,
          boundingSphere.center.y + radius * 0.5,
          boundingSphere.center.z + radius * 1.6
        );
        
        initialTargetRef.current = boundingSphere.center.clone();

        if (directionalLightRef.current) {
          const light = directionalLightRef.current;
          const lightRadius = boundingSphere.radius * 2.5;
          light.position.set(
            boundingSphere.center.x + lightRadius,
            boundingSphere.center.y + radius * 1.5,
            boundingSphere.center.z + lightRadius
          );
          const targetObject = new THREE.Object3D();
          targetObject.position.copy(boundingSphere.center);
          scene.add(targetObject);
          light.target = targetObject;
          
          const shadowCameraSize = radius * 2;
          light.shadow.camera.left = -shadowCameraSize;
          light.shadow.camera.right = shadowCameraSize;
          light.shadow.camera.top = shadowCameraSize;
          light.shadow.camera.bottom = -shadowCameraSize;
          light.shadow.camera.updateProjectionMatrix();
        }

        controls.update();

        // Simplified environment map
        const pmremGenerator = new PMREMGenerator(renderer);
        pmremGenerator.compileEquirectangularShader();
        const cubeRenderTarget = pmremGenerator.fromScene(new THREE.Scene());
        scene.environment = cubeRenderTarget.texture;
        pmremGenerator.dispose();

        setIsLoading(false);
        introAnimation = true;
        animationStartTime = Date.now();
        
        if (model) {
          model.rotation.y = 0;
        }

        const handleDoubleClick = () => {
          resetCameraView();
        };
        
        container.addEventListener('dblclick', handleDoubleClick);

        // Optimized animation loop with frame skipping
        const animate = () => {
          animationFrameRef.current = requestAnimationFrame(animate);
          
          // Skip frames for better performance (render only every 2nd frame during rotation)
          if (autoRotateRef.current && !userInteractedRef.current) {
            frameCountRef.current++;
            if (frameCountRef.current % 2 !== 0) {
              return;
            }
          }
          
          if (introAnimation) {
            const elapsed = Date.now() - animationStartTime;
            const progress = Math.min(elapsed / animationDuration, 1);
            const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
            const easedProgress = easeOutCubic(progress);
            
            camera.position.lerpVectors(
              initialCameraPosition,
              targetCameraPosition,
              easedProgress
            );
            
            if (progress >= 1) {
              introAnimation = false;
              controls.enabled = true;
              initialCameraPositionRef.current = camera.position.clone();
              autoRotateRef.current = true;
            } else {
              controls.enabled = false;
            }
          } else if (model && autoRotateRef.current && !userInteractedRef.current) {
            model.rotation.y += 0.001;
          }

          if (!introAnimation) {
            adjustControlsBasedOnZoomLevel();
            
            // Reduce frequency of target updates (only ~2% of frames)
            if (Math.random() < 0.02 && 
                controlsRef.current && 
                cameraRef.current && 
                cameraRef.current.position.distanceTo(controlsRef.current.target) > controls.minDistance * 1.2) {
              updateControlTargetBasedOnView();
            }
          }
          
          controls.update();
          enforceMinimumTargetY();
          
          // Only check intersections when mouse is moving (tracked via event listener)
          if (mouseMoveListenerAttachedRef.current) {
            checkIntersection();
          }
          
          renderer.render(scene, camera);
        };

        if (animationFrameRef.current !== null) {
          cancelAnimationFrame(animationFrameRef.current);
        }

        animate();

        return () => {
          container.removeEventListener('dblclick', handleDoubleClick);
        };
      },
      (xhr: ProgressEvent<EventTarget>) => {
        if (xhr.total) {
          const progress = Math.min(Math.floor((xhr.loaded / xhr.total) * 100), 100);
          setLoadingProgress(progress);
        }
      },
      (error: any) => {
        console.error('Model loading error:', error);
        setIsLoading(false);
      }
    );

    // Lower frame rate for preload animation
    let lastFrameTime = 0;
    const targetFPS = 24; // Reduced from 30
    const frameInterval = 1000 / targetFPS;
    
    const animatePreload = (currentTime: number) => {
      animationFrameRef.current = requestAnimationFrame(animatePreload);
      
      const deltaTime = currentTime - lastFrameTime;
      if (deltaTime < frameInterval) return;
      
      lastFrameTime = currentTime - (deltaTime % frameInterval);
      controls.update();
      renderer.render(scene, camera);
    };
    
    animationFrameRef.current = requestAnimationFrame(animatePreload);

    // Throttled resize handler
    let resizeTimeout: number;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = window.setTimeout(() => {
        if (!container) return;
        
        const width = container.clientWidth;
        const height = container.clientHeight;
        
        if (cameraRef.current) {
          cameraRef.current.aspect = width / height;
          cameraRef.current.updateProjectionMatrix();
        }
        
        if (rendererRef.current) {
          rendererRef.current.setSize(width, height);
        }
      }, 100); // 100ms throttle
    };
    
    window.addEventListener('resize', handleResize);

    return () => {
      if (cleanupMouseEvents) cleanupMouseEvents();
      
      window.removeEventListener('resize', handleResize);
      clearTimeout(resizeTimeout);
      
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      
      if (controlsRef.current) {
        controlsRef.current.dispose();
        controlsRef.current = null;
      }
      
      if (currentlyHighlightedMeshRef.current) {
        const originalMaterial = originalMaterialsRef.current.get(currentlyHighlightedMeshRef.current.uuid);
        if (originalMaterial) {
          currentlyHighlightedMeshRef.current.material = originalMaterial;
        }
        currentlyHighlightedMeshRef.current = null;
      }
      
      if (rendererRef.current) {
        rendererRef.current.dispose();
        rendererRef.current.forceContextLoss();
        if (container.contains(rendererRef.current.domElement)) {
          container.removeChild(rendererRef.current.domElement);
        }
        rendererRef.current = null;
      }
      
      if (sceneRef.current) {
        sceneRef.current.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            if (child.geometry) {
              child.geometry.dispose();
            }
            
            if (Array.isArray(child.material)) {
              child.material.forEach((material) => {
                if (material.map) material.map.dispose();
                material.dispose();
              });
            } else if (child.material) {
              if (child.material.map) child.material.map.dispose();
              child.material.dispose();
            }
          }
        });
        
        if (sceneRef.current.environment) {
          sceneRef.current.environment.dispose();
          sceneRef.current.environment = null;
        }
        
        sceneRef.current.clear();
        sceneRef.current = null;
      }
      
      if (highlightMaterialRef.current) {
        (highlightMaterialRef.current as THREE.Material).dispose();
        highlightMaterialRef.current = null;
      }
      
      if (dracoLoader) dracoLoader.dispose();
      targetMeshesRef.current.clear();
      originalMaterialsRef.current.clear();
      modelRef.current = null;
      directionalLightRef.current = null;
      cameraRef.current = null;
      modelCenterRef.current = null;
      initialCameraPositionRef.current = null;
      initialTargetRef.current = null;
    };
  }, [modelPath]);

  useEffect(() => {
    const cleanupMouseEvents = setupMouseEvents();
    return cleanupMouseEvents;
  }, [isLoading]);

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        height: '100vh',
        backgroundColor: '#F5F5F5',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          top: 0,
          left: 0
        }}
      />
      {isLoading && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            zIndex: 10
          }}
        >
          <div className="custom-loader">
            <div className="circle-segment segment-1"></div>
            <div className="circle-segment segment-2"></div>
            <div className="circle-segment segment-3"></div>
            <div className="circle-segment segment-4"></div>
          </div>
          <p style={{ 
            color: '#333', 
            fontSize: '16px', 
            fontWeight: '500',
            marginTop: '25px',
            fontFamily: 'Arial, sans-serif'
          }}>
            Loading 3D Model... {loadingProgress}%
          </p>
          <div style={{ 
            width: '240px', 
            height: '6px', 
            backgroundColor: '#e0e0e0', 
            borderRadius: '3px',
            overflow: 'hidden',
            marginTop: '8px'
          }}>
            <div style={{ 
              width: `${loadingProgress}%`, 
              height: '100%', 
              backgroundColor: '#e53935',
              borderRadius: '3px',
              transition: 'width 0.3s ease-in-out'
            }} />
          </div>
          <style>
            {`
              .custom-loader {
                position: relative;
                width: 80px;
                height: 80px;
                animation: rotate 2s linear infinite;
              }
              
              .circle-segment {
                position: absolute;
                width: 45%;
                height: 45%;
                border-radius: 50%;
                background-color: #e53935;
              }
              
              .segment-1 {
                top: 0;
                left: 0;
              }
              
              .segment-2 {
                top: 0;
                right: 0;
              }
              
              .segment-3 {
                bottom: 0;
                right: 0;
              }
              
              .segment-4 {
                bottom: 0;
                left: 0;
              }
              
              @keyframes rotate {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            `}
          </style>
        </div>
      )}
      
      {!isLoading && (
        <div style={{
          position: 'absolute',
          bottom: '20px',
          right: '20px',
          padding: '10px 15px',
          color: '#333333',
          borderRadius: '5px',
          fontSize: '13px',
          fontFamily: 'Arial, sans-serif',
          fontWeight: '500',
          zIndex: 10,
          pointerEvents: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <span style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ fontWeight: 'bold', marginRight: '5px' }}>Left-click:</span> Rotate
          </span>
          <span style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ fontWeight: 'bold', marginRight: '5px' }}>Right-click:</span> Pan
          </span>
          <span style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ fontWeight: 'bold', marginRight: '5px' }}>Scroll:</span> Zoom
          </span>
          <span style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ fontWeight: 'bold', marginRight: '5px' }}>Double-click:</span> Reset View
          </span>
        </div>
      )}
    </div>
  );
};

export default ModelViewer;