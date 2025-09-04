import { useRef, useEffect, useState, FC } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import image3 from "../assets/img-3.png";
import image4 from "../assets/img-4.png";
import image5 from "../assets/furniture.png"; // Add new image for with furniture option
import { PMREMGenerator } from 'three';

interface IndividualModelViewerProps {
  initialModelPath?: string;
}

const IndividualModelViewer: FC<IndividualModelViewerProps> = () => {
  // Updated variant type to include 'furniture' option
  const { variant = 'with', unitId } = useParams<{ variant: string, unitId: string }>();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const modelRef = useRef<THREE.Group | null>(null);
  const directionalLightRef = useRef<THREE.DirectionalLight | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const autoRotateRef = useRef<boolean>(true);
  const userInteractedRef = useRef<boolean>(false);
  const modelCenterRef = useRef<THREE.Vector3 | null>(null);
  const initialCameraPositionRef = useRef<THREE.Vector3 | null>(null);
  const initialTargetRef = useRef<THREE.Vector3 | null>(null);
  const modelBoundsRef = useRef<THREE.Box3 | null>(null);
  const modelSizeRef = useRef<number>(1);
  const groundPlaneRef = useRef<THREE.Mesh | null>(null);
  const buttonClickTimeRef = useRef<number>(0);
  const modelLoadingAttemptRef = useRef<number>(0);
  const modelLoaderRef = useRef<GLTFLoader | null>(null);
  const dracoLoaderRef = useRef<DRACOLoader | null>(null);

  // Camera orbit params
  const cameraOrbitRadiusRef = useRef<number>(12);
  const cameraOrbitHeightRef = useRef<number>(5);
  
  // Add a ref to track whether the component is mounted
  const isMountedRef = useRef<boolean>(true);
  
  // Add a timeout ref to delay initial loading
  const initialLoadTimeoutRef = useRef<number | null>(null);

  // Validate unit number is between 1-67
  const validateUnitNumber = (unitNumber: string): boolean => {
    const unitNum = parseInt(unitNumber, 10);
    return !isNaN(unitNum) && unitNum >= 1 && unitNum <= 67;
  };

  // Updated getUnitModelPath function to handle furniture variant with fallbacks
  const getUnitModelPath = (unitNumber: string, variantType: string): string => {
    // Ensure unit number is valid
    if (!validateUnitNumber(unitNumber)) {
      console.warn(`Invalid unit number: ${unitNumber}, using default model`);
      // Return default model path
      if (variantType === 'furniture') {
        return '/assets/Unit_01/Furniture.glb';
      } else if (variantType === 'without') {
        return '/assets/Unit_01/Without_Mezzanine.glb';
      } else {
        return '/assets/Unit_01/Mezzanine.glb';
      }
    }
    
    // Format unit number with leading zero for units 1-9
    const formattedUnitNum = parseInt(unitNumber, 10) < 10 ? `0${unitNumber}` : `${unitNumber}`;
    
    // For all other units, use consistent path structure
    if (variantType === 'furniture') {
      return `/assets/Unit_${formattedUnitNum}/Furniture.glb`;
    } else if (variantType === 'without') {
      return `/assets/Unit_${formattedUnitNum}/Without_Mezzanine.glb`;
    } else {
      return `/assets/Unit_${formattedUnitNum}/Mezzanine.glb`;
    }
  };
  
  // Helper: get model path from variant
  const getModelPath = () => {
    if (!unitId) {
      if (variant === 'furniture') {
        return '/assets/Unit_01/Furniture.glb';
      } else if (variant === 'without') {
        return '/assets/Unit_01/Without_Mezzanine.glb';
      } else {
        return '/assets/Unit_01/Mezzanine.glb';
      }
    }
    
    return getUnitModelPath(unitId, variant);
  };

  // Define fallback paths for each unit and variant
  const getFallbackPath = (attemptedUnitId: string, attemptedVariant: string): string => {
    // First fallback: Try Unit 01 with the same variant
    if (attemptedUnitId !== '1') {
      if (attemptedVariant === 'furniture') {
        return '/assets/Unit_01/Furniture.glb';
      } else if (attemptedVariant === 'without') {
        return '/assets/Unit_01/Without_Mezzanine.glb';
      } else {
        return '/assets/Unit_01/Mezzanine.glb';
      }
    }
    
    // Second fallback: Try a different variant of the same unit
    if (attemptedVariant === 'furniture') {
      return `/assets/Unit_${attemptedUnitId === '1' ? '01' : attemptedUnitId}/Mezzanine.glb`;
    } else if (attemptedVariant === 'without') {
      return `/assets/Unit_${attemptedUnitId === '1' ? '01' : attemptedUnitId}/Mezzanine.glb`;
    } else {
      return `/assets/Unit_${attemptedUnitId === '1' ? '01' : attemptedUnitId}/Without_Mezzanine.glb`;
    }
    
    // Ultimate fallback would be the base model path
  };

  const [currentModelPath, setCurrentModelPath] = useState<string>(getModelPath());
  // Updated activeModelButton logic to handle furniture option
  const [activeModelButton, setActiveModelButton] = useState<string>(
    variant === 'furniture' ? 'withFurniture' :
    variant === 'without' ? 'withoutMezzanine' : 'withMezzanine'
  );
  
  // Update model path when variant changes
  useEffect(() => {
    setCurrentModelPath(getModelPath());
    setActiveModelButton(
      variant === 'furniture' ? 'withFurniture' :
      variant === 'without' ? 'withoutMezzanine' : 'withMezzanine'
    );
    // Reset loading error when changing models
    setLoadingError(null);
    
    // Reset the loading state when changing models
    setIsLoading(true);
    setLoadingProgress(0);
    modelLoadingAttemptRef.current = 0;
  }, [variant, unitId]);

  // Function to create or update ground plane - unchanged
  const setupGroundPlane = (model: THREE.Group) => {
    if (!sceneRef.current) return;
    if (groundPlaneRef.current && sceneRef.current.getObjectById(groundPlaneRef.current.id)) {
      sceneRef.current.remove(groundPlaneRef.current);
      groundPlaneRef.current = null;
    }
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = new THREE.Vector3();
    box.getCenter(center);
    const groundSize = Math.max(size.x, size.z) * 3;
    const groundGeometry = new THREE.PlaneGeometry(groundSize, groundSize);
    const groundMaterial = new THREE.ShadowMaterial({ opacity: 0.22, color: 0x000000 });
    const groundPlane = new THREE.Mesh(groundGeometry, groundMaterial);
    groundPlane.rotation.x = -Math.PI / 2;
    groundPlane.position.y = box.min.y - 0.01;
    groundPlane.position.x = center.x;
    groundPlane.position.z = center.z;
    groundPlane.receiveShadow = true;
    sceneRef.current.add(groundPlane);
    groundPlaneRef.current = groundPlane;
  };

  // Updated changeModel function with enhanced debouncing and error clearing
  const changeModel = (_modelPath: string, buttonId: string, newVariant: string) => {
    const now = Date.now();
    if (now - buttonClickTimeRef.current < 500) return;
    if (activeModelButton === buttonId) return;
    
    buttonClickTimeRef.current = now;
    setIsLoading(true);
    setLoadingProgress(0);
    setLoadingError(null);
    modelLoadingAttemptRef.current = 0;
    
    // Keep the same unit ID when switching variants
    navigate(`/individual/${newVariant}/${unitId}`);
  };

  // Create a function to initialize the loader - FIX: better draco loader initialization
  const initializeLoader = () => {
    // Setup Draco loader - FIX: Create only once and store in ref
    if (!dracoLoaderRef.current) {
      const dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath('https://unpkg.com/three@0.159.0/examples/jsm/libs/draco/');
      dracoLoader.setDecoderConfig({ type: 'js' });
      dracoLoaderRef.current = dracoLoader;
    }
    
    // Setup KTX2 loader
    const ktx2Loader = new KTX2Loader();
    ktx2Loader.setTranscoderPath('https://unpkg.com/three@0.159.0/examples/jsm/libs/basis/');
    if (rendererRef.current) {
      ktx2Loader.detectSupport(rendererRef.current);
    }
    
    // Create and setup GLTF loader
    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoaderRef.current);
    loader.setKTX2Loader(ktx2Loader);
    loader.setMeshoptDecoder(MeshoptDecoder);
    
    // Set a reasonable timeout for loading (30 seconds)
    loader.manager.setURLModifier((url) => {
      // Add cache-busting to prevent browser caching issues
      return `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;
    });
    
    return loader;
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    // Set mounted flag
    isMountedRef.current = true;

    // --- INIT Three.js essentials
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0xf5f5f5);

    // Camera: start at _exactly_ the start of the intro
    const camera = new THREE.PerspectiveCamera(
      55,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.5;
    container.appendChild(renderer.domElement);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controlsRef.current = controls;
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = true;
    controls.maxPolarAngle = Math.PI / 2.20;
    controls.minPolarAngle = 0;
    controls.minDistance = 0.5;
    controls.maxDistance = 20.0;
    controls.zoomSpeed = 1.8;
    controls.rotateSpeed = 0.7;
    controls.enableZoom = true;
    controls.panSpeed = 1.8;
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN
    };
    controls.addEventListener('start', () => {
      userInteractedRef.current = true;
      autoRotateRef.current = false;
    });

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 1.0);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 1024;
    mainLight.shadow.mapSize.height = 1024;
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

    // Mouse event disables auto-rotate on user interaction
    const setupMouseEvents = () => {
      const onUserInteraction = () => {
        userInteractedRef.current = true;
        autoRotateRef.current = false;
      };
      container.addEventListener('mousedown', onUserInteraction);
      container.addEventListener('wheel', onUserInteraction);
      container.addEventListener('touchstart', onUserInteraction);
      return () => {
        container.removeEventListener('mousedown', onUserInteraction);
        container.removeEventListener('wheel', onUserInteraction);
        container.removeEventListener('touchstart', onUserInteraction);
      };
    };
    const cleanupMouseEvents = setupMouseEvents();

    // Initialize the loader once and store in ref - FIX: delay loader initialization
    // Small delay before starting the load to ensure DRACO is properly initialized
    if (initialLoadTimeoutRef.current) {
      clearTimeout(initialLoadTimeoutRef.current);
    }
    
    initialLoadTimeoutRef.current = window.setTimeout(() => {
      if (!isMountedRef.current) return;
      
      modelLoaderRef.current = initializeLoader();
      
      // Now start loading the model
      loadModel();
      
      initialLoadTimeoutRef.current = null;
    }, 100);

    // Animation state
    let introAnimation = true;
    let animationStartTime = 0;
    const animationDuration = 1500;

    // Function to load model with retry mechanism - IMPROVED HANDLING
    const loadModel = () => {
      if (!isMountedRef.current) return;
      
      if (!modelLoaderRef.current) {
        console.error("Model loader not initialized");
        setLoadingError("Error initializing model loader");
        setIsLoading(false);
        return;
      }
      
      // Make sure we have a valid model path
      if (!currentModelPath) {
        console.error("No model path specified");
        setLoadingError("No model path specified");
        setIsLoading(false);
        return;
      }
      
      // Set loading state to indicate we're attempting to load
      setIsLoading(true);
      setLoadingError(null);
      
      // Track loading attempts
      modelLoadingAttemptRef.current += 1;
      console.log(`Loading model: ${currentModelPath} (attempt ${modelLoadingAttemptRef.current})`);
      
      // Use a try-catch block to handle potential errors before the loader even starts
      try {
        // Create a new loader for each attempt to avoid cached state issues
        const dracoLoader = dracoLoaderRef.current;
        if (!dracoLoader) {
          throw new Error("DRACO loader not initialized");
        }
        
        // Ensure the GLTFLoader is fresh for each attempt
        const loader = new GLTFLoader();
        loader.setDRACOLoader(dracoLoader);
        
        if (rendererRef.current) {
          const ktx2Loader = new KTX2Loader();
          ktx2Loader.setTranscoderPath('https://unpkg.com/three@0.159.0/examples/jsm/libs/basis/');
          ktx2Loader.detectSupport(rendererRef.current);
          loader.setKTX2Loader(ktx2Loader);
        }
        
        loader.setMeshoptDecoder(MeshoptDecoder);
        
        // Set a cache-busting URL modifier
        loader.manager.setURLModifier((url) => {
          if (url.includes('glb')) {
            return `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;
          }
          return url;
        });
        
        // Load the model with the updated loader
        loader.load(
          currentModelPath,
          (gltf: GLTF) => {
            if (!isMountedRef.current) return;
            
            // Remove previous model if present
            if (modelRef.current && sceneRef.current) {
              sceneRef.current.remove(modelRef.current);
              modelRef.current = null;
            }
            
            const model = gltf.scene;
            modelRef.current = model;

            // --- CENTER AND SCALE THE MODEL
            const box = new THREE.Box3().setFromObject(model);
            modelBoundsRef.current = box.clone();
            const center = new THREE.Vector3();
            box.getCenter(center);
            modelCenterRef.current = center.clone();

            const size = box.getSize(new THREE.Vector3());
            const modelDiagonal = size.length();
            modelSizeRef.current = modelDiagonal;
            model.position.set(0, 0, 0);
            const newBox = new THREE.Box3().setFromObject(model);
            const newCenter = new THREE.Vector3();
            newBox.getCenter(newCenter);
            model.position.sub(newCenter);
            const baseScale = 15 / modelDiagonal;
            model.scale.set(baseScale, baseScale, baseScale);

            // Update center after scaling
            const finalBox = new THREE.Box3().setFromObject(model);
            finalBox.getCenter(modelCenterRef.current);
            modelBoundsRef.current = finalBox.clone();
            model.rotation.y = 0;
            const getUnitRotation = () => {
              if (!unitId) return 0;
              const unit = parseInt(unitId, 10);
              
              // First set of units (9-16) need 180 degree rotation
              if (unit >= 9 && unit <= 16) {
                return Math.PI; // 180 degrees
              }
              
              // Unit 27 needs 180 degree rotation
              if (unit === 27) {
                return Math.PI;
              }
              
              // Units 28-36 need a different rotation
              if (unit >= 28 && unit <= 36) {
                return Math.PI * 2; // 270 degrees
              }
              
              // Unit 46 needs 180 degree rotation
              if (unit === 46) {
                return Math.PI;
              }
              
              // Units 47-54 need a different rotation
              if (unit >= 47 && unit <= 54) {
                return Math.PI * 2; // 90 degrees
              }
              
              // Default: no rotation needed
              return 0;
            };
            
            // Apply appropriate rotation for this specific unit
            const unitRotation = getUnitRotation();
            if (unitRotation !== 0) {
              model.rotation.y = unitRotation;
            }
            // Enable shadows, convert MeshBasicMaterial to MeshStandardMaterial
            model.traverse((child: THREE.Object3D) => {
              if ((child as THREE.Mesh).isMesh) {
                const mesh = child as THREE.Mesh;
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                mesh.frustumCulled = true;
                if (mesh.geometry) {
                  mesh.geometry.computeBoundingBox();
                  mesh.geometry.computeBoundingSphere();
                }
                if (Array.isArray(mesh.material)) {
                  mesh.material.forEach((mat, idx) => {
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
                      (mesh.material as THREE.Material[])[idx] = newMat;
                    }
                  });
                } else if ((mesh.material as THREE.MeshBasicMaterial).isMeshBasicMaterial) {
                  const basicMat = mesh.material as THREE.MeshBasicMaterial;
                  mesh.material = new THREE.MeshStandardMaterial({
                    color: basicMat.color,
                    map: basicMat.map,
                    transparent: basicMat.transparent,
                    opacity: basicMat.opacity,
                    roughness: 0.7,
                    metalness: 0.0
                  });
                }
              }
            });

            // --- Ground plane
            setupGroundPlane(model);

            // --- Prepare camera/controls for **perfect** intro
            // Calculate orbit params from model bounds
            const boundingBox = new THREE.Box3().setFromObject(model);
            const boundingSphere = new THREE.Sphere();
            boundingBox.getBoundingSphere(boundingSphere);
            const cameraOrbitRadius = boundingSphere.radius * 2.2;
            const cameraOrbitHeight = boundingSphere.center.y + boundingSphere.radius * 0.7;
            cameraOrbitRadiusRef.current = cameraOrbitRadius;
            cameraOrbitHeightRef.current = cameraOrbitHeight;

            // Intro animation: camera should start at angleStart, end at angleEnd
            const centerVec = boundingSphere.center.clone();
            const angleStart = -Math.PI / 4;
            const angleEnd = 0;
            // Start: before first render, camera sits at angleStart
            camera.position.set(
              centerVec.x + cameraOrbitRadius * Math.sin(angleStart),
              cameraOrbitHeight,
              centerVec.z + cameraOrbitRadius * Math.cos(angleStart)
            );
            camera.lookAt(centerVec);

            // Controls target must be set before model is added!
            controls.target.copy(centerVec);
            controls.update();

            // Set initial values for reset
            initialCameraPositionRef.current = camera.position.clone();
            initialTargetRef.current = centerVec.clone();

            // Light follow model
            if (directionalLightRef.current) {
              const light = directionalLightRef.current;
              light.position.set(
                boundingSphere.center.x + boundingSphere.radius * 1.5,
                boundingSphere.center.y + boundingSphere.radius * 2.0,
                boundingSphere.center.z + boundingSphere.radius * 1.5
              );
              const targetObject = new THREE.Object3D();
              targetObject.position.copy(boundingSphere.center);
              scene.add(targetObject);
              light.target = targetObject;
              const shadowCameraSize = Math.max(boundingSphere.radius * 2, 5);
              light.shadow.camera.left = -shadowCameraSize;
              light.shadow.camera.right = shadowCameraSize;
              light.shadow.camera.top = shadowCameraSize;
              light.shadow.camera.bottom = -shadowCameraSize;
              light.shadow.camera.updateProjectionMatrix();
            }

            // Only now add the model! (No flicker, no pop.)
            scene.add(model);

            // Environment
            const pmremGenerator = new PMREMGenerator(renderer);
            pmremGenerator.compileEquirectangularShader();
            const cubeRenderTarget = pmremGenerator.fromScene(new THREE.Scene());
            scene.environment = cubeRenderTarget.texture;
            pmremGenerator.dispose();

            // Hide loader, model is ready, animation can start from correct camera/model position
            setIsLoading(false);
            setLoadingError(null);

            // --- Animation loop
            introAnimation = true;
            animationStartTime = Date.now();

            const animate = () => {
              if (!isMountedRef.current) return;
              
              animationFrameRef.current = requestAnimationFrame(animate);

              if (introAnimation) {
                const elapsed = Date.now() - animationStartTime;
                const progress = Math.min(elapsed / animationDuration, 1);
                // Use smooth easeInOutQuad
                const t = progress < 0.5
                  ? 2 * progress * progress
                  : -1 + (4 - 2 * progress) * progress;
                const angle = angleStart + (angleEnd - angleStart) * t;
                camera.position.set(
                  centerVec.x + cameraOrbitRadius * Math.sin(angle),
                  cameraOrbitHeight,
                  centerVec.z + cameraOrbitRadius * Math.cos(angle)
                );
                controls.target.lerp(centerVec, t);
                camera.lookAt(centerVec);

                if (progress >= 1) {
                  introAnimation = false;
                  controls.enabled = true;
                  initialCameraPositionRef.current = camera.position.clone();
                  autoRotateRef.current = true;
                } else {
                  controls.enabled = true; // Keep controls enabled during intro
                }
              } else if (model && autoRotateRef.current && !userInteractedRef.current) {
                const slowOrbitSpeed = 0.00012;
                const angle =
                  ((Date.now() - animationStartTime) * slowOrbitSpeed) % (2 * Math.PI);
                camera.position.x = centerVec.x + cameraOrbitRadius * Math.sin(angle);
                camera.position.z = centerVec.z + cameraOrbitRadius * Math.cos(angle);
                camera.position.y = cameraOrbitHeight;
                camera.lookAt(centerVec);
              }
              controls.update();
              renderer.render(scene, camera);
            };

            if (animationFrameRef.current !== null) {
              cancelAnimationFrame(animationFrameRef.current);
            }
            animate();

            // Double-click = reset view
            const handleDoubleClick = () => {
              if (initialCameraPositionRef.current && initialTargetRef.current) {
                const controls = controlsRef.current;
                const camera = cameraRef.current;
                if (!controls || !camera) return;
                const startPosition = camera.position.clone();
                const startTarget = controls.target.clone();
                const endPosition = initialCameraPositionRef.current.clone();
                const endTarget = initialTargetRef.current.clone();
                const duration = 1000;
                const startTime = Date.now();
                const animateReset = () => {
                  const now = Date.now();
                  const elapsed = now - startTime;
                  const progress = Math.min(elapsed / duration, 1);
                  const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
                  const easedProgress = easeOut(progress);
                  camera.position.lerpVectors(startPosition, endPosition, easedProgress);
                  controls.target.lerpVectors(startTarget, endTarget, easedProgress);
                  controls.update();
                  if (progress < 1) requestAnimationFrame(animateReset);
                };
                animateReset();
              }
            };
            container.addEventListener('dblclick', handleDoubleClick);

            // Clamp pan target so it can't go below ground
            const getMinTargetY = () =>
              groundPlaneRef.current ? groundPlaneRef.current.position.y : -0.01;
            controls.addEventListener('change', () => {
              const minTargetY = getMinTargetY();
              if (controls.target.y < minTargetY) {
                controls.target.y = minTargetY;
                controls.update();
              }
            });

            return () => {
              container.removeEventListener('dblclick', handleDoubleClick);
            };
          },
          (xhr: ProgressEvent<EventTarget>) => {
            if (!isMountedRef.current) return;
            
            if (xhr.total) {
              const progress = Math.min(Math.floor((xhr.loaded / xhr.total) * 100), 100);
              setLoadingProgress(progress);
            }
          },
          (error: any) => {
            if (!isMountedRef.current) return;
            
            console.error('Model loading error:', error);
            
            // Set loading error message
            setLoadingError(`Failed to load model. ${error.message || ''}`);
            
            // If the model failed to load and we haven't exceeded max retries, try a fallback
            if (modelLoadingAttemptRef.current <= 2) {
              console.log(`Retrying with fallback model...`);
              
              // Use our fallback system to determine next model path
              let fallbackPath = getFallbackPath(unitId || '1', variant);
              
              // If the current path already matches the fallback, try the ultimate fallback
              if (fallbackPath === currentModelPath) {
                fallbackPath = '/assets/Unit_01/Mezzanine.glb'; // Ultimate fallback
              }
              
              console.log(`Trying fallback path: ${fallbackPath}`);
              setCurrentModelPath(fallbackPath);
              
              // Add a slight delay before retrying to avoid rapid reload issues
              setTimeout(() => {
                if (isMountedRef.current) {
                  loadModel();
                }
              }, 500); 
            } else {
              setIsLoading(false);
              setLoadingError("Failed to load model after multiple attempts. Please try a different unit or variant.");
            }
          }
        );
      } catch (err: any) {
        console.error('Error in model loading process:', err);
        setLoadingError(`Error loading model: ${err.message || 'Unknown error'}`);
        setIsLoading(false);
      }
    };

    // Preload animation at lower FPS (while loading)
    let lastFrameTime = 0;
    const targetFPS = 24;
    const frameInterval = 1000 / targetFPS;
    const animatePreload = (currentTime: number) => {
      if (!isMountedRef.current) return;
      
      if (isLoading) {
        animationFrameRef.current = requestAnimationFrame(animatePreload);
        const deltaTime = currentTime - lastFrameTime;
        if (deltaTime < frameInterval) return;
        lastFrameTime = currentTime - (deltaTime % frameInterval);
        if (controlsRef.current) {
          controlsRef.current.update();
        }
        if (rendererRef.current && sceneRef.current && cameraRef.current) {
          rendererRef.current.render(sceneRef.current, cameraRef.current);
        }
      }
    };
    animationFrameRef.current = requestAnimationFrame(animatePreload);

    // Throttled resize handler
    let resizeTimeout: number;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = window.setTimeout(() => {
        if (!container || !isMountedRef.current) return;
        const width = container.clientWidth;
        const height = container.clientHeight;
        if (cameraRef.current) {
          cameraRef.current.aspect = width / height;
          cameraRef.current.updateProjectionMatrix();
        }
        if (rendererRef.current) {
          rendererRef.current.setSize(width, height);
        }
      }, 100);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      // Mark component as unmounted to prevent state updates
      isMountedRef.current = false;
      
      // Clear any pending timeouts
      if (initialLoadTimeoutRef.current) {
        clearTimeout(initialLoadTimeoutRef.current);
        initialLoadTimeoutRef.current = null;
      }
      
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
            if (Array.isArray(child.material)) {
              child.material.forEach((material) => {
                if (material.map) material.map.dispose();
                material.dispose();
              });
            } else if (child.material) {
              if (child.material.map) child.material.map.dispose();
              child.material.dispose();
            }
            if (child.geometry) child.geometry.dispose();
          }
        });
        if (sceneRef.current.environment) {
          sceneRef.current.environment.dispose();
          sceneRef.current.environment = null;
        }
        sceneRef.current.clear();
        sceneRef.current = null;
      }
      if (groundPlaneRef.current) {
        groundPlaneRef.current = null;
      }
      if (dracoLoaderRef.current) {
        dracoLoaderRef.current.dispose();
        dracoLoaderRef.current = null;
      }
      if (modelLoaderRef.current) {
        if (modelLoaderRef.current.dracoLoader) {
          modelLoaderRef.current.dracoLoader.dispose();
        }
        modelLoaderRef.current = null;
      }
      modelRef.current = null;
      directionalLightRef.current = null;
      cameraRef.current = null;
      modelCenterRef.current = null;
      initialCameraPositionRef.current = null;
      initialTargetRef.current = null;
      modelBoundsRef.current = null;
    };
  }, [currentModelPath]);

