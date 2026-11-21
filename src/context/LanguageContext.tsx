import React, { createContext, useContext, useState, useEffect } from 'react';

export type LanguageCode = 'en' | 'te' | 'hi' | 'or' | 'pa';

export interface LanguageOption {
  code: LanguageCode;
  name: string;
  nativeName: string;
}

export const APP_LANGUAGES: LanguageOption[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'or', name: 'Odissa', nativeName: 'ଓଡ଼ିଆ' },
  { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ' },
];

const TRANSLATIONS: Record<LanguageCode, Record<string, string>> = {
  en: {
    // Header & Hero
    altitude: 'Altitude',
    sun_status: 'Sun Status',
    co2_avoided: 'kg CO₂ avoided',
    co2_avoided_live: 'kg CO₂ avoided live',
    peak_sunlight_at: 'Peak sunlight at :',
    settings: 'Settings',
    profile: 'Profile',
    select_language: 'Select Language',
    language_dropdown_hint: 'Select your preferred regional language (English, Telugu, Hindi, Odissa, Punjabi).',

    // Today's Energy
    todays_balance: "Today's Energy Balance & Financial Overview",
    potential_gain: 'Potential Gain',
    actual_usage: 'Actual Usage',
    net_balance: 'Net Balance',
    financial_value: 'Financial Value',
    estimated_today: 'Estimated generation today',
    appliance_demand: 'Total home demand today',
    surplus_export: 'Surplus exported to grid',
    grid_cost_avoided: 'Grid electricity saved today',
    daily_gain_title: "Today's Potential Solar Gain",
    actual_usage_title: 'Actual Daily Appliance Usage',
    net_balance_title: 'Net Energy Balance & Grid Flow',
    financial_value_title: 'Financial Value & Energy Savings',

    // Categories
    energy_planning: 'Energy Planning',
    energy_planning_sub: 'Calculate panel capacity, bill savings & appliances',
    solar_analysis: 'Solar Analysis',
    solar_analysis_sub: 'Real-time 3D sun position, irradiance & shadow mapping',
    maintenance_tools: 'Maintenance & Tools',
    maintenance_tools_sub: 'Panel health, cleaning reminders & solar calibration',

    // Nav Features
    solar_estimator: 'Solar Estimator',
    solar_estimator_desc: 'System sizing, ROI & roof space',
    appliance_analysis: 'Appliance Energy',
    appliance_analysis_desc: 'Itemized consumption breakdown',
    shadow_tracker: 'Shadow Tracker',
    shadow_tracker_desc: 'Obstacle shade mapping',
    solar_maintenance: 'Solar Maintenance',
    solar_maintenance_desc: 'Cleaning log & scheduled checkups',
    sun_suite: 'Sun Tracker Suite',
    sun_suite_desc: 'All-in-one celestial observation suite',
    ar_suite: 'Sun AR Camera',
    ar_suite_desc: 'Augmented reality trajectory',
    sun_angles: 'Solar Angles',
    sun_angles_desc: 'Optimum tilt & azimuth degrees',
    bubble_level: 'Bubble Level',
    bubble_level_desc: 'Dual-axis surface inclinometer',
    solar_activity: 'Space Weather',
    solar_activity_desc: 'Solar flux & geomagnetic storm index',
    power_calculator: 'Power Calculator',
    power_calculator_desc: 'Estimate hourly generation',

    // Settings Modal
    application_settings: 'Application Settings',
    settings_sub: 'Languages, Grid Tariffs & Alerts',
    tab_display: 'Display',
    tab_tariffs: 'Tariffs & Grid',
    tab_alerts: 'Alerts',
    battery_sim: 'Battery Storage Simulation',
    battery_sim_desc: 'Calculate night battery backup in estimator',
    select_state: 'Select Indian State',
    available_grids: 'Available Grids in',
    connection_category: 'Connection Category',
    domestic: 'Domestic',
    commercial: 'Commercial',
    industrial: 'Industrial',
    unit_price: 'Realtime Unit Price (₹/kWh)',
    auto_sync: 'Auto-Synchronized',
    solar_pr: 'Solar PR (Performance Ratio)',
    feed_in: 'Feed-in Export Credit',
    cleaning_reminder: 'Panel Dust Cleaning Reminder',
    cloud_alerts: 'Weather Cloud Alerts',
    reset_data: 'Reset All Applet Data to Defaults',
    cancel: 'Cancel',
    save_settings: 'Save Settings',
    saved: 'Saved!',
    sync_now: 'Sync Now',
    syncing: 'Syncing...',
    hourly_auto_sync: 'Hourly Auto-Sync',
    hourly_auto_sync_desc: 'Auto-refresh weather and peak sun data every hour for real-time accuracy',
    last_synced: 'Updated',
    live_accuracy: 'Real-time accuracy active',
  },

  te: {
    // Header & Hero (Telugu - తెలుగు)
    altitude: 'ఎత్తు (ఆల్టిట్యూడ్)',
    sun_status: 'సూర్యుని స్థితి',
    co2_avoided: 'కిలోల CO₂ ఆదా చేయబడింది',
    co2_avoided_live: 'కిలోల CO₂ ఆదా ప్రత్యక్షంగా',
    peak_sunlight_at: 'గరిష్ట సూర్యరశ్మి వేళ :',
    settings: 'సెట్టింగ్‌లు',
    profile: 'వినియోగదారు ప్రొఫైల్',
    select_language: 'భాషను ఎంచుకోండి',
    language_dropdown_hint: 'మీకు కావలసిన ప్రాంతీయ భాషను ఎంచుకోండి (ఇంగ్లీష్, తెలుగు, హిందీ, ఒడిస్సా, పంజాబీ).',

    // Today's Energy
    todays_balance: 'నేటి సౌర శక్తి & ఆర్థిక సమాచారం',
    potential_gain: 'ఉత్పత్తి సామర్థ్యం',
    actual_usage: 'నిజమైన వినియోగం',
    net_balance: 'నికర శక్తి నిల్వ',
    financial_value: 'ఆర్థిక పొదుపు విలువ',
    estimated_today: 'ఈ రోజు అంచనా ఉత్పత్తి',
    appliance_demand: 'గృహోపకరణాల మొత్తం డిమాండ్',
    surplus_export: 'గ్రిడ్‌కు ఎగుమతి చేసిన మిగులు శక్తి',
    grid_cost_avoided: 'కరెంట్ బిల్లులో పొదుపు చేసిన మొత్తం',
    daily_gain_title: 'నేటి సంభావ్య సౌర లాభం',
    actual_usage_title: 'గృహోపకరణాల వాస్తవ రోజువారీ వినియోగం',
    net_balance_title: 'నికర శక్తి సంతులనం & గ్రిడ్ సరఫరా',
    financial_value_title: 'ఆర్థిక విలువ & కరెంట్ బిల్లు పొదుపు',

    // Categories
    energy_planning: 'శక్తి ప్రణాళిక',
    energy_planning_sub: 'సోలార్ సామర్థ్యం, బిల్లు పొదుపు & పరికరాల గణన',
    solar_analysis: 'సౌర విశ్లేషణ',
    solar_analysis_sub: 'సూర్యుని స్థానం, రేడియేషన్ & నీడ ప్రభావం',
    maintenance_tools: 'నిర్వహణ & సాధనాలు',
    maintenance_tools_sub: 'ప్యానెల్ శుభ్రత రిమైండర్లు & టూల్స్',

    // Nav Features
    solar_estimator: 'సోలార్ ఎస్టిమేటర్',
    solar_estimator_desc: 'సిస్టమ్ సైజు, రాబడి & పైకప్పు విస్తీర్ణం',
    appliance_analysis: 'గృహోపకరణాల విశ్లేషణ',
    appliance_analysis_desc: 'విద్యుత్ వినియోగ సమగ్ర వివరాలు',
    shadow_tracker: 'షాడో ట్రాకర్',
    shadow_tracker_desc: 'భవనాలు, చెట్ల నీడ కవరేజ్ విశ్లేషణ',
    solar_maintenance: 'సోలార్ నిర్వహణ',
    solar_maintenance_desc: 'క్లీనింగ్ లాగ్ & షెడ్యూల్డ్ తనిఖీలు',
    sun_suite: 'సన్ ట్రాకర్ సూట్',
    sun_suite_desc: 'సూర్యుని గమనాన్ని గుర్తించే పూర్తి సాధనం',
    ar_suite: 'సన్ AR కెమెరా',
    ar_suite_desc: 'కెమెరాపై సూర్యుని మార్గం దృశ్య రూపం',
    sun_angles: 'సోలార్ కోణాలు',
    sun_angles_desc: 'సరైన టిల్ట్ మరియు అజిముత్ కోణాలు',
    bubble_level: 'బబుల్ లెవల్',
    bubble_level_desc: 'ప్యానెల్ వాలును సరిచూసే లెవెలర్',
    solar_activity: 'అంతరిక్ష వాతావరణం',
    solar_activity_desc: 'సోలార్ ఫ్లక్స్ & జియోమాగ్నెటిక్ సూచిక',
    power_calculator: 'విద్యుత్ కాలిక్యులేటర్',
    power_calculator_desc: 'గంటలవారీ విద్యుత్ ఉత్పత్తి అంచనా',

    // Settings Modal
    application_settings: 'అప్లికేషన్ సెట్టింగ్‌లు',
    settings_sub: 'భాషలు, గ్రిడ్ టారిఫ్‌లు & హెచ్చరికలు',
    tab_display: 'డిస్ప్లే',
    tab_tariffs: 'టారిఫ్‌లు & గ్రిడ్',
    tab_alerts: 'అలర్టులు',
    battery_sim: 'బ్యాటరీ నిల్వ అనుకరణ',
    battery_sim_desc: 'ఎస్టిమేటర్‌లో రాత్రి బ్యాటరీ బ్యాకప్ గణన',
    select_state: 'రాష్ట్రాన్ని ఎంచుకోండి',
    available_grids: 'అందుబాటులో ఉన్న గ్రిడ్ సంస్థలు',
    connection_category: 'కనెక్షన్ వర్గం',
    domestic: 'గృహ వినియోగం',
    commercial: 'వాణిజ్య వినియోగం',
    industrial: 'పారిశ్రామిక',
    unit_price: 'యూనిట్ ధర (₹/kWh)',
    auto_sync: 'ఆటో-సింక్రనైజ్ చేయబడింది',
    solar_pr: 'సోలార్ PR నిష్పత్తి',
    feed_in: 'గ్రిడ్ ఎగుమతి క్రెడిట్',
    cleaning_reminder: 'ప్యానెల్ క్లీనింగ్ రిమైండర్',
    cloud_alerts: 'మేఘావృత వాతావరణ హెచ్చరికలు',
    reset_data: 'మొత్తం డేటాను రీసెట్ చేయండి',
    cancel: 'రద్దు చేయి',
    save_settings: 'సెట్టింగ్‌లు సేవ్ చేయి',
    saved: 'సేవ్ అయ్యింది!',
    sync_now: 'సింక్ చేయండి',
    syncing: 'సింక్ అవుతోంది...',
    hourly_auto_sync: 'గంటలవారీ ఆటో-సింక్',
    hourly_auto_sync_desc: 'ఖచ్చితమైన సమాచారం కోసం ప్రతి గంటకు వాతావరణం మరియు సూర్యరశ్మి డేటా ఆటో-రిఫ్రెష్',
    last_synced: 'అప్‌డేట్ చేయబడింది',
    live_accuracy: 'ప్రత్యక్ష ఖచ్చితత్వం సక్రియం',
  },

  hi: {
    // Header & Hero (Hindi - हिन्दी)
    altitude: 'ऊंचाई (Altitude)',
    sun_status: 'सूर्य स्थिति',
    co2_avoided: 'किग्रा CO₂ की बचत',
    co2_avoided_live: 'किग्रा CO₂ बचत लाइव',
    peak_sunlight_at: 'अधिकतम धूप का समय :',
    settings: 'सेटिंग्स',
    profile: 'उपभोक्ता प्रोफ़ाइल',
    select_language: 'भाषा चुनें',
    language_dropdown_hint: 'अपनी पसंदीदा क्षेत्रीय भाषा चुनें (अंग्रेजी, तेलुगु, हिंदी, ओड़िशा, पंजाबी)।',

    // Today's Energy
    todays_balance: 'आज का ऊर्जा संतुलन और वित्तीय विवरण',
    potential_gain: 'संभावित उत्पादन',
    actual_usage: 'वास्तविक खपत',
    net_balance: 'नेट ऊर्जा संतुलन',
    financial_value: 'वित्तीय बचत मूल्य',
    estimated_today: 'आज का अनुमानित सौर उत्पादन',
    appliance_demand: 'घर के उपकरणों की कुल खपत',
    surplus_export: 'ग्रिड को निर्यात की गई अतिरिक्त बिजली',
    grid_cost_avoided: 'बिजली बिल में आज की कुल बचत',
    daily_gain_title: 'आज का संभावित सौर लाभ',
    actual_usage_title: 'उपकरणों की वास्तविक दैनिक खपत',
    net_balance_title: 'नेट ऊर्जा संतुलन और ग्रिड प्रवाह',
    financial_value_title: 'वित्तीय मूल्य और बिल बचत',

    // Categories
    energy_planning: 'ऊर्जा नियोजन',
    energy_planning_sub: 'पैनल क्षमता, बिल बचत और उपकरणों की गणना',
    solar_analysis: 'सौर विश्लेषण',
    solar_analysis_sub: 'सूर्य की स्थिति, विकिरण और छाया प्रभाव',
    maintenance_tools: 'रखरखाव और उपकरण',
    maintenance_tools_sub: 'पैनल सफाई रिमाइंडर और संरेखण उपकरण',

    // Nav Features
    solar_estimator: 'सोलर एस्टीमेटर',
    solar_estimator_desc: 'सिस्टम साइज, लागत वापसी और छत का क्षेत्रफल',
    appliance_analysis: 'उपकरण ऊर्जा विश्लेषण',
    appliance_analysis_desc: 'घरेलू बिजली खपत का विवरण',
    shadow_tracker: 'शैडो ट्रैकर',
    shadow_tracker_desc: 'छाया और बाधाओं का मानचित्रण',
    solar_maintenance: 'सोलर रखरखाव',
    solar_maintenance_desc: 'सफाई लॉग और निर्धारित जांच',
    sun_suite: 'सन ट्रैकर सुइट',
    sun_suite_desc: 'सूर्य अवलोकन का संपूर्ण साधन',
    ar_suite: 'सन AR कैमरा',
    ar_suite_desc: 'कैमरे पर वास्तविक सूर्य प्रक्षेपवक्र',
    sun_angles: 'सौर कोण (Angles)',
    sun_angles_desc: 'इष्टतम झुकाव और दिगंश कोण',
    bubble_level: 'बबल लेवल',
    bubble_level_desc: 'पैनल झुकाव संरेखण उपकरण',
    solar_activity: 'अंतरिक्ष मौसम',
    solar_activity_desc: 'सोलर फ्लक्स और भू-चुंबकीय सूचकांक',
    power_calculator: 'पावर कैलकुलेटर',
    power_calculator_desc: 'प्रति घंटे बिजली उत्पादन का अनुमान',

    // Settings Modal
    application_settings: 'एप्लिकेशन सेटिंग्स',
    settings_sub: 'भाषाएं, ग्रिड टैरिफ और अलर्ट',
    tab_display: 'डिस्प्ले',
    tab_tariffs: 'टैरिफ और ग्रिड',
    tab_alerts: 'अलर्ट',
    battery_sim: 'बैटरी स्टोरेज सिमुलेशन',
    battery_sim_desc: 'अनुमानक में रात के बैटरी बैकअप की गणना',
    select_state: 'राज्य का चयन करें',
    available_grids: 'उपलब्ध डिस्कॉम / ग्रिड',
    connection_category: 'कनेक्शन श्रेणी',
    domestic: 'घरेलू (Domestic)',
    commercial: 'वाणिज्यिक',
    industrial: 'औद्योगिक',
    unit_price: 'प्रति यूनिट दर (₹/kWh)',
    auto_sync: 'स्वतः सिंक्रनाइज़',
    solar_pr: 'सोलर प्रदर्शन अनुपात (PR)',
    feed_in: 'ग्रिड निर्यात क्रेडिट',
    cleaning_reminder: 'पैनल सफाई अनुस्मारक',
    cloud_alerts: 'बादल छाने की चेतावनी',
    reset_data: 'सभी डेटा को रीसेट करें',
    cancel: 'रद्द करें',
    save_settings: 'सेटिंग्स सहेजें',
    saved: 'सहेजा गया!',
    sync_now: 'सिंक करें',
    syncing: 'सिंक हो रहा है...',
    hourly_auto_sync: 'प्रति घंटा ऑटो-सिंक',
    hourly_auto_sync_desc: 'सटीक डेटा के लिए हर घंटे मौसम और धूप का डेटा स्वतः रीफ्रेश करें',
    last_synced: 'अपडेटेड',
    live_accuracy: 'लाइव सटीकता सक्रिय',
  },

  or: {
    // Header & Hero (Odissa - ଓଡ଼ିଆ)
    altitude: 'ଉଚ୍ଚତା (Altitude)',
    sun_status: 'ସୂର୍ଯ୍ୟଙ୍କ ସ୍ଥିତି',
    co2_avoided: 'କିଲୋଗ୍ରାମ CO₂ ସଞ୍ଚୟ',
    co2_avoided_live: 'କିଲୋଗ୍ରାମ CO₂ ସଞ୍ଚୟ ଲାଇଭ୍',
    peak_sunlight_at: 'ସର୍ବାଧିକ ସୂର୍ଯ୍ୟକିରଣ ସମୟ :',
    settings: 'ସେଟିଂସମୂହ',
    profile: 'ଉପଭୋକ୍ତା ପ୍ରୋଫାଇଲ୍',
    select_language: 'ଭାଷା ବାଛନ୍ତୁ',
    language_dropdown_hint: 'ଆପଣଙ୍କର ପସନ୍ଦିତା ଆଞ୍ଚଳିକ ଭାଷା ବାଛନ୍ତୁ (ଇଂରାଜୀ, ତେଲୁଗୁ, ହିନ୍ଦୀ, ଓଡ଼ିଶା, ପଞ୍ଜାବୀ)।',

    // Today's Energy
    todays_balance: 'ଆଜିର ସୌର ଶକ୍ତି ଏବଂ ଆର୍ଥିକ ବିବରଣୀ',
    potential_gain: 'ସମ୍ଭାବ୍ୟ ଉତ୍ପାଦନ',
    actual_usage: 'ପ୍ରକୃତ ବ୍ୟବହାର',
    net_balance: 'ନିଟ୍ ଶକ୍ତି ସନ୍ତୁଳନ',
    financial_value: 'ଆର୍ଥିକ ସଞ୍ଚୟ ମୂଲ୍ୟ',
    estimated_today: 'ଆଜିର ଆନୁମାନିକ ଉତ୍ପାଦନ',
    appliance_demand: 'ଉପକରଣଗୁଡ଼ିକର ସମୁଦାୟ ଚାହିଦା',
    surplus_export: 'ଗ୍ରୀଡକୁ ରପ୍ତାନି ହୋଇଥିବା ବଳକା ବିଜୁଳି',
    grid_cost_avoided: 'ବିଦ୍ୟୁତ ବିଲରେ ଆଜିର ସଞ୍ଚୟ',
    daily_gain_title: 'ଆଜିର ସମ୍ଭାବ୍ୟ ସୌର ଲାଭ',
    actual_usage_title: 'ଉପକରଣର ଦୈନିକ ବିଦ୍ୟୁତ ବ୍ୟବହାର',
    net_balance_title: 'ନିଟ୍ ଶକ୍ତି ସନ୍ତୁଳନ ଏବଂ ପ୍ରବାହ',
    financial_value_title: 'ଆର୍ଥିକ ମୂଲ୍ୟ ଏବଂ ସଞ୍ଚୟ',

    // Categories
    energy_planning: 'ଶକ୍ତି ଯୋଜନା',
    energy_planning_sub: 'ପ୍ୟାନେଲ କ୍ଷମତା, ବିଲ୍ ସଞ୍ଚୟ ଏବଂ ଉପକରଣ ଗଣନା',
    solar_analysis: 'ସୌର ବିଶ୍ଳେଷଣ',
    solar_analysis_sub: 'ସୂର୍ଯ୍ୟ ସ୍ଥିତି, ବିକିରଣ ଏବଂ ଛାୟା ମ୍ୟାପିଂ',
    maintenance_tools: 'ରକ୍ଷଣାବେକ୍ଷଣ ଏବଂ ଉପକରଣ',
    maintenance_tools_sub: 'ପ୍ୟାନେଲ ସଫେଇ ସତର୍କତା ଏବଂ ସମନ୍ୱୟ',

    // Nav Features
    solar_estimator: 'ସୋଲାର ଏଷ୍ଟିମେଟର',
    solar_estimator_desc: 'ସିଷ୍ଟମ ଆକାର, ମୂଲ୍ୟ ଫେରସ୍ତ ଏବଂ ଛାତ କ୍ଷେତ୍ର',
    appliance_analysis: 'ଉପକରଣ ବିଶ୍ଳେଷଣ',
    appliance_analysis_desc: 'ଘରୋଇ ଶକ୍ତି ବ୍ୟବହାର ବିବରଣୀ',
    shadow_tracker: 'ଛାୟା ଟ୍ରାକର',
    shadow_tracker_desc: 'ଅବରୋଧ ଛାୟା ବିଶ୍ଳେଷଣ',
    solar_maintenance: 'ସୋଲାର ରକ୍ଷଣାବେକ୍ଷଣ',
    solar_maintenance_desc: 'ସଫେଇ ଲଗ୍ ଏବଂ ନିର୍ଦ୍ଧାରିତ ଯାଞ୍ଚ',
    sun_suite: 'ସୂର୍ଯ୍ୟ ଟ୍ରାକର ସୁଇଟ୍',
    sun_suite_desc: 'ସୂର୍ଯ୍ୟ ନିରୀକ୍ଷଣ ପାଇଁ ସମ୍ପୂର୍ଣ୍ଣ ସୁଇଟ୍',
    ar_suite: 'ସନ୍ AR କ୍ୟାମେରା',
    ar_suite_desc: 'କ୍ୟାମେରାରେ ସୂର୍ଯ୍ୟଙ୍କ ଗତିପଥ',
    sun_angles: 'ସୌର କୋଣ (Angles)',
    sun_angles_desc: 'ସଠିକ୍ ଟିଲ୍ଟ ଏବଂ ଆଜିମୁଥ୍ କୋଣ',
    bubble_level: 'ବବଲ୍ ଲେଭଲ୍',
    bubble_level_desc: 'ପ୍ୟାନେଲ୍ ସଠିକ୍ ସ୍ଥାପନ ଉପକରଣ',
    solar_activity: 'ମହାକାଶ ପାଣିପାଗ',
    solar_activity_desc: 'ସୌର ଫ୍ଲକ୍ସ ଏବଂ ଚୁମ୍ବକୀୟ ସୂଚକାଙ୍କ',
    power_calculator: 'ବିଜୁଳି କାଲକୁଲେଟର',
    power_calculator_desc: 'ପ୍ରତି ଘଣ୍ଟା ଉତ୍ପାଦନ ଆକଳନ',

    // Settings Modal
    application_settings: 'ଆପ୍ଲିକେସନ୍ ସେଟିଂସମୂହ',
    settings_sub: 'ଭାଷା, ଗ୍ରୀଡ୍ ଶୁଳ୍କ ଏବଂ ସତର୍କତା',
    tab_display: 'ପ୍ରଦର୍ଶନ (Display)',
    tab_tariffs: 'ଶୁଳ୍କ ଏବଂ ଗ୍ରୀଡ୍',
    tab_alerts: 'ସତର୍କତା',
    battery_sim: 'ବ୍ୟାଟେରୀ ଷ୍ଟୋରେଜ୍ ଅନୁକରଣ',
    battery_sim_desc: 'ରାତ୍ରି ବ୍ୟାଟେରୀ ବ୍ୟାକଅପ୍ ଗଣନା କରନ୍ତୁ',
    select_state: 'ରାଜ୍ୟ ଚୟନ କରନ୍ତୁ',
    available_grids: 'ଉପଲବ୍ଧ ବିତରଣ କମ୍ପାନୀ (DISCOM)',
    connection_category: 'ସଂଯୋଗ ବର୍ଗ',
    domestic: 'ଘରୋଇ (Domestic)',
    commercial: 'ବାଣିଜ୍ୟିକ',
    industrial: 'ଶିଳ୍ପ',
    unit_price: 'ୟୁନିଟ୍ ପିଛା ମୂଲ୍ୟ (₹/kWh)',
    auto_sync: 'ସ୍ୱୟଂଚାଳିତ ସମନ୍ୱିତ',
    solar_pr: 'ସୋଲାର କାର୍ଯ୍ୟଦକ୍ଷତା ଅନୁପାତ (PR)',
    feed_in: 'ଗ୍ରୀଡ୍ ରପ୍ତାନି କ୍ରେଡିଟ୍',
    cleaning_reminder: 'ଧୂଳି ସଫେଇ ସତର୍କତା',
    cloud_alerts: 'ମେଘୁଆ ପାଗ ସତର୍କତା',
    reset_data: 'ସମସ୍ତ ଡାଟା ରିସେଟ୍ କରନ୍ତୁ',
    cancel: 'ବାତିଲ୍ କରନ୍ତୁ',
    save_settings: 'ସେଭ୍ କରନ୍ତୁ',
    saved: 'ସେଭ୍ ହୋଇଗଲା!',
    sync_now: 'ଏବେ ସିଙ୍କ୍ କରନ୍ତୁ',
    syncing: 'ସିଙ୍କ୍ ହେଉଛି...',
    hourly_auto_sync: 'ଘଣ୍ଟା ଅନୁସାରେ ଅଟୋ-ସିଙ୍କ୍',
    hourly_auto_sync_desc: 'ରିଅଲ୍-ଟାଇମ୍ ସଠିକତା ପାଇଁ ପ୍ରତି ଘଣ୍ଟାରେ ପାଣିପାଗ ଏବଂ ସୂର୍ଯ୍ୟକିରଣ ଡାଟା ଅଟୋ-ରିଫ୍ରେଶ୍',
    last_synced: 'ଅପଡେଟ୍ ହୋଇଛି',
    live_accuracy: 'ଲାଇଭ୍ ସଠିକତା ସକ୍ରିୟ',
  },

  pa: {
    // Header & Hero (Punjabi - ਪੰਜਾਬੀ)
    altitude: 'ਉਚਾਈ (Altitude)',
    sun_status: 'ਸੂਰਜ ਦੀ ਸਥਿਤੀ',
    co2_avoided: 'ਕਿਲੋਗ੍ਰਾਮ CO₂ ਦੀ ਬੱਚਤ',
    co2_avoided_live: 'ਕਿਲੋਗ੍ਰਾਮ CO₂ ਬੱਚਤ ਲਾਈਵ',
    peak_sunlight_at: 'ਸਿਖਰਲੀ ਧੁੱਪ ਦਾ ਸਮਾਂ :',
    settings: 'ਸੈਟਿੰਗਾਂ',
    profile: 'ਖਪਤਕਾਰ ਪ੍ਰੋਫਾਈਲ',
    select_language: 'ਭਾਸ਼ਾ ਚੁਣੋ',
    language_dropdown_hint: 'ਆਪਣੀ ਪਸੰਦੀਦਾ ਖੇਤਰੀ ਭਾਸ਼ਾ ਚੁਣੋ (ਅੰਗਰੇਜ਼ੀ, ਤੇਲਗੂ, ਹਿੰਦੀ, ਉੜੀਸਾ, ਪੰਜਾਬੀ)।',

    // Today's Energy
    todays_balance: 'ਅੱਜ ਦਾ ਸੂਰਜੀ ਊਰਜਾ ਸੰਤੁਲਨ ਅਤੇ ਵਿੱਤੀ ਵੇਰਵਾ',
    potential_gain: 'ਸੰਭਾਵੀ ਉਤਪਾਦਨ',
    actual_usage: 'ਅਸਲ ਵਰਤੋਂ',
    net_balance: 'ਕੁੱਲ ਊਰਜਾ ਸੰਤੁਲਨ',
    financial_value: 'ਵਿੱਤੀ ਬੱਚਤ ਮੁੱਲ',
    estimated_today: 'ਅੱਜ ਦਾ ਅੰਦਾਜ਼ਨ ਸੂਰਜੀ ਉਤਪਾਦਨ',
    appliance_demand: 'ਘਰੇਲੂ ਉਪਕਰਣਾਂ ਦੀ ਕੁੱਲ ਖਪਤ',
    surplus_export: 'ਗਰਿੱਡ ਨੂੰ ਭੇਜੀ ਵਾਧੂ ਬਿਜਲੀ',
    grid_cost_avoided: 'ਬਿਜਲੀ ਬਿੱਲ ਵਿੱਚ ਅੱਜ ਦੀ ਬੱਚਤ',
    daily_gain_title: 'ਅੱਜ ਦਾ ਸੰਭਾਵੀ ਸੂਰਜੀ ਲਾਭ',
    actual_usage_title: 'ਉਪਕਰਣਾਂ ਦੀ ਅਸਲ ਰੋਜ਼ਾਨਾ ਵਰਤੋਂ',
    net_balance_title: 'ਨੈੱਟ ਊਰਜਾ ਸੰਤੁਲਨ ਅਤੇ ਗਰਿੱਡ ਪ੍ਰਵਾਹ',
    financial_value_title: 'ਵਿੱਤੀ ਮੁੱਲ ਅਤੇ ਬਿੱਲ ਬੱਚਤ',

    // Categories
    energy_planning: 'ਊਰਜਾ ਯੋਜਨਾਬੰਦੀ',
    energy_planning_sub: 'ਪੈਨਲ ਸਮਰੱਥਾ, ਬਿੱਲ ਬੱਚਤ ਅਤੇ ਉਪਕਰਣਾਂ ਦੀ ਗਣਨਾ',
    solar_analysis: 'ਸੂਰਜੀ ਵਿਸ਼ਲੇਸ਼ਣ',
    solar_analysis_sub: 'ਸੂਰਜ ਦੀ ਸਥਿਤੀ, ਰੇਡੀਏਸ਼ਨ ਅਤੇ ਪਰਛਾਵਾਂ ਮੈਪਿੰਗ',
    maintenance_tools: 'ਸੰਭਾਲ ਅਤੇ ਔਜ਼ਾਰ',
    maintenance_tools_sub: 'ਪੈਨਲ ਸਫ਼ਾਈ ਰੀਮਾਈਂਡਰ ਅਤੇ ਟੂਲਸ',

    // Nav Features
    solar_estimator: 'ਸੋਲਰ ਅੰਦਾਜ਼ਾਕਰਤਾ',
    solar_estimator_desc: 'ਸਿਸਟਮ ਦਾ ਆਕਾਰ, ਲਾਗਤ ਵਾਪਸੀ ਅਤੇ ਛੱਤ ਦਾ ਖੇਤਰ',
    appliance_analysis: 'ਉਪਕਰਣ ਵਿਸ਼ਲੇਸ਼ਣ',
    appliance_analysis_desc: 'ਬਿਜਲੀ ਖਪਤ ਦਾ ਪੂਰਾ ਵੇਰਵਾ',
    shadow_tracker: 'ਸ਼ੈਡੋ ਟਰੈਕਰ',
    shadow_tracker_desc: 'ਰੁਕਾਵਟਾਂ ਦੇ ਪਰਛਾਵੇਂ ਦਾ ਵਿਸ਼ਲੇਸ਼ਣ',
    solar_maintenance: 'ਸੋਲਰ ਸੰਭਾਲ',
    solar_maintenance_desc: 'ਸਫ਼ਾਈ ਲੌਗ ਅਤੇ ਸਮਾਂ-ਸਾਰਣੀ ਜਾਂਚ',
    sun_suite: 'ਸਨ ਟਰੈਕਰ ਸੂਟ',
    sun_suite_desc: 'ਸੂਰਜ ਨਿਰੀਖਣ ਲਈ ਮੁਕੰਮਲ ਸੂਟ',
    ar_suite: 'ਸਨ AR ਕੈਮਰਾ',
    ar_suite_desc: 'ਕੈਮਰੇ ਉੱਤੇ ਸੂਰਜ ਦਾ ਰਸਤਾ',
    sun_angles: 'ਸੂਰਜੀ ਕੋਣ (Angles)',
    sun_angles_desc: 'ਸਹੀ ਝੁਕਾਅ ਅਤੇ ਅਜ਼ੀਮੁਥ ਕੋਣ',
    bubble_level: 'ਬੱਬਲ ਲੈਵਲ',
    bubble_level_desc: 'ਪੈਨਲ ਢਲਾਣ ਮਾਪਣ ਵਾਲਾ ਯੰਤਰ',
    solar_activity: 'ਪੁਲਾੜ ਮੌਸਮ',
    solar_activity_desc: 'ਸੋਲਰ ਫਲੈਕਸ ਅਤੇ ਚੁੰਬਕੀ ਸੂਚਕਾਂਕ',
    power_calculator: 'ਪਾਵਰ ਕੈਲਕੁਲੇਟਰ',
    power_calculator_desc: 'ਹਰ ਘੰਟੇ ਬਿਜਲੀ ਉਤਪਾਦਨ ਦਾ ਅੰਦਾਜ਼ਾ',

    // Settings Modal
    application_settings: 'ਐਪਲੀਕੇਸ਼ਨ ਸੈਟਿੰਗਾਂ',
    settings_sub: 'ਭਾਸ਼ਾਵਾਂ, ਗਰਿੱਡ ਟੈਰਿਫ ਅਤੇ ਅਲਰਟ',
    tab_display: 'ਡਿਸਪਲੇਅ',
    tab_tariffs: 'ਟੈਰਿਫ ਅਤੇ ਗਰਿੱਡ',
    tab_alerts: 'ਅਲਰਟ',
    battery_sim: 'ਬੈਟਰੀ ਸਟੋਰੇਜ ਸਿਮੂਲੇਸ਼ਨ',
    battery_sim_desc: 'ਰਾਤ ਦੇ ਬੈਟਰੀ ਬੈਕਅੱਪ ਦੀ ਗਣਨਾ ਕਰੋ',
    select_state: 'ਰਾਜ ਚੁਣੋ',
    available_grids: 'ਉਪਲਬਧ ਗਰਿੱਡ / ਬਿਜਲੀ ਬੋਰਡ',
    connection_category: 'ਕਨੈਕਸ਼ਨ ਸ਼੍ਰੇਣੀ',
    domestic: 'ਘਰੇਲੂ (Domestic)',
    commercial: 'ਵਪਾਰਕ',
    industrial: 'ਉਦਯੋਗਿਕ',
    unit_price: 'ਪ੍ਰਤੀ ਯੂਨਿਟ ਦਰ (₹/kWh)',
    auto_sync: 'ਆਟੋ-ਸਿੰਕ੍ਰੋਨਾਈਜ਼ਡ',
    solar_pr: 'ਸੋਲਰ ਕਾਰਗੁਜ਼ਾਰੀ ਅਨੁਪਾਤ (PR)',
    feed_in: 'ਗਰਿੱਡ ਨਿਰਯਾਤ ਕ੍ਰੈਡਿਟ',
    cleaning_reminder: 'ਪੈਨਲ ਸਫ਼ਾਈ ਰੀਮਾਈਂਡਰ',
    cloud_alerts: 'ਬੱਦਲਵਾਈ ਮੌਸਮ ਦੀ ਚੇਤਾਵਨੀ',
    reset_data: 'ਸਾਰਾ ਡਾਟਾ ਰੀਸੈੱਟ ਕਰੋ',
    cancel: 'ਰੱਦ ਕਰੋ',
    save_settings: 'ਸੈਟਿੰਗਾਂ ਸੰਭਾਲੋ',
    saved: 'ਸੰਭਾਲਿਆ ਗਿਆ!',
    sync_now: 'ਹੁਣੇ ਸਿੰਕ ਕਰੋ',
    syncing: 'ਸਿੰਕ ਹੋ ਰਿਹਾ ਹੈ...',
    hourly_auto_sync: 'ਹਰ ਘੰਟੇ ਆਟੋ-ਸਿੰਕ',
    hourly_auto_sync_desc: 'ਅਸਲ-ਸਮੇਂ ਦੀ ਸ਼ੁੱਧਤਾ ਲਈ ਹਰ ਘੰਟੇ ਮੌਸਮ ਅਤੇ ਸੂਰਜੀ ਧੁੱਪ ਡਾਟਾ ਆਟੋ-ਰੀਫ੍ਰੈਸ਼ ਕਰੋ',
    last_synced: 'ਅੱਪਡੇਟ ਕੀਤਾ',
    live_accuracy: 'ਲਾਈਵ ਸ਼ੁੱਧਤਾ ਸਰਗਰਮ',
  },
};

interface LanguageContextType {
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  t: (key: string, fallback?: string) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  language: 'en',
  setLanguage: () => {},
  t: (key: string, fallback?: string) => fallback || key,
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<LanguageCode>(() => {
    try {
      const saved = localStorage.getItem('solar_setting_language') as LanguageCode;
      if (saved && TRANSLATIONS[saved]) {
        return saved;
      }
    } catch {
      // ignore
    }
    return 'en';
  });

  const setLanguage = (lang: LanguageCode) => {
    if (TRANSLATIONS[lang]) {
      setLanguageState(lang);
      try {
        localStorage.setItem('solar_setting_language', lang);
      } catch {
        // ignore
      }
    }
  };

  const t = (key: string, fallback?: string): string => {
    const langDict = TRANSLATIONS[language] || TRANSLATIONS.en;
    if (langDict[key]) return langDict[key];
    const enDict = TRANSLATIONS.en;
    if (enDict[key]) return enDict[key];
    return fallback || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
