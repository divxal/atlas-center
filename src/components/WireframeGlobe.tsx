import { useEffect, useRef } from "react";
import * as THREE from "three";
import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";
import worldData from "world-atlas/countries-110m.json";
import "../styles/WireframeGlobe.css";

interface NetConn { remote_ip: string; port: number; lat: number; lng: number }

const HOME_LAT = 40.4;
const HOME_LNG = -3.7;
const R = 0.82;

// Conversión estándar lat/lng → esfera Three.js
function ll2xyz(lat: number, lng: number, r = R): THREE.Vector3 {
  const phi   = (90 - lat) * (Math.PI / 180);
  const theta = lng        * (Math.PI / 180);
  return new THREE.Vector3(
    r * Math.sin(phi) * Math.sin(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.cos(theta),
  );
}

// ── Graticule (cuadrícula lat/lng) ───────────────────────────────────────────

function buildGraticule(): THREE.Group {
  const group = new THREE.Group();
  const mat   = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08 });

  for (let lat = -80; lat <= 80; lat += 20) {
    const pts: THREE.Vector3[] = [];
    for (let lng = -180; lng <= 181; lng += 2) pts.push(ll2xyz(lat, lng));
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
  }
  for (let lng = -180; lng < 180; lng += 20) {
    const pts: THREE.Vector3[] = [];
    for (let lat = -90; lat <= 90; lat += 2) pts.push(ll2xyz(lat, lng));
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
  }

  // Ecuador y meridiano 0
  const bright = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 });
  const eq: THREE.Vector3[] = [];
  for (let lng = -180; lng <= 181; lng++) eq.push(ll2xyz(0, lng));
  group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(eq), bright));
  const pm: THREE.Vector3[] = [];
  for (let lat = -90; lat <= 90; lat++) pm.push(ll2xyz(lat, 0));
  group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pm), bright));

  return group;
}

// ── Fronteras de países (topojson → líneas en esfera) ────────────────────────

function buildCountries(): THREE.Group {
  const group = new THREE.Group();
  const mat   = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 });

  const topo = worldData as unknown as Topology;
  const countries = feature(topo, topo.objects.countries as Parameters<typeof feature>[1]);

  for (const feat of (countries as GeoJSON.FeatureCollection).features) {
    const geom = feat.geometry;
    const polys: number[][][][] =
      geom.type === "Polygon"      ? [geom.coordinates as number[][][]] :
      geom.type === "MultiPolygon" ?  geom.coordinates as number[][][][] : [];

    for (const poly of polys) {
      for (const ring of poly) {
        const pts = ring.map(([lng, lat]) => ll2xyz(lat, lng));
        if (pts.length < 2) continue;
        group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
      }
    }
  }
  return group;
}

// ── Arcos de conexiones ───────────────────────────────────────────────────────

function buildArc(fromLat: number, fromLng: number, toLat: number, toLng: number): THREE.Line {
  const a   = ll2xyz(fromLat, fromLng);
  const b   = ll2xyz(toLat,   toLng);
  const mid = a.clone().add(b).multiplyScalar(0.5).normalize().multiplyScalar(R * 1.45);
  const pts = new THREE.QuadraticBezierCurve3(a, mid, b).getPoints(64);
  const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 });
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat);
}

// ── Punto (España) ────────────────────────────────────────────────────────────

function buildDot(lat: number, lng: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.02, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  mesh.position.copy(ll2xyz(lat, lng, R + 0.01));
  return mesh;
}

// ── Componente ────────────────────────────────────────────────────────────────

interface Props { connections: NetConn[] }

export function WireframeGlobe({ connections }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const arcsRef  = useRef<THREE.Group | null>(null);
  const globeRef = useRef<THREE.Group | null>(null);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const W = el.clientWidth || 400;
    const H = el.clientHeight || 400;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);

    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, W / H, 0.1, 100);
    camera.position.z = 3.0;

    // Grupo que rota (globo + arcos juntos)
    const pivot = new THREE.Group();
    scene.add(pivot);

    pivot.add(buildGraticule());
    pivot.add(buildCountries());
    pivot.add(buildDot(HOME_LAT, HOME_LNG));

    const arcsGroup = new THREE.Group();
    pivot.add(arcsGroup);
    arcsRef.current = arcsGroup;
    globeRef.current = pivot;

    // Orientar para que España mire hacia la cámara al inicio
    const homeDir = ll2xyz(HOME_LAT, HOME_LNG).normalize();
    pivot.quaternion.setFromUnitVectors(homeDir, new THREE.Vector3(0, 0, 1));

    let id: number;
    const animate = () => {
      id = requestAnimationFrame(animate);
      pivot.rotation.y += 0.004;
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(id);
      renderer.dispose();
      el.innerHTML = "";
    };
  }, []);

  useEffect(() => {
    const g = arcsRef.current;
    if (!g) return;
    g.clear();
    connections
      .filter(c => c.lat !== 0 || c.lng !== 0)
      .forEach(c => g.add(buildArc(HOME_LAT, HOME_LNG, c.lat, c.lng)));
  }, [connections]);

  return <div ref={mountRef} className="wireframe-globe" />;
}
