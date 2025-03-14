import * as THREE from 'three'
import { useEffect, useRef, useState } from 'react'
import { Canvas, extend, useThree, useFrame } from '@react-three/fiber'
import { useGLTF, useTexture, Environment, Lightformer, Text, PerspectiveCamera, RenderTexture } from '@react-three/drei'
import { BallCollider, CuboidCollider, Physics, RigidBody, useRopeJoint, useSphericalJoint } from '@react-three/rapier'
import { MeshLineGeometry, MeshLineMaterial } from 'meshline'
import { useControls } from 'leva'

// Extend to use MeshLine in JSX
extend({ MeshLineGeometry, MeshLineMaterial })

// Preload assets - replace with your own if needed
// useGLTF.preload('/models/badge.glb') // You'll need to create your own 3D model or use the example one

export default function App() {
  // Debug controls - useful during development
  const { debug } = useControls({ debug: false })
  
  return (
    <Canvas camera={{ position: [0, 0, 13], fov: 25 }}>
      <ambientLight intensity={Math.PI} />
      <Physics debug={debug} interpolate gravity={[0, -40, 0]} timeStep={1 / 60}>
        <Lanyard />
      </Physics>
      <Environment background blur={0.75}>
        <color attach="background" args={['#050505']} />
        <Lightformer intensity={2} color="white" position={[0, -1, 5]} rotation={[0, 0, Math.PI / 3]} scale={[100, 0.1, 1]} />
        <Lightformer intensity={3} color="white" position={[-1, -1, 1]} rotation={[0, 0, Math.PI / 3]} scale={[100, 0.1, 1]} />
        <Lightformer intensity={3} color="white" position={[1, 1, 1]} rotation={[0, 0, Math.PI / 3]} scale={[100, 0.1, 1]} />
        <Lightformer intensity={10} color="#4361ee" position={[-10, 0, 14]} rotation={[0, Math.PI / 2, Math.PI / 3]} scale={[100, 10, 1]} />
      </Environment>
    </Canvas>
  )
}

function Lanyard({ maxSpeed = 50, minSpeed = 10 }) {
  // References for the components
  const band = useRef()
  const fixed = useRef()
  const j1 = useRef()
  const j2 = useRef()
  const j3 = useRef()
  const card = useRef()
  
  // Vectors for calculations
  const vec = new THREE.Vector3()
  const ang = new THREE.Vector3()
  const rot = new THREE.Vector3()
  const dir = new THREE.Vector3()
  
  // Physics properties
  const segmentProps = { 
    type: 'dynamic', 
    canSleep: true, 
    colliders: false, 
    angularDamping: 2, 
    linearDamping: 2 
  }
  
  // If you have your own 3D model, use this:
  // const { nodes, materials } = useGLTF('/models/badge.glb')
  
  // Lanyard texture - you can replace with your own
  const texture = new THREE.CanvasTexture(createLanyardTexture())
  
  // Get the canvas size
  const { width, height } = useThree((state) => state.size)
  
  // Create a curve for the lanyard rope
  const [curve] = useState(() => new THREE.CatmullRomCurve3([
    new THREE.Vector3(), 
    new THREE.Vector3(), 
    new THREE.Vector3(), 
    new THREE.Vector3()
  ]))
  
  // States for interaction
  const [dragged, drag] = useState(false)
  const [hovered, hover] = useState(false)
  
  // Name to display on the badge
  const [name] = useState("Seth Gomer")

  // Connect the joints with ropes
  useRopeJoint(fixed, j1, [[0, 0, 0], [0, 0, 0], 1])
  useRopeJoint(j1, j2, [[0, 0, 0], [0, 0, 0], 1])
  useRopeJoint(j2, j3, [[0, 0, 0], [0, 0, 0], 1])
  useSphericalJoint(j3, card, [[0, 0, 0], [0, 1.45, 0]])

  // Change cursor when hovering over the badge
  useEffect(() => {
    if (hovered) {
      document.body.style.cursor = dragged ? 'grabbing' : 'grab'
      return () => void (document.body.style.cursor = 'auto')
    }
  }, [hovered, dragged])

  // Main animation and interaction loop
  useFrame((state, delta) => {
    if (dragged) {
      // Convert screen coordinates to 3D space
      vec.set(state.pointer.x, state.pointer.y, 0.5).unproject(state.camera)
      dir.copy(vec).sub(state.camera.position).normalize()
      vec.add(dir.multiplyScalar(state.camera.position.length()))
      
      // Wake up all physics objects
      ;[card, j1, j2, j3, fixed].forEach((ref) => ref.current?.wakeUp())
      
      // Move the card based on pointer position
      card.current?.setNextKinematicTranslation({ 
        x: vec.x - dragged.x, 
        y: vec.y - dragged.y, 
        z: vec.z - dragged.z 
      })
    }
    
    if (fixed.current) {
      // Smooth out jitter when pulling
      ;[j1, j2].forEach((ref) => {
        if (!ref.current.lerped) ref.current.lerped = new THREE.Vector3().copy(ref.current.translation())
        const clampedDistance = Math.max(0.1, Math.min(1, 
          ref.current.lerped.distanceTo(ref.current.translation())))
        ref.current.lerped.lerp(
          ref.current.translation(), 
          delta * (minSpeed + clampedDistance * (maxSpeed - minSpeed))
        )
      })
      
      // Update curve points for the lanyard
      curve.points[0].copy(j3.current.translation())
      curve.points[1].copy(j2.current.lerped)
      curve.points[2].copy(j1.current.lerped)
      curve.points[3].copy(fixed.current.translation())
      band.current.geometry.setPoints(curve.getPoints(32))
      
      // Tilt the card back towards screen for better readability
      ang.copy(card.current.angvel())
      rot.copy(card.current.rotation())
      card.current.setAngvel({ 
        x: ang.x, 
        y: ang.y - rot.y * 0.25, 
        z: ang.z 
      })
    }
  })

  // Set curve type and texture wrapping
  curve.curveType = 'chordal'
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping

  return (
    <>
      <group position={[0, 4, 0]}>
        {/* Fixed anchor point */}
        <RigidBody ref={fixed} {...segmentProps} type="fixed" />
        
        {/* Joint 1 */}
        <RigidBody position={[0.5, 0, 0]} ref={j1} {...segmentProps}>
          <BallCollider args={[0.1]} />
        </RigidBody>
        
        {/* Joint 2 */}
        <RigidBody position={[1, 0, 0]} ref={j2} {...segmentProps}>
          <BallCollider args={[0.1]} />
        </RigidBody>
        
        {/* Joint 3 */}
        <RigidBody position={[1.5, 0, 0]} ref={j3} {...segmentProps}>
          <BallCollider args={[0.1]} />
        </RigidBody>
        
        {/* Card/Badge with name */}
        <RigidBody 
          position={[2, 0, 0]} 
          ref={card} 
          {...segmentProps} 
          type={dragged ? 'kinematicPosition' : 'dynamic'}
        >
          <CuboidCollider args={[0.8, 1.125, 0.01]} />
          <group
            scale={2.25}
            position={[0, -1.2, -0.05]}
            onPointerOver={() => hover(true)}
            onPointerOut={() => hover(false)}
            onPointerUp={(e) => {
              e.target.releasePointerCapture(e.pointerId)
              drag(false)
            }}
            onPointerDown={(e) => {
              e.target.setPointerCapture(e.pointerId)
              drag(new THREE.Vector3().copy(e.point).sub(vec.copy(card.current.translation())))
            }}
          >
            {/* Custom badge implementation */}
            <CustomBadge name={name} />
          </group>
        </RigidBody>
      </group>
      
      {/* Lanyard band */}
      <mesh ref={band}>
        <meshLineGeometry />
        <meshLineMaterial 
          color="#4361ee" 
          depthTest={false} 
          resolution={[width, height]} 
          useMap 
          map={texture} 
          repeat={[-3, 1]} 
          lineWidth={1} 
        />
      </mesh>
    </>
  )
}

