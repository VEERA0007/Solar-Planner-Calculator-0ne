export type InstallerWorkflowStage =
  | 'step1_media'
  | 'step2_map_trace'
  | 'step3_cad_zones'
  | 'step4_building_3d'
  | 'step5_structure_panels'
  | 'step6_visual_video'
  | 'step7_pvsyst_report';

export type RoofStructureType = 'rcc_flat' | 'gabled' | 'shed_slope';

export type AssemblyLayerMode =
  | 'building_only'
  | 'structure_only'
  | 'structure_and_panels';

export type MmsStructureStyle = 'low_rise' | 'elevated_pergola' | 'tiered_split';

export interface MmsStructureDesignConfig {
  structureStyle: MmsStructureStyle;
  columnGridSpacingM: number;
  includeCrossBracing: boolean;
  includeBrickPedestals: boolean;
  showZoneCountBadges: boolean;
  assemblyLayer: AssemblyLayerMode;
}

export interface SiteMediaAsset {
  id: string;
  kind: 'drawing' | 'photo' | 'video360';
  name: string;
  url: string;
  mimeType: string;
  addedAtIso: string;
  naturalWidth?: number;
  naturalHeight?: number;
  scalePointA?: { xNorm: number; yNorm: number };
  scalePointB?: { xNorm: number; yNorm: number };
  knownDistanceM?: number;
  calibratedPxPerMeter?: number;
  estimatedSpanWidthM?: number;
  estimatedSpanHeightM?: number;
  notes?: string;
}

export interface SiteMeasurements {
  roofLengthM: number;
  roofWidthM: number;
  buildingHeightM: number;
  roofStructureType: RoofStructureType;
  parapetHeightM: number;
  walkwayWidthM: number;
  walkwayEveryRows: number;
  perimeterSetbackM: number;
  mmsClearanceM: number;
  moduleWp: number;
  surveyorNotes: string;
}

export interface UploadedDrawingOverlay {
  url: string;
  name: string;
  widthM: number;
  depthM: number;
  opacity: number;
  rotationDeg: number;
  offsetX?: number;
  offsetY?: number;
  visible: boolean;
}

export interface WalkwayCorridorENU {
  id: string;
  label: string;
  cx: number;
  cy: number;
  lengthM: number;
  widthM: number;
  rotationDeg: number;
}

export interface InspectionCheckItem {
  id: string;
  code: string;
  category: 'Site & Drawing' | 'AutoCAD 3D & Walkways' | 'PVsyst Optics' | 'Safety & Handover';
  label: string;
  requirement: string;
  autoPass: boolean;
  autoDetail: string;
  manualVerified: boolean;
  notes: string;
}

export interface CompletedSurveyRecord {
  surveyId: string;
  completedAtIso: string;
  inspectorName: string;
  projectTitle: string;
  status: 'Completed' | 'Draft';
  summaryRemarks: string;
}

export interface PotentialPvZone {
  id: string;
  name: string;
  zoneType: 'rooftop' | 'ground';
  centerX: number; // ENU East(+)/West(-) meters
  centerY: number; // ENU North(+)/South(-) meters
  widthM: number;
  depthM: number;
  tiltDeg: number;
  azimuthDeg: number;
  panelCount?: number;
  elevationOffsetM?: number;
  enabled?: boolean;
}

export type RealMapSource = 'hybrid' | 'satellite' | 'esri' | 'streets';

export interface RealMapGroundOverlay {
  dataUrl: string;
  source: RealMapSource;
  zoom: number;
  centerLat: number;
  centerLon: number;
  boundsENU: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
  fetchedAtIso: string;
  visible: boolean;
  opacity: number;
}

export interface SiteVerificationStatus {
  mapImageVerified: boolean;
  buildingPhotosVerified: boolean;
  surroundingBuildingsVerified: boolean;
  osmBuildingsCount: number;
  hostBuildingDetected: boolean;
  verifiedAtIso?: string;
}
