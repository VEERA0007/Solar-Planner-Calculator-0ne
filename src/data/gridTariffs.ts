export interface GridOption {
  id: string;
  name: string;
  shortName: string;
  coverage: string;
}

export type GridCategory = 'domestic' | 'commercial' | 'industrial';

export interface StateGridData {
  stateId: string;
  stateName: string;
  defaultPR: number; // e.g. 79.2% for Telangana
  grids: GridOption[];
  tariffs: {
    domestic: {
      rate: number; // unit price in ₹/kWh
      slabLabel: string;
      feedInRate: number;
      pr: number; // Performance ratio %
    };
    commercial: {
      rate: number;
      slabLabel: string;
      feedInRate: number;
      pr: number;
    };
    industrial: {
      rate: number;
      slabLabel: string;
      feedInRate: number;
      pr: number;
    };
  };
}

export const STATE_GRID_DATABASE: Record<string, StateGridData> = {
  telangana: {
    stateId: 'telangana',
    stateName: 'Telangana',
    defaultPR: 79.2,
    grids: [
      {
        id: 'tgspdcl',
        name: 'TGSPDCL (Southern Power Distribution of Telangana)',
        shortName: 'TGSPDCL (TSSPDCL)',
        coverage: 'Hyderabad, Rangareddy, Medchal, Mahabubnagar, Nalgonda',
      },
      {
        id: 'tgnpdcl',
        name: 'TGNPDCL (Northern Power Distribution of Telangana)',
        shortName: 'TGNPDCL (TSNPDCL)',
        coverage: 'Warangal, Karimnagar, Nizamabad, Khammam, Adilabad',
      },
    ],
    tariffs: {
      domestic: {
        rate: 7.2,
        slabLabel: 'LT-I Domestic (Slab 200-400 Units / Month)',
        feedInRate: 3.8,
        pr: 79.2,
      },
      commercial: {
        rate: 9.8,
        slabLabel: 'LT-II Non-Domestic / Commercial',
        feedInRate: 4.2,
        pr: 80.0,
      },
      industrial: {
        rate: 8.6,
        slabLabel: 'LT-III Industrial / Power Intensive',
        feedInRate: 4.0,
        pr: 81.5,
      },
    },
  },

  andhra_pradesh: {
    stateId: 'andhra_pradesh',
    stateName: 'Andhra Pradesh',
    defaultPR: 80.8,
    grids: [
      {
        id: 'apspdcl',
        name: 'APSPDCL (Southern Power Distribution of AP)',
        shortName: 'APSPDCL',
        coverage: 'Tirupati, Nellore, Kadapa, Chittoor, Anantapur, Kurnool',
      },
      {
        id: 'apepdcl',
        name: 'APEPDCL (Eastern Power Distribution of AP)',
        shortName: 'APEPDCL',
        coverage: 'Visakhapatnam, Srikakulam, Vizianagaram, Godavari',
      },
      {
        id: 'apcpdcl',
        name: 'APCPDCL (Central Power Distribution of AP)',
        shortName: 'APCPDCL',
        coverage: 'Vijayawada, Guntur, Krishna, Prakasam',
      },
    ],
    tariffs: {
      domestic: {
        rate: 6.85,
        slabLabel: 'LT-I Domestic (Category B/C Standard)',
        feedInRate: 3.5,
        pr: 80.8,
      },
      commercial: {
        rate: 9.4,
        slabLabel: 'LT-II Commercial Services',
        feedInRate: 3.8,
        pr: 81.5,
      },
      industrial: {
        rate: 8.2,
        slabLabel: 'LT-III General Industrial Supply',
        feedInRate: 3.75,
        pr: 82.0,
      },
    },
  },

  odissa: {
    stateId: 'odissa',
    stateName: 'Odissa',
    defaultPR: 77.8,
    grids: [
      {
        id: 'tpcodl',
        name: 'TPCODL (TP Central Odisha Distribution)',
        shortName: 'TPCODL (Central)',
        coverage: 'Bhubaneswar, Cuttack, Puri, Dhenkanal, Kendrapara',
      },
      {
        id: 'tpwodl',
        name: 'TPWODL (TP Western Odisha Distribution)',
        shortName: 'TPWODL (Western)',
        coverage: 'Sambalpur, Rourkela, Jharsuguda, Bargarh, Balangir',
      },
      {
        id: 'tpnodl',
        name: 'TPNODL (TP Northern Odisha Distribution)',
        shortName: 'TPNODL (Northern)',
        coverage: 'Balasore, Bhadrak, Baripada, Keonjhar, Mayurbhanj',
      },
      {
        id: 'tpsodl',
        name: 'TPSODL (TP Southern Odisha Distribution)',
        shortName: 'TPSODL (Southern)',
        coverage: 'Berhampur, Ganjam, Gajapati, Koraput, Rayagada',
      },
    ],
    tariffs: {
      domestic: {
        rate: 5.7,
        slabLabel: 'OERC Domestic (Slab >300 Units)',
        feedInRate: 3.6,
        pr: 77.8,
      },
      commercial: {
        rate: 8.1,
        slabLabel: 'General Purpose Commercial LT',
        feedInRate: 3.9,
        pr: 78.5,
      },
      industrial: {
        rate: 7.4,
        slabLabel: 'Medium Power Industry / HT',
        feedInRate: 3.75,
        pr: 79.2,
      },
    },
  },

  chandigarh: {
    stateId: 'chandigarh',
    stateName: 'Chandigarh (UT)',
    defaultPR: 76.5,
    grids: [
      {
        id: 'ced',
        name: 'CED (Chandigarh Electricity Department)',
        shortName: 'CED (Chandigarh)',
        coverage: 'Entire Chandigarh Capital Region & Industrial Area',
      },
    ],
    tariffs: {
      domestic: {
        rate: 4.8,
        slabLabel: 'JERC Domestic Supply (Slab 151-400 Units)',
        feedInRate: 3.99,
        pr: 76.5,
      },
      commercial: {
        rate: 6.9,
        slabLabel: 'Commercial / Non-Residential LT',
        feedInRate: 4.1,
        pr: 77.2,
      },
      industrial: {
        rate: 5.6,
        slabLabel: 'Small & Medium Industrial Supply',
        feedInRate: 3.99,
        pr: 78.0,
      },
    },
  },
};

// Backwards compatibility alias
STATE_GRID_DATABASE.odisha = STATE_GRID_DATABASE.odissa;

export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'or', name: 'Odissa', nativeName: 'ଓଡ଼ିଆ' },
  { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ' },
];
