import { useRef, useEffect, useState, FC } from 'react';
import { useNavigate } from 'react-router-dom';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
//import image1 from "../assets/image_new.png";
import image2 from "../assets/image_new.png";
import { PMREMGenerator } from 'three';

interface ModelViewerProps {
  initialModelPath?: string;
}

const ModelViewer: FC<ModelViewerProps> = ({ initialModelPath = '/assets/Without_Mezzanine_final.glb' }) => {
  const navigate = useNavigate();
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
  const modelBoundsRef = useRef<THREE.Box3 | null>(null);
  const [currentModelPath, setCurrentModelPath] = useState<string>(initialModelPath);
  const [activeModelButton, setActiveModelButton] = useState<string>("withoutMezzanine");
  const modelSizeRef = useRef<number>(1);
  const dracoLoaderRef = useRef<DRACOLoader | null>(null);
  const dracoLoaderInitializedRef = useRef<boolean>(false);
  const groundPlaneRef = useRef<THREE.Mesh | null>(null);
  const clickStartTimeRef = useRef<number>(0);
  const clickedPositionRef = useRef<THREE.Vector2>(new THREE.Vector2());
  const [_currentVariant, setCurrentVariant] = useState<'with' | 'without'>('without');
  
  const clickTimeoutRef = useRef<number | null>(null);
  // Add a new ref to track whether to enable hover checking
  const enableHoverCheckingRef = useRef<boolean>(false);

  // Maps to store target meshes and their original materials
  const targetMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const originalMaterialsRef = useRef<Map<string, THREE.Material | THREE.Material[]>>(new Map());
  const highlightMaterialRef = useRef<THREE.Material | null>(null);
  const currentlyHighlightedUnitRef = useRef<string | null>(null);
  
  // Map to group meshes by unit number
  const unitMeshesRef = useRef<Map<string, THREE.Mesh[]>>(new Map());
  
  const getUnitNumberFromName = (name: string): string | null => {
    // Parse the unit number from name format like "1_1", "2_3", etc.
    const match = name.match(/^(\d+)_\d+$/);
    if (match && match[1]) {
      return match[1];
    }
    return null;
  };
  
  const getTargetNumber = (name: string): number | null => {
    // First check if this is one of the meshes we want to explicitly ignore
    if (name.includes('Cars') || name.includes('human') || name.includes('Site') || 
        /^(?!.*\d).*$/.test(name)) { // Regex to catch names with no digits
      return null;
    }
    
    // Extract the number using regex patterns
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
    
    // More specific match for standalone numbers 1-69
    const anyNumberMatch = name.match(/\b([1-9]|[1-5][0-9]|6[0-9])\b/);
    if (anyNumberMatch && anyNumberMatch[1]) {
      const num = parseInt(anyNumberMatch[1], 10);
      if (num >= 1 && num <= 69) return num;
    }
    
    return null;
  };
  
  const initDracoLoader = () => {
    // Only create a new loader if one doesn't exist
    if (!dracoLoaderRef.current) {
      console.log("Creating new Draco loader");
      const loader = new DRACOLoader();
      // Use the CDN path with specific version to ensure consistency
      loader.setDecoderPath('https://unpkg.com/three@0.159.0/examples/jsm/libs/draco/');
      loader.setDecoderConfig({ type: 'js' });
      dracoLoaderRef.current = loader;
      dracoLoaderInitializedRef.current = true;
    }
    return dracoLoaderRef.current;
  };
  
  // Add these cleanup helpers
  // const cleanupThreeJSResources = () => {
  //   // Cancel animation frame
  //   if (animationFrameRef.current !== null) {
  //     cancelAnimationFrame(animationFrameRef.current);
  //     animationFrameRef.current = null;
  //   }
    
  //   // Dispose controls
  //   if (controlsRef.current) {
  //     controlsRef.current.dispose();
  //   }
    
  //   // Reset highlighting
  //   resetHighlighting();
    
  //   // Clear timeouts
  //   if (clickTimeoutRef.current) {
  //     clearTimeout(clickTimeoutRef.current);
  //     clickTimeoutRef.current = null;
  //   }
    
  //   if (modelChangeTimeoutRef.current) {
  //     clearTimeout(modelChangeTimeoutRef.current);
  //     modelChangeTimeoutRef.current = null;
  //   }
  // };
  
  
  const isTargetMesh = (name: string): boolean => {
    // Explicitly check for non-target meshes first
    if (name === 'Cars' || name === 'human' || name === 'Site') {
      return false;
    }
    
    const targetNum = getTargetNumber(name);
    return targetNum !== null && targetNum >= 1 && targetNum <= 69;
  };
  
  // Create a shader-based highlight material
  // const highlightMaterial = new THREE.ShaderMaterial({
  //   uniforms: {
  //     baseColor: { value: new THREE.Color(0xF9A825) },
  //     opacity: { value: 0.3 }
  //   },
  //   vertexShader: `
  //     varying vec3 vNormal;
  //     varying vec2 vUv;
      
  //     void main() {
  //       vNormal = normalize(normalMatrix * normal);
  //       vUv = uv;
  //       gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  //     }
  //   `,
  //   fragmentShader: `
  //     uniform vec3 baseColor;
  //     uniform float opacity;
  //     varying vec3 vNormal;
      
  //     void main() {
  //       float intensity = 0.7 + 0.3 * dot(vNormal, vec3(0.0, 1.0, 0.0));
  //       vec3 finalColor = baseColor * intensity;
  //       gl_FragColor = vec4(finalColor, opacity);
  //     }
  //   `,
  //   transparent: true,
  //   depthWrite: false,
  //   side: THREE.FrontSide
  // });

  const highlightUnitMeshes = (unitNumber: string | null) => {
    // Skip if no unit number or it's already highlighted
    if (!unitNumber || unitNumber === currentlyHighlightedUnitRef.current) {
      return;
    }
    
    // Reset any previously highlighted unit
    if (currentlyHighlightedUnitRef.current) {
      resetHighlighting();
    }
    
    // Highlight all meshes in the new unit
    const meshesToHighlight = unitMeshesRef.current.get(unitNumber) || [];
    if (highlightMaterialRef.current && meshesToHighlight.length > 0) {
      meshesToHighlight.forEach(mesh => {
        // Store original material if not already stored
        if (!originalMaterialsRef.current.has(mesh.uuid)) {
          originalMaterialsRef.current.set(mesh.uuid, mesh.material);
        }
        
        // Create a clone of the mesh for highlighting
        const highlightMesh = mesh.clone();
        highlightMesh.material = highlightMaterialRef.current as THREE.Material;
        highlightMesh.renderOrder = 1; // Ensure it renders on top
        highlightMesh.userData.isHighlight = true;
        highlightMesh.userData.originalMeshId = mesh.uuid;
        
        // Add the highlight mesh to the scene
        mesh.parent?.add(highlightMesh);
        
        // Store reference to highlight mesh for removal later
        if (!mesh.userData.highlightMesh) {
          mesh.userData.highlightMesh = highlightMesh;
        }
      });
      
      // Set the unit name for the UI
      setHoveredMeshName(unitNumber);
    }
    
    currentlyHighlightedUnitRef.current = unitNumber;
  };
  
  const resetHighlighting = () => {
    if (currentlyHighlightedUnitRef.current) {
      const meshesToReset = unitMeshesRef.current.get(currentlyHighlightedUnitRef.current) || [];
      meshesToReset.forEach(mesh => {
        // Remove highlight mesh if it exists
        if (mesh.userData.highlightMesh) {
          mesh.parent?.remove(mesh.userData.highlightMesh);
          mesh.userData.highlightMesh = null;
        }
      });
      currentlyHighlightedUnitRef.current = null;
      setHoveredMeshName(null);
    }
  };
  
  const checkIntersection = () => {
    // Only check intersections if hover checking is enabled
    if (!enableHoverCheckingRef.current || !cameraRef.current || targetMeshesRef.current.size === 0) {
      return;
    }
    
    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
    
    const targetMeshes = Array.from(targetMeshesRef.current.values());
    
    raycasterRef.current.params.Mesh = { 
      threshold: 0.01
    };
    
    const intersects = raycasterRef.current.intersectObjects(targetMeshes, false);
    
    const currentTime = Date.now();
    // Use a longer debounce time during auto-rotation for smoother transitions
    const debounceTime = autoRotateRef.current && !userInteractedRef.current ? 200 : 100;
    
    if (intersects.length === 0) {
      if (currentlyHighlightedUnitRef.current && 
          (currentTime - lastHighlightChangeRef.current > debounceTime)) {
        resetHighlighting();
        lastHighlightChangeRef.current = currentTime;
      }
      return;
    }
    
    const firstIntersect = intersects[0];
    if (!firstIntersect || !firstIntersect.object) return;
    
    const mesh = firstIntersect.object as THREE.Mesh;
    
    // Extract unit number from the mesh name
    const unitNumber = getUnitNumberFromName(mesh.name);
    
    if (!unitNumber || unitNumber === currentlyHighlightedUnitRef.current) return;
    
    if (currentTime - lastHighlightChangeRef.current < debounceTime) return;
    
    // Highlight all meshes of this unit
    highlightUnitMeshes(unitNumber);
    lastHighlightChangeRef.current = currentTime;
  };
  
  const handleMeshClick = () => {
    if (!cameraRef.current || targetMeshesRef.current.size === 0) return;
    
    // Calculate if this was a quick click (not a drag)
    const clickEndTime = Date.now();
    const clickDuration = clickEndTime - clickStartTimeRef.current;
    
    // If click duration is too long or mouse moved too much, treat as a drag operation
    if (clickDuration > 200) return;
    
    const currentMousePosition = mouseRef.current.clone();
    const distance = clickedPositionRef.current.distanceTo(currentMousePosition);
    if (distance > 0.05) return; // Mouse moved too much during click
    
    // Prevent multiple rapid clicks (debounce)
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
    }
    
    clickTimeoutRef.current = window.setTimeout(() => {
      if (cameraRef.current) {
        raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
      }
      const targetMeshes = Array.from(targetMeshesRef.current.values());
      const intersects = raycasterRef.current.intersectObjects(targetMeshes, false);
      
      if (intersects.length === 0) return;
      
      const firstIntersect = intersects[0];
      if (!firstIntersect || !firstIntersect.object) return;
      
      const mesh = firstIntersect.object as THREE.Mesh;
      const unitNumber = getUnitNumberFromName(mesh.name);
      
      if (unitNumber) {
        // Navigate to the individual unit page with the current variant
        navigate(`/individual/without/${unitNumber}`);
      }
      
      clickTimeoutRef.current = null;
    }, 300); // Debounce time in ms
  };