// --- RENDER ---
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
    {/* Container for the 3D view */}
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

    {/* Loading indicator */}
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
        {/* Loading spinner and progress */}
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
        {loadingError && (
          <p style={{
            color: '#e53935',
            fontSize: '14px',
            marginTop: '10px',
            fontFamily: 'Arial, sans-serif',
            maxWidth: '300px',
            textAlign: 'center'
          }}>
            {loadingError}
          </p>
        )}
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
            .segment-1 { top: 0; left: 0; }
            .segment-2 { top: 0; right: 0; }
            .segment-3 { bottom: 0; right: 0; }
            .segment-4 { bottom: 0; left: 0; }
            @keyframes rotate {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}
        </style>
      </div>
    )}

    {/* Back button */}
    {!isLoading && (
      <button
        type="button"
        aria-label="Go back"
        onClick={() => navigate('/')}
        style={{
          position: 'absolute',
          top: '20px',
          left: '20px',
          zIndex: 20,
          width: '56px',
          height: '56px',
          padding: 0,
          cursor: 'pointer',
          border: '2px solid #555',
          borderRadius: '50%',
          backgroundColor: '#f5f5f5',
          fontSize: '14px',
          fontFamily: 'Arial, sans-serif',
          color: '#333333',
          fontWeight: 'bold',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 6px rgba(0,0,0,0.08)'
        }}
      >
        <span style={{ fontSize: '26px', lineHeight: 1 }}>←</span>
      </button>
    )}

    {/* Updated model selection buttons - now with three options */}
    {!isLoading && (
      <div style={{
        position: 'absolute',
        bottom: '20px',
        left: '20px',
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        gap: '15px'
      }}>
        <button
          onClick={() => changeModel(getUnitModelPath(unitId || '1', 'with'), 'withMezzanine', 'with')}
          style={{
            padding: 0,
            cursor: 'pointer',
            border: activeModelButton === 'withMezzanine' ? '2px solid #e53935' : '2px solid #aaaaaa',
            borderRadius: '4px',
            overflow: 'hidden',
            backgroundColor: 'transparent',
            width: '120px',
            height: '110px',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          <img
            src={image3}
            alt="With Mezzanine"
            style={{
              width: '100%',
              height: '75%',
              objectFit: 'cover'
            }}
          />
          <div style={{
            width: '100%',
            backgroundColor: '#f5f5f5',
            padding: '7px 0 4px 0',
            textAlign: 'center',
            fontSize: '13px',
            fontFamily: 'Arial, sans-serif',
            color: '#333333',
            fontWeight: 'bold'
          }}>
            With Mezzanine
          </div>
        </button>

        <button
          onClick={() => changeModel(getUnitModelPath(unitId || '1', 'without'), 'withoutMezzanine', 'without')}
          style={{
            padding: 0,
            cursor: 'pointer',
            border: activeModelButton === 'withoutMezzanine' ? '2px solid #e53935' : '2px solid #aaaaaa',
            borderRadius: '4px',
            overflow: 'hidden',
            backgroundColor: 'transparent',
            width: '120px',
            height: '110px',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          <img
            src={image4}
            alt="Without Mezzanine"
            style={{
              width: '100%',
              height: '75%',
              objectFit: 'cover'
            }}
          />
          <div style={{
            width: '100%',
            backgroundColor: '#f5f5f5',
            padding: '7px 0 4px 0',
            textAlign: 'center',
            fontSize: '13px',
            fontFamily: 'Arial, sans-serif',
            color: '#333333',
            fontWeight: 'bold'
          }}>
            Without Mezzanine
          </div>
        </button>

        {/* New button for With Furniture option */}
        <button
          onClick={() => changeModel(getUnitModelPath(unitId || '1', 'furniture'), 'withFurniture', 'furniture')}
          style={{
            padding: 0,
            cursor: 'pointer',
            border: activeModelButton === 'withFurniture' ? '2px solid #e53935' : '2px solid #aaaaaa',
            borderRadius: '4px',
            overflow: 'hidden',
            backgroundColor: 'transparent',
            width: '120px',
            height: '110px',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          <img
            src={image5}
            alt="With Furniture"
            style={{
              width: '100%',
              height: '75%',
              objectFit: 'cover'
            }}
          />
          <div style={{
            width: '100%',
            backgroundColor: '#f5f5f5',
            padding: '7px 0 4px 0',
            textAlign: 'center',
            fontSize: '13px',
            fontFamily: 'Arial, sans-serif',
            color: '#333333',
            fontWeight: 'bold'
          }}>
            With Furniture
          </div>
        </button>
      </div>
    )}

    {/* Updated Unit Number Display with Dropdown Selector */}
    {!isLoading && (
      <div
        style={{
          position: 'absolute',
          top: '20px',
          left: '20%',
          transform: 'translateX(-50%)',
          zIndex: 20,
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '8px 16px',
          backgroundColor: '#fff',
          borderRadius: '999px', // pill
          boxShadow: '0 6px 18px rgba(22,28,37,0.12)',
          border: '1px solid rgba(0,0,0,0.06)',
          fontFamily: 'Roboto, Arial, sans-serif',
          fontSize: '15px',
          fontWeight: 600,
          color: '#111827',
          maxWidth: '92%',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          alignSelf: 'center',
        }}
      >
        <span
          style={{
            fontSize: '12px',
            color: '#6b7280',
            fontWeight: 700,
            letterSpacing: '0.6px',
            textTransform: 'uppercase',
          }}
        >
          Unit
        </span>

        <div style={{ position: 'relative', display: 'inline-block' }}>
          <select
            aria-label="Select unit"
            value={unitId || '1'}
            onChange={(e) => {
              const newUnitId = e.target.value;
              navigate(`/individual/${variant}/${newUnitId}`);
            }}
            style={{
              appearance: 'none',
              WebkitAppearance: 'none',
              MozAppearance: 'none',
              padding: '8px 36px 8px 12px',
              minWidth: '74px',
              borderRadius: '10px',
              border: '1px solid #e6e9ef',
              backgroundColor: '#fbfdff',
              fontSize: '15px',
              fontWeight: 800,
              cursor: 'pointer',
              textAlign: 'center',
              color: '#0f172a',
              outline: 'none',
              boxShadow: 'none',
            }}
          >
            {Array.from({ length: 67 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>

          {/* larger caret to match the button vibe */}
          <svg
            width="16"
            height="16"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            style={{
              position: 'absolute',
              right: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              pointerEvents: 'none',
              opacity: 0.8,
            }}
          >
            <path
              d="M6 7l4 4 4-4"
              stroke="#374151"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        {/* subtle divider */}
        <div
          style={{
            width: '1px',
            height: '22px',
            backgroundColor: '#eef2f6',
            margin: '0 8px',
            opacity: 0.95,
          }}
          aria-hidden="true"
        />

        <div
          style={{
            fontSize: '14px',
            color: '#374151',
            fontWeight: 700,
            maxWidth: '420px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {variant === 'furniture'
            ? 'With Furniture'
            : variant === 'with'
            ? 'With Mezzanine'
            : 'Without Mezzanine'}
        </div>
      </div>
    )}

    {/* Controls help */}
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
export default IndividualModelViewer;