// Custom badge component with your name
function CustomBadge({ name }) {
  return (
    <group>
      {/* Badge background */}
      <mesh castShadow>
        <boxGeometry args={[1.6, 2.25, 0.05]} />
        <meshPhysicalMaterial>
          <RenderTexture attach="map">
            <PerspectiveCamera makeDefault position={[0, 0, 5]} />
            <color attach="background" args={['#1e1e24']} />
            
            {/* Header area */}
            <mesh position={[0, 0.7, 0]}>
              <planeGeometry args={[1.5, 0.4]} />
              <meshStandardMaterial color="#4361ee" />
            </mesh>
            
            {/* GitHub logo placeholder */}
            <mesh position={[0, 0.7, 0.01]}>
              <planeGeometry args={[0.3, 0.3]} />
              <meshStandardMaterial color="#ffffff" />
            </mesh>
            
            {/* Name text */}
            <Text
              position={[0, 0.2, 0]}
              fontSize={0.2}
              color="white"
              textAlign="center"
              font="https://fonts.gstatic.com/s/raleway/v14/1Ptrg8zYS_SKggPNwK4vaqI.woff"
              anchorX="center"
              anchorY="middle"
            >
              {name}
            </Text>
            
            {/* Role/title */}
            <Text
              position={[0, -0.1, 0]}
              fontSize={0.12}
              color="#a6a6a6"
              textAlign="center"
              font="https://fonts.gstatic.com/s/raleway/v14/1Ptrg8zYS_SKggPNwK4vaqI.woff"
              anchorX="center"
              anchorY="middle"
            >
              Web Developer
            </Text>
            
            {/* GitHub username */}
            <Text
              position={[0, -0.5, 0]}
              fontSize={0.1}
              color="#4361ee"
              textAlign="center"
              font="https://fonts.gstatic.com/s/firacode/v21/uU9eCBsR6Z2vfE9aq3bL0fxyUs4tcw4W_A9sFVc9.woff"
              anchorX="center"
              anchorY="middle"
            >
              github.com/yourusername
            </Text>
          </RenderTexture>
          <meshPhysicalMaterial 
            clearcoat={1}
            clearcoatRoughness={0.15}
            metalness={0.1}
            roughness={0.3}
          />
        </meshPhysicalMaterial>
      </mesh>
      
      {/* Badge clip */}
      <mesh position={[0, 1.1, 0]} castShadow>
        <boxGeometry args={[0.3, 0.1, 0.1]} />
        <meshStandardMaterial color="#d3d3d3" metalness={0.7} roughness={0.3} />
      </mesh>
    </group>
  )
}

// Create a canvas texture for the lanyard
function createLanyardTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  
  // Background
  ctx.fillStyle = '#2c2c2c'
  ctx.fillRect(0, 0, 256, 64)
  
  // Stripes
  ctx.fillStyle = '#4361ee'
  for (let i = 0; i < 10; i++) {
    ctx.fillRect(i * 30, 0, 15, 64)
  }
  
  // Text
  ctx.fillStyle = 'white'
  ctx.font = 'bold 20px Arial'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('GITHUB', 128, 32)
  
  return canvas
}