const modelChangeTimeoutRef = useRef<number | null>(null);
const lastModelChangeTimeRef = useRef<number>(0);


  const setupMouseEvents = () => {
    const container = containerRef.current;
    if (!container || mouseMoveListenerAttachedRef.current) return;
    
    const onMouseMove = (event: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      
      // Enable hover checking when user has moved the mouse
      enableHoverCheckingRef.current = true;
    };
    const onMouseDown = (event: MouseEvent) => {
      clickStartTimeRef.current = Date.now();
      const rect = container.getBoundingClientRect();
      clickedPositionRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      clickedPositionRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      userInteractedRef.current = true;
      autoRotateRef.current = false;
      
      // Ensure hover checking is enabled once user interacts
      enableHoverCheckingRef.current = true;
    };
    
    const onMouseUp = () => {
      handleMeshClick();
    };
    
    const onUserInteraction = () => {
      userInteractedRef.current = true;
      autoRotateRef.current = false;
      
      // Ensure hover checking is enabled once user interacts
      enableHoverCheckingRef.current = true;
    };
    
    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('mousedown', onMouseDown);
    container.addEventListener('mouseup', onMouseUp);
    container.addEventListener('wheel', onUserInteraction);
    container.addEventListener('touchstart', onUserInteraction);
    mouseMoveListenerAttachedRef.current = true;
    
    return () => {
      container.removeEventListener('mousemove', onMouseMove);
      container.removeEventListener('mousedown', onMouseDown);
      container.removeEventListener('mouseup', onMouseUp);
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
      const closeToWall = distanceToObject < 2.0;
  
      if (closeToWall || distanceToObject < distanceToTarget * 0.8) {
        const newTargetDistance = Math.min(distanceToObject * 0.8, distanceToTarget);
        const newTarget = camera.position.clone().add(
          direction.clone().multiplyScalar(newTargetDistance)
        );
  
        let dampingFactor = 0.07;
        if (closeToWall) {
          dampingFactor = 0.04;
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
  
    const isSmallModel = modelSizeRef.current < 5;
    const farZoomThreshold = modelSize * 0.85;
    const midZoomThreshold = modelSize * 0.45;
    const closeZoomThreshold = modelSize * 0.25;
    const veryCloseZoomThreshold = modelSize * 0.15;
  
    if (distanceToModel > farZoomThreshold) {
      controls.rotateSpeed = isSmallModel ? 1.0 : 0.9;
      controls.dampingFactor = isSmallModel ? 0.04 : 0.05;
      controls.panSpeed = isSmallModel ? 2.5 : 2.0;
      controls.zoomSpeed = isSmallModel ? 2.2 : 1.8;
    } 
    else if (distanceToModel > midZoomThreshold) {
      controls.rotateSpeed = isSmallModel ? 0.8 : 0.65;
      controls.dampingFactor = isSmallModel ? 0.06 : 0.07;
      controls.panSpeed = isSmallModel ? 2.0 : 1.5;
      controls.zoomSpeed = isSmallModel ? 2.0 : 1.6;
    }
    else if (distanceToModel > closeZoomThreshold) {
      controls.rotateSpeed = isSmallModel ? 0.65 : 0.55;
      controls.dampingFactor = isSmallModel ? 0.1 : 0.12;
      controls.panSpeed = isSmallModel ? 1.7 : 1.2;
      controls.zoomSpeed = isSmallModel ? 1.8 : 1.4;
    }
    else if (distanceToModel > veryCloseZoomThreshold) {
      controls.rotateSpeed = isSmallModel ? 0.5 : 0.4;
      controls.dampingFactor = isSmallModel ? 0.2 : 0.25;
      controls.panSpeed = isSmallModel ? 1.3 : 0.9;
      controls.zoomSpeed = isSmallModel ? 1.6 : 1.2;
    }
    else {
      controls.rotateSpeed = isSmallModel ? 0.4 : 0.3;
      controls.dampingFactor = isSmallModel ? 0.25 : 0.35;
      controls.panSpeed = isSmallModel ? 1.1 : 0.7;
      controls.zoomSpeed = isSmallModel ? 1.4 : 1.0;
    }
  
    // Enhanced linear camera rotation when very close to ground/target
    if (distanceToTarget < closeZoomThreshold * (isSmallModel ? 0.4 : 0.3)) {
      const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      const newTargetDistance = Math.max(distanceToTarget, isSmallModel ? 0.4 : 0.6);
      const newTarget = camera.position.clone().add(direction.multiplyScalar(newTargetDistance));
      controls.target.lerp(newTarget, isSmallModel ? 0.08 : 0.06);
    }
  };

  // Function to create or update ground plane
  const setupGroundPlane = (_model: THREE.Group) => {
    if (!sceneRef.current) return;
    
    // Remove existing ground plane if any
    if (groundPlaneRef.current && sceneRef.current.getObjectById(groundPlaneRef.current.id)) {
      sceneRef.current.remove(groundPlaneRef.current);
      groundPlaneRef.current = null;
    }
    
    // For larger scene models, use a larger ground plane
    const groundGeometry = new THREE.PlaneGeometry(200, 200);
    const groundMaterial = new THREE.ShadowMaterial({ opacity: 0.8 });
    groundMaterial.color = new THREE.Color(0x000000);
    const groundPlane = new THREE.Mesh(groundGeometry, groundMaterial);
    groundPlane.rotation.x = -Math.PI / 2;
    groundPlane.position.y = -0.1;
    groundPlane.receiveShadow = true;
    sceneRef.current.add(groundPlane);
    groundPlaneRef.current = groundPlane;
  };

  // Function to change the model
  const changeModel = (modelPath: string, buttonId: string, variant: 'with' | 'without') => {
    const now = Date.now();
    // Prevent rapid clicking (debounce by 800ms)
    if (now - lastModelChangeTimeRef.current < 800) {
      return;
    }
    
    // If we're already showing this model, don't reload
    if (activeModelButton === buttonId) {
      return;
    }
    
    lastModelChangeTimeRef.current = now;
    
    if (modelChangeTimeoutRef.current) {
      clearTimeout(modelChangeTimeoutRef.current);
    }
    
    modelChangeTimeoutRef.current = window.setTimeout(() => {
      setIsLoading(true);
      setCurrentModelPath(modelPath);
      setActiveModelButton(buttonId);
      setCurrentVariant(variant);
      modelChangeTimeoutRef.current = null;
    }, 50); // Small delay to prevent potential race conditions
  };

// Fix the initial model loading issue
useEffect(() => {
  const container = containerRef.current;
  if (!container) return;

  targetMeshesRef.current.clear();
  originalMaterialsRef.current.clear();
  unitMeshesRef.current.clear();
  currentlyHighlightedUnitRef.current = null;
  setHoveredMeshName(null);
  userInteractedRef.current = false;
  autoRotateRef.current = true;
  enableHoverCheckingRef.current = false;

  if (!sceneRef.current) {
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0xf5f5f5);
  } else {
    // Clear existing scene but keep the reference
    while (sceneRef.current.children.length > 0) {
      const child = sceneRef.current.children[0];
      if (child) {
        sceneRef.current.remove(child);
      }
    }
  }

  const scene = sceneRef.current;

  // Create or reuse camera
  if (!cameraRef.current) {
    const camera = new THREE.PerspectiveCamera(
      55,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    camera.position.set(5, 11, 15);
    cameraRef.current = camera;
  } else {
    cameraRef.current.aspect = container.clientWidth / container.clientHeight;
    cameraRef.current.updateProjectionMatrix();
  }
  
  const camera = cameraRef.current;

  // Create or reuse renderer
  if (!rendererRef.current) {
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      precision: 'mediump',
      alpha: true,
      stencil: true
    });
    rendererRef.current = renderer;
    const dracoLoader = initDracoLoader();
    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);
    const pixelRatio = Math.min(window.devicePixelRatio, 1.5);
    renderer.setPixelRatio(pixelRatio);
    
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.5;
    
    container.appendChild(renderer.domElement);
  }
  
  const renderer = rendererRef.current;
  renderer.setSize(container.clientWidth, container.clientHeight);

  // Create or reuse controls - FIXED CONTROLS INITIALIZATION
  if (controlsRef.current) {
    controlsRef.current.dispose();
    controlsRef.current = null;
  }
  
  const controls = new OrbitControls(camera, renderer.domElement);
  controlsRef.current = controls;
  
  // Make sure controls are properly initialized before model loading
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
  
  // Panning boundaries
  // const minTargetY = -17.28;
  
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.PAN
  };
  
  // Function to enforce panning boundaries
  const enforcePanningBoundaries = () => {
    if (!controlsRef.current || !modelCenterRef.current || !modelBoundsRef.current) return;
    
    const target = controlsRef.current.target;
    const modelCenter = modelCenterRef.current;
    const bounds = modelBoundsRef.current;
    const isSmallModel = modelSizeRef.current < 5;
    
    let panRadiusFactor = 2.0;
    
    if (isSmallModel) {
      panRadiusFactor = 6.0;
    } else if (modelSizeRef.current < 10) {
      panRadiusFactor = 3.0;
    }
    
    const panRadius = bounds.getSize(new THREE.Vector3()).length() * panRadiusFactor;
    
    const minPanRadius = isSmallModel ? 12.0 : 8.0;
    const effectivePanRadius = Math.max(panRadius, minPanRadius);
    
    const targetDelta = new THREE.Vector3().subVectors(target, modelCenter);
    const distanceFromCenter = targetDelta.length();
    
    if (distanceFromCenter > effectivePanRadius) {
      targetDelta.normalize().multiplyScalar(effectivePanRadius);
      
      if (isSmallModel) {
        const newTarget = modelCenter.clone().add(targetDelta);
        target.lerp(newTarget, 0.1);
      } else {
        target.copy(modelCenter).add(targetDelta);
      }
    }
    
    const effectiveMinY = isSmallModel ? 20 : -18.45;
    
    if (target.y < effectiveMinY) {
      target.y = effectiveMinY;
    }
  };
  
  controls.addEventListener('start', () => {
    userInteractedRef.current = true;
    autoRotateRef.current = false;
    // Enable hover checking when user interacts with controls
    enableHoverCheckingRef.current = true;
  });
  
  controls.addEventListener('change', () => {
    enforcePanningBoundaries();
    if (cameraRef.current && controlsRef.current) {
      adjustControlsBasedOnZoomLevel();
    }
  });
  
  // Ensure controls are active and working from the start
  controls.enabled = true;
  
  // Update controls to make sure they're active
  controls.update();

  // Add lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const mainLight = new THREE.DirectionalLight(0xffffff, 1.0);
  mainLight.position.set(15, 20, 15);
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

  // Initialize highlight material
  const highlightMaterial = new THREE.MeshStandardMaterial({
    color: 0xFFD600,
    emissive: 0xFFC107,
    emissiveIntensity: 0.35,
    roughness: 0.7,
    metalness: 0.15,
    transparent: true,
    opacity: 0.45,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    side: THREE.FrontSide,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending
  });
  highlightMaterialRef.current = highlightMaterial;

  const cleanupMouseEvents = setupMouseEvents();

  const dracoLoader = new DRACOLoader();
  // Fix DRACO loader path to ensure it's correctly loaded
  dracoLoader.setDecoderPath('https://unpkg.com/three@0.159.0/examples/jsm/libs/draco/');
  dracoLoader.setDecoderConfig({ type: 'js' });

  const loader = new GLTFLoader();
  loader.setDRACOLoader(dracoLoader);
  
  // FIXED: Make intro animation shorter and ensure controls work during/after it
  let introAnimation = true;
  let animationStartTime = 0;
  const animationDuration = 1000; // Shorter duration
  
  // Initialize animation frame reference early
  if (animationFrameRef.current !== null) {
    cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = null;
  }

  const loadManager = new THREE.LoadingManager();
  loadManager.onProgress = (_, loaded, total) => {
    if (total > 0) {
      const progress = Math.min(Math.floor((loaded / total) * 100), 100);
      setLoadingProgress(progress);
    }
  };
  
  loader.manager = loadManager;
  
  // Start a simple animation while waiting for the model to load
  // This ensures the renderer and controls are active
  const preloadAnimate = () => {
    if (rendererRef.current && sceneRef.current && cameraRef.current && controlsRef.current) {
      controlsRef.current.update();
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }
    
    if (isLoading) {
      animationFrameRef.current = requestAnimationFrame(preloadAnimate);
    }
  };
  
  preloadAnimate();
  
  // Improved error handling for model loading
  loader.load(
    currentModelPath,
    (gltf: GLTF) => {
      console.log("Model loaded successfully:", currentModelPath);
      
      // Remove previous model if it exists
      if (modelRef.current && sceneRef.current) {
        sceneRef.current.remove(modelRef.current);
        modelRef.current = null;
      }
      
      const model = gltf.scene;
      modelRef.current = model;

      const box = new THREE.Box3().setFromObject(model);
      modelBoundsRef.current = box.clone();
      
      const center = new THREE.Vector3();
      box.getCenter(center);
      
      modelCenterRef.current = center.clone();
      
      // Determine model size
      const size = box.getSize(new THREE.Vector3());
      const modelDiagonal = size.length();
      modelSizeRef.current = modelDiagonal;
      
      console.log(`Model size: ${modelDiagonal}`);
      
      // Position model
      model.position.sub(center);
      
      const baseScale = 12 / modelDiagonal;
      const extraZoom = 1.8;
      const scale = baseScale * extraZoom;
      model.scale.set(scale, scale, scale);
      
      model.rotation.y = 0;

      // Create ground plane
      setupGroundPlane(model);

      // Clear previous model data
      targetMeshesRef.current.clear();
      originalMaterialsRef.current.clear();
      unitMeshesRef.current.clear();
      
      // Process model meshes
      model.traverse((child: THREE.Object3D) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.frustumCulled = true;
          
          // Handle materials
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
          
          // Process target meshes
          if (isTargetMesh(child.name) && !['Cars', 'human', 'Site'].includes(child.name)) {
            targetMeshesRef.current.set(child.name, mesh);
            originalMaterialsRef.current.set(child.uuid, mesh.material);
            
            // Group by unit number
            const unitNumber = getUnitNumberFromName(child.name);
            if (unitNumber) {
              if (!unitMeshesRef.current.has(unitNumber)) {
                unitMeshesRef.current.set(unitNumber, []);
              }
              unitMeshesRef.current.get(unitNumber)?.push(mesh);
            }
          }
          
          // Optimize geometry
          if (mesh.geometry) {
            mesh.geometry.computeBoundingBox();
            mesh.geometry.computeBoundingSphere();
          }
          
          // Convert basic materials to standard materials for better performance
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

      // Calculate bounding sphere
      const boundingBox = new THREE.Box3().setFromObject(model);
      const boundingSphere = new THREE.Sphere();
      boundingBox.getBoundingSphere(boundingSphere);
      
      // Adjust camera setup
      controls.target.copy(boundingSphere.center);
      
      const radius = boundingSphere.radius;
      
      // Set initial camera position
      let heightFactor = 0.8;
      let distanceFactor = 1.5;
      
      camera.position.set(
        boundingSphere.center.x,
        boundingSphere.center.y + radius * heightFactor,
        boundingSphere.center.z + radius * distanceFactor
      );
      
      const initialCameraPosition = camera.position.clone();
      initialCameraPositionRef.current = initialCameraPosition.clone();
      
      // Set target camera position for intro animation
      let targetHeightFactor = 0.5;
      let targetDistanceFactor = 1.6;
      
      const targetCameraPosition = new THREE.Vector3(
        boundingSphere.center.x,
        boundingSphere.center.y + radius * targetHeightFactor,
        boundingSphere.center.z + radius * targetDistanceFactor
      );
      
      initialTargetRef.current = boundingSphere.center.clone();

      // Position the directional light
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
        
        // Adjust shadow camera
        const shadowCameraSize = Math.max(radius * 2, 5);
        light.shadow.camera.left = -shadowCameraSize;
        light.shadow.camera.right = shadowCameraSize;
        light.shadow.camera.top = shadowCameraSize;
        light.shadow.camera.bottom = -shadowCameraSize;
        light.shadow.camera.updateProjectionMatrix();
      }

      // Make sure controls are updated with the new target
      controls.update();

      // Setup environment map
      const pmremGenerator = new PMREMGenerator(renderer);
      pmremGenerator.compileEquirectangularShader();
      const cubeRenderTarget = pmremGenerator.fromScene(new THREE.Scene());
      scene.environment = cubeRenderTarget.texture;
      pmremGenerator.dispose();

      // Loading complete
      setIsLoading(false);
      introAnimation = true;
      animationStartTime = Date.now();
      
      if (model) {
        model.rotation.y = 0;
      }

      // Handle double-click to reset view
      const handleDoubleClick = () => {
        resetCameraView();
      };
      
      container.addEventListener('dblclick', handleDoubleClick);

      // FIXED: More reliable animation loop with proper controls handling
      const animate = () => {
        if (!sceneRef.current || !modelRef.current || !controlsRef.current) return;
        
        animationFrameRef.current = requestAnimationFrame(animate);
        
        // Skip frames for better performance but ensure controls always update
        if (autoRotateRef.current && !userInteractedRef.current) {
          frameCountRef.current++;
          if (frameCountRef.current % 2 !== 0) {
            // Even when skipping frames, always update controls
            controlsRef.current.update();
            renderer.render(scene, camera);
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
            // CRITICAL FIX: Always keep controls enabled during intro animation
            controls.enabled = true;
          }
        } else if (modelRef.current && autoRotateRef.current && !userInteractedRef.current) {
          // Auto-rotate when not interacting
          let rotationSpeed = 0.001;
          modelRef.current.rotation.y += rotationSpeed;
          
          // During auto-rotation, we still want to check intersections
          // but we don't want to reset highlighting just because it's auto-rotating
        }

        if (!introAnimation) {
          adjustControlsBasedOnZoomLevel();
          
          // Update target occasionally
          if (Math.random() < 0.02 && 
              controlsRef.current && 
              cameraRef.current && 
              cameraRef.current.position.distanceTo(controlsRef.current.target) > controls.minDistance * 1.2) {
            updateControlTargetBasedOnView();
          }
          
          // Apply panning boundaries
          enforcePanningBoundaries();
        }
        
        controls.update();
        
        // Check for mesh intersections only when hovering is enabled
        if (mouseMoveListenerAttachedRef.current && 
            (!autoRotateRef.current || userInteractedRef.current || enableHoverCheckingRef.current)) {
          checkIntersection();
        }
        
        renderer.render(scene, camera);
      };

      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      // Start the main animation loop
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

  // Handle window resize
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
    }, 100);
  };
  
  window.addEventListener('resize', handleResize);

  // Important: Modified cleanup function to prevent model disappearing
  return () => {
    if (cleanupMouseEvents) cleanupMouseEvents();
    window.removeEventListener('resize', handleResize);
    clearTimeout(resizeTimeout);
    
    // Cancel animation frame but DON'T destroy the scene/model completely
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    // Only reset highlighting, but don't destroy core components
    resetHighlighting();
    
    // Only clean up when component is fully unmounting, not just updating
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }
    
    if (modelChangeTimeoutRef.current) {
      clearTimeout(modelChangeTimeoutRef.current);
      modelChangeTimeoutRef.current = null;
    }
  };
}, [currentModelPath, navigate]);

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
          <span style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ fontWeight: 'bold', marginRight: '5px' }}>Click Unit:</span> View Detail
          </span>
        </div>
      )}
      
      {/* Model selection buttons at bottom left - just two buttons for main models */}
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
          {/* <button
             onClick={() => changeModel('/assets/Mezzanine_new_estate_huge.glb', 'withMezzanine', 'with')}
            style={{
              padding: 0,
              cursor: 'pointer',
              border: activeModelButton === 'withMezzanine' ? '2px solid #e53935' : '2px solid #aaaaaa',
              borderRadius: '4px',
              overflow: 'hidden',
              backgroundColor: 'transparent',
              width: '145px',
              height: '110px',  
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <img 
              src={image1}
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
              fontSize: '14px', 
              fontFamily: 'Arial, sans-serif',
              color: '#333333',
              fontWeight: 'bold'
            }}>
              With Mezzanine
            </div>
          </button> */}
          
          <button
            onClick={() => changeModel('/assets/Without_Mezzanine_final.glb', 'withoutMezzanine', 'without')}
            style={{
              padding: 0,
              cursor: 'pointer',
              border: activeModelButton === 'withoutMezzanine' ? '2px solid #e53935' : '2px solid #aaaaaa',
              borderRadius: '4px',
              overflow: 'hidden',
              backgroundColor: 'transparent',
              width: '145px',
              height: '110px', 
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <img 
              src={image2}
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
              fontSize: '14px',  
              fontFamily: 'Arial, sans-serif',
              color: '#333333',
              fontWeight: 'bold'
            }}>
              Without Mezzanine
            </div>
          </button>
        </div>
      )}
    </div>
  );
};

export default ModelViewer;