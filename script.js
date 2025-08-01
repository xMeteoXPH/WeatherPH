// Replace with your Weatherbit API key
// Get a free API key at https://www.weatherbit.io/account/create
const API_KEY = 'e37bb667c03c4f2baa0536ad73a511d2';

// --- Typhoon Track Visualization with Manual Input (Static Cone) ---
if (document.getElementById('map')) {
  // Center and zoom the map over the Philippines by default
  // Set map maxZoom to 10 for RainViewer compatibility
  const map = L.map('map', { zoomControl: false, minZoom: 2, maxZoom: 10 }).setView([13, 122], 4);

  // Define base layers
  const darkLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 12,
    minZoom: 4
  });

  // Add default base layer
  darkLayer.addTo(map);

  // --- Live Cloud Maps Static Image Overlay (Clouds Only) ---
  // (Removed all Live Cloud overlay logic and attribution)

  // --- Remove Cloud Overlay Toggle Button ---
  // (Removed cloudBtnContainer, makeCloudBtn, btnLiveCloud, and related logic)

  // Start with Live Cloud overlay ON by default
  // addLiveCloudOverlay(); // This line is removed

  // Add layer control
  const baseLayers = {
    "Dark": darkLayer
  };

  // Remove Open-Meteo satellite overlay
  // Add OpenWeatherMap wind overlay
  // const OWM_API_KEY = '515ad5cdb3c1ad52ce5d99a181c5af8e';
  // const windLayer = L.tileLayer('https://tile.openweathermap.org/map/wind_new/{z}/{x}/{y}.png?appid=' + OWM_API_KEY, {
  //   attribution: 'Wind data &copy; <a href="https://openweathermap.org/">OpenWeatherMap</a>',
  //   maxZoom: 12,
  //   opacity: 0.7,
  //   transparent: true
  // });

  // const overlays = {
  //   "Wind (OpenWeatherMap)": windLayer
  // };

  // L.control.layers(baseLayers, null, { position: 'topright', collapsed: false }).addTo(map);

  // (Removed RainViewer animation control, so nothing is added here)

  // Store forecast points (let so we can update)
  let forecastPoints = [];

  // Load saved points from localStorage if available
  if (localStorage.getItem('forecastPoints')) {
    try {
      forecastPoints = JSON.parse(localStorage.getItem('forecastPoints')) || [];
    } catch (e) {
      forecastPoints = [];
    }
  }

  function saveForecastPoints() {
    localStorage.setItem('forecastPoints', JSON.stringify(forecastPoints));
  }

  // Static cone polygon
  const conePolygon = [
    [25.5, 120.5],
    [31.5, 124.5],
    [31.5, 127.5],
    [25.5, 123.5]
  ];

  // --- Adjustable Wind Radii Sliders ---
  const orangeWindSlider = document.getElementById('orangeWindSlider');
  const redWindSlider = document.getElementById('redWindSlider');

  // Load saved wind radii from localStorage
  let windRadiiValues = {
    orange: 165000,
    red: 77000
  };
  if (localStorage.getItem('windRadiiValues')) {
    try {
      windRadiiValues = JSON.parse(localStorage.getItem('windRadiiValues')) || windRadiiValues;
    } catch (e) {}
  }

  function saveWindRadiiValues() {
    localStorage.setItem('windRadiiValues', JSON.stringify(windRadiiValues));
  }

  if (orangeWindSlider) {
    orangeWindSlider.value = windRadiiValues.orange;
    orangeWindSlider.oninput = function(e) {
      windRadiiValues.orange = parseInt(e.target.value);
      saveWindRadiiValues();
      drawTrack();
      updateConeLayer();
      updateCustomLineLayer();
    };
  }
  if (redWindSlider) {
    redWindSlider.value = windRadiiValues.red;
    redWindSlider.oninput = function(e) {
      windRadiiValues.red = parseInt(e.target.value);
      saveWindRadiiValues();
      drawTrack();
      updateConeLayer();
      updateCustomLineLayer();
    };
  }

  // Update windRadii array to use adjustable values
  let windRadii = [
    { radius: windRadiiValues.orange, color: '#a67c52', fillColor: '#a67c52', fillOpacity: 0.35 },
    { radius: windRadiiValues.red, color: '#e74c3c', fillColor: '#e74c3c', fillOpacity: 0.5 }
  ];

  // Keep references to layers so we can remove them before redraw
  let cone = null;
  let trackLine = null;
  let pointCircles = [];
  let windCircles = [];
  let calloutLines = [];
  let labelMarkers = [];

  // --- Wind Radii Hide/Show Buttons ---
  const toggleOrangeWindBtn = document.getElementById('toggleOrangeWindBtn');
  const toggleRedWindBtn = document.getElementById('toggleRedWindBtn');

  // Load visibility from localStorage
  let windRadiiVisibility = { orange: true, red: true };
  if (localStorage.getItem('windRadiiVisibility')) {
    try {
      windRadiiVisibility = JSON.parse(localStorage.getItem('windRadiiVisibility')) || windRadiiVisibility;
    } catch (e) {}
  }
  function saveWindRadiiVisibility() {
    localStorage.setItem('windRadiiVisibility', JSON.stringify(windRadiiVisibility));
  }

  function updateWindRadiiButtons() {
    if (toggleOrangeWindBtn) toggleOrangeWindBtn.textContent = windRadiiVisibility.orange ? 'Hide Orange' : 'Show Orange';
    if (toggleRedWindBtn) toggleRedWindBtn.textContent = windRadiiVisibility.red ? 'Hide Red' : 'Show Red';
  }
  updateWindRadiiButtons();

  if (toggleOrangeWindBtn) {
    toggleOrangeWindBtn.onclick = function() {
      windRadiiVisibility.orange = !windRadiiVisibility.orange;
      saveWindRadiiVisibility();
      updateWindRadiiButtons();
      drawTrack();
      updateConeLayer();
      updateCustomLineLayer();
    };
  }
  if (toggleRedWindBtn) {
    toggleRedWindBtn.onclick = function() {
      windRadiiVisibility.red = !windRadiiVisibility.red;
      saveWindRadiiVisibility();
      updateWindRadiiButtons();
      drawTrack();
      updateConeLayer();
      updateCustomLineLayer();
    };
  }

  // Patch drawTrack to respect visibility
  const originalDrawTrack2 = drawTrack;
  drawTrack = function() {
    windRadii = [];
    if (windRadiiVisibility.orange) {
      windRadii.push({ radius: windRadiiValues.orange, color: '#a67c52', fillColor: '#a67c52', fillOpacity: 0.35 });
    }
    if (windRadiiVisibility.red) {
      windRadii.push({ radius: windRadiiValues.red, color: '#e74c3c', fillColor: '#e74c3c', fillOpacity: 0.5 });
    }
    originalDrawTrack2();
  };

  // Create a LayerGroup for all typhoon features, but do NOT add to map by default
  const typhoonLayerGroup = L.layerGroup();

  function drawTrack() {
    // Remove previous cone, track, points, wind circles, callout lines, label markers
    typhoonLayerGroup.clearLayers();
    pointCircles = [];
    windCircles = [];
    calloutLines = [];
    labelMarkers = [];
    // Only draw wind radii if there is at least one point
    if (forecastPoints.length > 0) {
      let windCenter = [forecastPoints[0].lat, forecastPoints[0].lon];
  windRadii.forEach(wr => {
        const windCircle = L.circle(windCenter, {
          radius: wr.radius, color: wr.color, fillColor: wr.fillColor, fillOpacity: wr.fillOpacity, weight: 1
        }).addTo(typhoonLayerGroup);
        windCircles.push(windCircle);
      });
    }
    // Draw main track (connect all points in order)
  const trackLatLngs = forecastPoints.map(pt => [pt.lat, pt.lon]);
    if (trackLatLngs.length > 0) {
      trackLine = L.polyline(trackLatLngs, { color: '#fff', weight: 1, opacity: 0.9 }).addTo(typhoonLayerGroup);
    }
    forecastPoints.forEach((pt, idx) => {
      // Use custom hurricane icon for the point
      const hurricaneIcon = L.icon({
        iconUrl: 'hurricane.png',
        iconSize: [12, 12],
        iconAnchor: [6, 6],
        className: 'hurricane-point-icon'
      });
      const marker = L.marker([pt.lat, pt.lon], { icon: hurricaneIcon, interactive: true }).addTo(typhoonLayerGroup);
      pointCircles.push(marker);
      // Place the label marker with custom icon
      let labelLatLng;
      if (pt.labelLat !== undefined && pt.labelLng !== undefined) {
        labelLatLng = [pt.labelLat, pt.labelLng];
      } else {
        let offsetX = 60;
        let offsetY = 30;
        if (forecastPoints.length === 1) {
          // Only one point, use default offset
          offsetX = 60;
          offsetY = 30;
        } else {
        let refIdx = idx < forecastPoints.length - 1 ? idx + 1 : idx - 1;
        let refPt = forecastPoints[refIdx];
        if (refPt.lon < pt.lon) offsetX = -60;
          offsetY = (idx % 2 === 0) ? 30 : -30;
        }
        const pointPx = map.latLngToLayerPoint([pt.lat, pt.lon]);
        const labelPx = pointPx.add([offsetX, offsetY]);
        labelLatLng = map.layerPointToLatLng(labelPx);
      }
      const labelIcon = L.divIcon({
        className: 'typhoon-label',
        html: `<div>${pt.label} ${pt.time}</div>`,
        iconAnchor: [0, 0],
      });
      const labelMarker = L.marker(labelLatLng, {
        icon: labelIcon,
        draggable: true,
        interactive: true
      }).addTo(typhoonLayerGroup);
      labelMarkers.push(labelMarker);
      // Draw the callout line from the point to the label marker
      function drawCallout() {
        if (calloutLines[idx]) typhoonLayerGroup.removeLayer(calloutLines[idx]);
        calloutLines[idx] = L.polyline([[pt.lat, pt.lon], labelMarker.getLatLng()], {
    color: '#fff',
          weight: 1.5,
          opacity: 0.8,
          dashArray: '2 4',
          interactive: false
        }).addTo(typhoonLayerGroup);
      }
      drawCallout();
      labelMarker.on('drag', function(e) {
        const newLatLng = e.target.getLatLng();
        pt.labelLat = newLatLng.lat;
        pt.labelLng = newLatLng.lng;
        saveForecastPoints();
        drawCallout();
      });
    });
    updatePointSelect();
    saveForecastPoints();
  }

  // Update the select box for deleting points
  const pointSelect = document.getElementById('pointSelect');
  function updatePointSelect() {
    if (!pointSelect) return;
    pointSelect.innerHTML = '';
  forecastPoints.forEach((pt, idx) => {
      const opt = document.createElement('option');
      opt.value = idx;
      opt.text = `${pt.label} (${pt.lat}, ${pt.lon})`;
      pointSelect.appendChild(opt);
    });
  }

  // --- Draw Philippine Area of Responsibility (PAR) ---
  let parLine = null;
  function drawPAR() {
    // Coordinates: 5°N 115°E, 15°N 115°E, 21°N 120°E, 25°N 120°E, 25°N 135°E, 5°N 135°E, and back to 5°N 115°E
    const parCoords = [
      [5, 115],
      [15, 115],
      [21, 120],
      [25, 120],
      [25, 135],
      [5, 135],
      [5, 115] // Close the polygon
    ];
    if (parLine) { map.removeLayer(parLine); parLine = null; }
    parLine = L.polyline(parCoords, {
      color: '#fff',
      weight: 1, // Thinner line
      opacity: 0.9,
      dashArray: '8 8', // Broken/dashed line
      fill: false,
      interactive: false
    });
    if (document.getElementById('toggleParLine')?.checked) {
      parLine.addTo(map);
    }
  }

  // Remove drawTracedConeOfUncertainty and its call

  // Initial draw
  drawTrack();
  drawPAR();

  // PAR Line toggle logic
  const toggleParLine = document.getElementById('toggleParLine');
  if (toggleParLine) {
    toggleParLine.addEventListener('change', function() {
      if (toggleParLine.checked) {
        if (parLine && !map.hasLayer(parLine)) parLine.addTo(map);
      } else {
        if (parLine && map.hasLayer(parLine)) map.removeLayer(parLine);
      }
    });
  }

  // Add hide/show arrow button for Leaflet layer control (only once, only for the topmost control)
  setTimeout(function() {
    var layerControl = document.querySelector('.leaflet-control-layers');
    if (layerControl && !document.getElementById('leafletLayerToggleBtn')) {
      var toggleBtn = document.createElement('button');
      toggleBtn.id = 'leafletLayerToggleBtn';
      toggleBtn.innerHTML = '⯈'; // right arrow
      toggleBtn.title = 'Hide layer control';
      toggleBtn.style.position = 'absolute';
      toggleBtn.style.top = '8px';
      toggleBtn.style.right = '-28px';
      toggleBtn.style.zIndex = 10003;
      toggleBtn.style.width = '24px';
      toggleBtn.style.height = '24px';
      toggleBtn.style.borderRadius = '12px';
      toggleBtn.style.border = '1px solid #bbb';
      toggleBtn.style.background = '#fff';
      toggleBtn.style.boxShadow = '0 1px 4px rgba(0,0,0,0.12)';
      toggleBtn.style.cursor = 'pointer';
      toggleBtn.style.fontSize = '16px';
      toggleBtn.style.padding = '0';
      toggleBtn.style.display = 'flex';
      toggleBtn.style.alignItems = 'center';
      toggleBtn.style.justifyContent = 'center';
      layerControl.parentElement.style.position = 'relative';
      layerControl.parentElement.appendChild(toggleBtn);
      let shown = true;
      toggleBtn.onclick = function() {
        shown = !shown;
        if (shown) {
          layerControl.style.display = '';
          toggleBtn.innerHTML = '⯈';
          toggleBtn.title = 'Hide layer control';
        } else {
          layerControl.style.display = 'none';
          toggleBtn.innerHTML = '⯇';
          toggleBtn.title = 'Show layer control';
        }
      };
    }
  }, 500);

  // Add country boundaries with a very thin, light gray outline (non-interactive, added before provinces)
  fetch('https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson')
    .then(res => res.json())
    .then(data => {
      L.geoJSON(data, {
        style: {
          color: '#bbb', // Light gray outline
          weight: 0.2,   // Very thin
          fill: false,
          opacity: 0.7
        },
        interactive: false
      }).addTo(map);
    });

  // --- Removed Philippine provinces (ADM2) boundary layer fetch due to missing file and CORS issues ---
  // --- Direct Quezon Province Polygon Overlay (approximate shape) ---

  // Handle form input for adding points
  const form = document.getElementById('typhoonPointForm');
  if (form) {
    form.addEventListener('submit', function(e) {
      e.preventDefault();
      const lat = parseFloat(document.getElementById('latInput').value);
      const lon = parseFloat(document.getElementById('lonInput').value);
      const weekday = document.getElementById('weekdayInput').value;
      const timeOfDay = document.getElementById('timeOfDayInput').value;
      const month = document.getElementById('monthInput').value;
      const day = document.getElementById('dayInput').value;
      const label = document.getElementById('labelInput').value;
      const time = `${weekday} - ${timeOfDay} | ${month} ${day}`;
      forecastPoints.push({ lat, lon, label, time });
      drawTrack();
      updateConeLayer();
      updateCustomLineLayer();
      setTimeout(updateCustomLineLayer, 10);
      form.reset();
    });
  }

  // Handle clear and delete controls
  const clearBtn = document.getElementById('clearPointsBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', function() {
      forecastPoints = [];
      drawTrack();
      updateConeLayer();
      updateCustomLineLayer();
    });
  }
  // Add Undo Delete button
  const undoDeleteBtn = document.createElement('button');
  undoDeleteBtn.textContent = 'Undo Delete';
  undoDeleteBtn.type = 'button';
  undoDeleteBtn.style.display = 'none';
  const deleteControls = document.getElementById('delete-controls');
  if (deleteControls) {
    deleteControls.appendChild(undoDeleteBtn);
  }
  let lastDeletedPoint = null;
  let lastDeletedIndex = null;

  // Update deleteSelectedBtn event
  const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
  if (pointSelect && deleteSelectedBtn) {
    deleteSelectedBtn.addEventListener('click', function() {
      const idx = parseInt(pointSelect.value);
      if (!isNaN(idx)) {
        lastDeletedPoint = forecastPoints[idx];
        lastDeletedIndex = idx;
        forecastPoints.splice(idx, 1);
        drawTrack();
        updateConeLayer();
        updateCustomLineLayer();
        undoDeleteBtn.style.display = '';
      }
    });
  }

  // Undo Delete logic
  undoDeleteBtn.onclick = function() {
    if (lastDeletedPoint !== null && lastDeletedIndex !== null) {
      forecastPoints.splice(lastDeletedIndex, 0, lastDeletedPoint);
      drawTrack();
      updateConeLayer();
      updateCustomLineLayer();
      lastDeletedPoint = null;
      lastDeletedIndex = null;
      undoDeleteBtn.style.display = 'none';
    }
  };

  // Populate dayInput dropdown (1-31)
  const dayInput = document.getElementById('dayInput');
  if (dayInput) {
    for (let i = 1; i <= 31; i++) {
      const opt = document.createElement('option');
      opt.value = i;
      opt.text = i;
      dayInput.appendChild(opt);
    }
  }

  // --- Pixel-Perfect Image Overlay Feature ---
  const overlayContainer = document.getElementById('imageOverlayContainer');
  let overlayImg = null;
  const insertImageBtn = document.getElementById('insertImageBtn');
  const imageFileInput = document.getElementById('imageFileInput');
  const imageOpacityInput = document.getElementById('imageOpacity');
  const removeImageBtn = document.getElementById('removeImageBtn');

  if (insertImageBtn && imageFileInput && imageOpacityInput && removeImageBtn && overlayContainer) {
    insertImageBtn.onclick = function() {
      imageFileInput.click();
    };
    imageFileInput.onchange = function(e) {
      const file = e.target.files[0];
      if (!file) { console.log('No file selected'); return; }
      const reader = new FileReader();
      reader.onload = function(evt) {
        overlayContainer.innerHTML = '';
        overlayImg = document.createElement('img');
        overlayImg.src = evt.target.result;
        overlayImg.style.position = 'absolute';
        overlayImg.style.opacity = imageOpacityInput.value;
        overlayImg.onload = function() {
          // Center the image in the map container at original size
          const mapDiv = document.getElementById('map');
          const mapRect = mapDiv.getBoundingClientRect();
          overlayImg.style.left = ((mapDiv.offsetWidth - overlayImg.naturalWidth) / 2) + 'px';
          overlayImg.style.top = ((mapDiv.offsetHeight - overlayImg.naturalHeight) / 2) + 'px';
          overlayImg.style.width = overlayImg.naturalWidth + 'px';
          overlayImg.style.height = overlayImg.naturalHeight + 'px';
        };
        overlayContainer.appendChild(overlayImg);
        imageOpacityInput.style.display = '';
        removeImageBtn.style.display = '';
      };
      reader.readAsDataURL(file);
    };
    imageOpacityInput.oninput = function(e) {
      if (overlayImg) {
        overlayImg.style.opacity = e.target.value;
      }
    };
    removeImageBtn.onclick = function() {
      overlayContainer.innerHTML = '';
      overlayImg = null;
      imageOpacityInput.style.display = 'none';
      removeImageBtn.style.display = 'none';
      imageFileInput.value = '';
    };
  }

  // --- Manual Cone Tracing Feature with Save/Delete ---
  let tracingCone = false;
  let conePoints = [];
  let coneLayer = null;
  const startTracingBtn = document.createElement('button');
  startTracingBtn.textContent = 'Start Tracing Cone';
  startTracingBtn.type = 'button';
  startTracingBtn.style.margin = '6px';
  const finishTracingBtn = document.createElement('button');
  finishTracingBtn.textContent = 'Finish Cone';
  finishTracingBtn.type = 'button';
  finishTracingBtn.style.margin = '6px';
  finishTracingBtn.style.display = 'none';
  const removeConeBtn = document.getElementById('removeConeBtn');
  const controlsRow = document.getElementById('controls-row');
  if (controlsRow) {
    controlsRow.appendChild(startTracingBtn);
    controlsRow.appendChild(finishTracingBtn);
  }

  // Load saved cone from localStorage
  if (localStorage.getItem('conePoints')) {
    try {
      conePoints = JSON.parse(localStorage.getItem('conePoints')) || [];
    } catch (e) {
      conePoints = [];
    }
  }

  function saveConePoints() {
    localStorage.setItem('conePoints', JSON.stringify(conePoints));
  }

  function updateConeLayer() {
    if (coneLayer) { typhoonLayerGroup.removeLayer(coneLayer); coneLayer = null; }
    if (conePoints.length > 1) {
      coneLayer = L.polygon(conePoints, {
    color: '#fff',
        weight: 0.7,
        opacity: 0.7,
        dashArray: '6 6',
      fillColor: '#fff',
        fillOpacity: 0.12,
        interactive: false
      }).addTo(typhoonLayerGroup);
      if (removeConeBtn) removeConeBtn.style.display = '';
    } else {
      if (removeConeBtn) removeConeBtn.style.display = 'none';
    }
    saveConePoints();
  }

  startTracingBtn.onclick = function() {
    tracingCone = true;
    conePoints = [];
    updateConeLayer();
    startTracingBtn.style.display = 'none';
    finishTracingBtn.style.display = '';
    map.getContainer().style.cursor = 'crosshair';
  };

  finishTracingBtn.onclick = function() {
    tracingCone = false;
    updateConeLayer();
    startTracingBtn.style.display = '';
    finishTracingBtn.style.display = 'none';
    map.getContainer().style.cursor = '';
  };

  if (removeConeBtn) {
    removeConeBtn.onclick = function() {
      conePoints = [];
      updateConeLayer();
    };
  }

  map.on('click', function(e) {
    if (tracingCone) {
      conePoints.push([e.latlng.lat, e.latlng.lng]);
      updateConeLayer();
    }
  });

  // Draw cone on load if points exist
  updateConeLayer();

  // --- Custom Line Drawing Tool ---
  let drawingCustomLine = false;
  let customLinePoints = [];
  let customLineLayer = null;
  const drawCustomLineBtn = document.createElement('button');
  drawCustomLineBtn.textContent = 'Draw Custom Line';
  drawCustomLineBtn.type = 'button';
  drawCustomLineBtn.style.margin = '6px';
  const finishCustomLineBtn = document.createElement('button');
  finishCustomLineBtn.textContent = 'Finish Line';
  finishCustomLineBtn.type = 'button';
  finishCustomLineBtn.style.margin = '6px';
  finishCustomLineBtn.style.display = 'none';
  const removeCustomLineBtn = document.createElement('button');
  removeCustomLineBtn.textContent = 'Remove Custom Line';
  removeCustomLineBtn.type = 'button';
  removeCustomLineBtn.style.margin = '6px';
  removeCustomLineBtn.style.display = 'none';
  if (controlsRow) {
    controlsRow.appendChild(drawCustomLineBtn);
    controlsRow.appendChild(finishCustomLineBtn);
    controlsRow.appendChild(removeCustomLineBtn);
  }

  // Load saved custom line from localStorage
  if (localStorage.getItem('customLinePoints')) {
    try {
      customLinePoints = JSON.parse(localStorage.getItem('customLinePoints')) || [];
    } catch (e) {
      customLinePoints = [];
    }
  }

  function saveCustomLinePoints() {
    localStorage.setItem('customLinePoints', JSON.stringify(customLinePoints));
  }

  function updateCustomLineLayer() {
    if (customLineLayer) { typhoonLayerGroup.removeLayer(customLineLayer); customLineLayer = null; }
    if (customLinePoints.length > 1) {
      customLineLayer = L.polyline(customLinePoints, {
        color: '#888',
        weight: 1.5,
        opacity: 0.9,
        dashArray: '8 8',
        interactive: false
      }).addTo(typhoonLayerGroup);
      removeCustomLineBtn.style.display = '';
    } else {
      removeCustomLineBtn.style.display = 'none';
    }
    saveCustomLinePoints();
  }

  drawCustomLineBtn.onclick = function() {
    drawingCustomLine = true;
    customLinePoints = [];
    updateCustomLineLayer();
    drawCustomLineBtn.style.display = 'none';
    finishCustomLineBtn.style.display = '';
    map.getContainer().style.cursor = 'crosshair';
  };

  finishCustomLineBtn.onclick = function() {
    drawingCustomLine = false;
    updateCustomLineLayer();
    drawCustomLineBtn.style.display = '';
    finishCustomLineBtn.style.display = 'none';
    map.getContainer().style.cursor = '';
  };

  removeCustomLineBtn.onclick = function() {
    customLinePoints = [];
    updateCustomLineLayer();
  };

  map.on('click', function(e) {
    if (drawingCustomLine) {
      customLinePoints.push([e.latlng.lat, e.latlng.lng]);
      updateCustomLineLayer();
    }
  });

  // Draw custom line on load if points exist
  updateCustomLineLayer();

  // --- Radar Controls (Play/Pause, Slider, Time Label) ---
  const radarControls = document.getElementById('radar-controls');
  const radarPlayPauseBtn = document.getElementById('radarPlayPauseBtn');
  const radarFrameSlider = document.getElementById('radarFrameSlider');
  const radarFrameTime = document.getElementById('radarFrameTime');
  let radarPaused = false;

  function updateRadarControls() {
    if (rainviewerFrames.length > 0 && rainviewerLayer) {
      radarControls.style.display = '';
      radarFrameSlider.max = rainviewerFrames.length - 1;
      radarFrameSlider.value = rainviewerFrameIdx;
      radarPlayPauseBtn.textContent = radarPaused ? '▶' : '❚❚';
      radarFrameTime.textContent = getRainviewerFrameTime(rainviewerFrames[radarFrameIdx]);
    } else {
      radarControls.style.display = 'none';
    }
  }

  function getRainviewerFrameTime(ts) {
    // ts is a UNIX timestamp in seconds
    const d = new Date(ts * 1000);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  if (radarPlayPauseBtn) {
    radarPlayPauseBtn.onclick = function() {
      radarPaused = !radarPaused;
      updateRadarControls();
      if (!radarPaused) {
        showRainviewerAnim();
      } else if (rainviewerAnimTimer) {
        clearTimeout(rainviewerAnimTimer);
      }
    };
  }

  if (radarFrameSlider) {
    radarFrameSlider.oninput = function() {
      radarFrameIdx = parseInt(radarFrameSlider.value);
      showRainviewerAnim(true); // true = don't auto-advance
      updateRadarControls();
    };
  }

  // --- RainViewer Animated Radar Layer Integration ---
  let rainviewerFrames = [];
  let rainviewerFrameIdx = 0;
  let rainviewerLayer = null;
  let rainviewerAnimTimer = null;
  let rainviewerActive = false;

  function fetchRainviewerFrames(callback) {
    fetch('https://api.rainviewer.com/public/weather-maps.json')
      .then(res => res.json())
      .then(data => {
        if (data && data.radar && data.radar.past) {
          rainviewerFrames = data.radar.past.map(f => f.time);
          callback();
        }
      });
  }

  function showRainviewerAnim() {
    if (!rainviewerFrames.length || !rainviewerActive) return;
    const nextIdx = (rainviewerFrameIdx + 1) % rainviewerFrames.length;
    const nextTs = rainviewerFrames[nextIdx];
    const nextUrl = `https://tilecache.rainviewer.com/v2/radar/${nextTs}/256/{z}/{x}/{y}/2/1_1.png`;

    // Preload next frame
    const nextLayer = L.tileLayer(nextUrl, {
      attribution: 'Radar: RainViewer',
      maxZoom: 10,
      minZoom: 2,
      opacity: 0.0, // Always start at 0
      zIndex: 2000
    });

    nextLayer.on('load', function() {
      if (!rainviewerActive) { map.removeLayer(nextLayer); return; }
      // Fade in new layer
      let fade = 0;
      const fadeStep = 0.08;
      const maxOpacity = 0.8;
      const fadeIn = () => {
        if (!rainviewerActive) { map.removeLayer(nextLayer); return; }
        fade += fadeStep;
        if (fade >= maxOpacity) {
          nextLayer.setOpacity(maxOpacity);
          if (rainviewerLayer) map.removeLayer(rainviewerLayer);
          rainviewerLayer = nextLayer;
          rainviewerFrameIdx = nextIdx;
          rainviewerAnimTimer = setTimeout(showRainviewerAnim, 500);
        } else {
          nextLayer.setOpacity(fade);
          setTimeout(fadeIn, 30);
        }
      };
      nextLayer.setOpacity(0.0); // Ensure it starts at 0
      fadeIn();
    });

    // Add next layer (will be invisible until loaded)
    nextLayer.setOpacity(0.0); // Defensive: always set to 0 before adding
    nextLayer.addTo(map);
  }

  function hideRainviewerAnim() {
    rainviewerActive = false;
    if (rainviewerLayer) map.removeLayer(rainviewerLayer);
    rainviewerLayer = null;
    if (rainviewerAnimTimer) clearTimeout(rainviewerAnimTimer);
    rainviewerAnimTimer = null;
    // Remove any preloaded/fading-in layers
    const allLayers = Object.values(map._layers);
    allLayers.forEach(layer => {
      if (layer && layer._url && typeof layer.setOpacity === 'function' && layer._url.includes('tilecache.rainviewer.com')) {
        map.removeLayer(layer);
      }
    });
  }

  // Dummy layer for 'Radar' so it appears in the layer control
  const dummyRainviewerLayer = L.layerGroup();
  // Remove Himawari-8 dummy and layer variables
  // const dummyHimawariLayer = L.layerGroup();
  // let himawariLayer = null;

  // --- Rainfall Advisory LayerGroup (for toggling in layer control) ---
  // We'll use a LayerGroup to hold the provinceLayer once loaded
  const rainfallAdvisoryLayerGroup = L.layerGroup();
  let rainfallAdvisoryLoaded = false;

  // --- Himawari-8 Animated Satellite Layer ---
  // function createHimawariLayer() { // This function is removed
  //   if (!himawariLayer) { // This line is removed
  //     himawariLayer = L.himawariLayer({ // This line is removed
  //       interval: 10, // minutes between frames // This line is removed
  //       frames: 6,    // number of frames to animate // This line is removed
  //       level: 4,     // tile grid (4x4) // This line is removed
  //       animate: true, // This line is removed
  //       opacity: 0.7 // This line is removed
  //     }); // This line is removed
  //   } // This line is removed
  //   return himawariLayer; // This line is removed
  // } // This block is removed

  // Add layer control for Typhoon Track, Radar, Rainfall Advisory, and Satellite Imagery (as overlays)
  const dummySatelliteLayer = L.layerGroup();
  const dummyTyphoonSignalLayer = L.layerGroup();
  const overlays = {
    'Typhoon Track': typhoonLayerGroup,
    'Radar': dummyRainviewerLayer,
    'Weather Advisory': rainfallAdvisoryLayerGroup,
    'Satellite Imagery': dummySatelliteLayer,
    'Cyclone Signals': dummyTyphoonSignalLayer
  };
  L.control.layers(baseLayers, overlays, { position: 'topright', collapsed: false }).addTo(map);

  typhoonLayerGroup.addTo(map);

  // Listen for overlayadd/overlayremove events to toggle overlays
  map.on('overlayadd', function(e) {
    if (e.name === 'Radar') {
      rainviewerActive = true;
      fetchRainviewerFrames(() => {
        rainviewerFrameIdx = 0;
          showRainviewerAnim();
        });
    }
    if (e.name === 'Weather Advisory') {
      if (provinceLayer && !rainfallAdvisoryLayerGroup.hasLayer(provinceLayer)) {
        rainfallAdvisoryLayerGroup.addLayer(provinceLayer);
      }
      var rainfallLegend = document.getElementById('rainfall-legend-box');
      var typhoonLegend = document.getElementById('map-legend-box');
      var sourceBox = document.getElementById('map-source-box');
      var rainfallSourceBox = document.getElementById('rainfall-source-box');
      if (rainfallLegend) rainfallLegend.style.display = '';
      if (rainfallSourceBox) rainfallSourceBox.style.display = '';
      if (map.hasLayer(typhoonLayerGroup)) {
        if (typhoonLegend) typhoonLegend.style.display = '';
        if (sourceBox) sourceBox.style.display = '';
      }
    }
    if (e.name === 'Satellite Imagery') {
      showGibsLatest();
    }
    if (e.name === 'Typhoon Track') {
      var typhoonLegend = document.getElementById('map-legend-box');
      var sourceBox = document.getElementById('map-source-box');
      if (typhoonLegend) typhoonLegend.style.display = '';
      if (sourceBox) sourceBox.style.display = '';
    }
    if (e.name === 'Cyclone Signals') {
      var typhoonSignalLegend = document.getElementById('typhoon-signal-legend-box');
      var typhoonSignalSourceBox = document.getElementById('typhoon-signal-source-box');
      if (typhoonSignalLegend) typhoonSignalLegend.style.display = '';
      if (typhoonSignalSourceBox) typhoonSignalSourceBox.style.display = '';
    }
  });
  map.on('overlayremove', function(e) {
    if (e.name === 'Radar') hideRainviewerAnim();
    if (e.name === 'Weather Advisory') {
      if (provinceLayer && rainfallAdvisoryLayerGroup.hasLayer(provinceLayer)) {
        rainfallAdvisoryLayerGroup.removeLayer(provinceLayer);
      }
      var rainfallLegend = document.getElementById('rainfall-legend-box');
      var typhoonLegend = document.getElementById('map-legend-box');
      var sourceBox = document.getElementById('map-source-box');
      var rainfallSourceBox = document.getElementById('rainfall-source-box');
      if (rainfallLegend) rainfallLegend.style.display = 'none';
      if (rainfallSourceBox) rainfallSourceBox.style.display = 'none';
      if (map.hasLayer(typhoonLayerGroup)) {
        if (typhoonLegend) typhoonLegend.style.display = '';
        if (sourceBox) sourceBox.style.display = '';
      }
    }
    if (e.name === 'Satellite Imagery') {
      removeGibsLayer();
    }
    if (e.name === 'Typhoon Track') {
      var typhoonLegend = document.getElementById('map-legend-box');
      var sourceBox = document.getElementById('map-source-box');
      if (typhoonLegend) typhoonLegend.style.display = 'none';
      if (sourceBox) sourceBox.style.display = 'none';
    }
    // REMOVE this block to prevent clearing typhoonSignalLines:
    // if (e.name === 'Typhoon Signals') {
    //   var typhoonSignalLegend = document.getElementById('typhoon-signal-legend-box');
    //   var typhoonSignalSourceBox = document.getElementById('typhoon-signal-source-box');
    //   if (typhoonSignalLegend) typhoonSignalLegend.style.display = 'none';
    //   if (typhoonSignalSourceBox) typhoonSignalSourceBox.style.display = 'none';
    //   // Also clear all signal lines
    //   typhoonSignalLines.forEach(line => map.removeLayer(line));
    //   typhoonSignalLines = [];
    // }
  });

  // --- Leaflet Layer Control Toggle Button Logic ---
  setTimeout(function() {
    const leafletLayerControl = document.querySelector('.leaflet-control-layers');
    if (leafletLayerControl && !document.getElementById('leafletLayerToggleBtn')) {
      const btn = document.createElement('button');
      btn.id = 'leafletLayerToggleBtn';
      btn.type = 'button';
      btn.innerHTML = '⯈';
      btn.style.position = 'absolute';
      btn.style.top = '10px';
      btn.style.right = '10px';
      btn.style.zIndex = '10003';
      btn.style.width = '28px';
      btn.style.height = '28px';
      btn.style.borderRadius = '14px';
      btn.style.border = '1px solid #bbb';
      btn.style.background = '#fff';
      btn.style.boxShadow = '0 1px 4px rgba(0,0,0,0.12)';
      btn.style.fontSize = '18px';
      btn.style.lineHeight = '28px';
      btn.style.padding = '0';
      btn.style.display = 'flex';
      btn.style.alignItems = 'center';
      btn.style.justifyContent = 'center';
      btn.style.cursor = 'pointer';
      const mapDiv = document.getElementById('map');
      if (mapDiv) mapDiv.appendChild(btn);
      let leafletPanelHidden = false;
  const mapSizeToggleBtn = document.getElementById('mapSizeToggleBtn');
      const mapFullScreenBtn = document.getElementById('mapFullScreenBtn');
      btn.onclick = function() {
        leafletPanelHidden = !leafletPanelHidden;
        if (leafletPanelHidden) {
          leafletLayerControl.classList.add('leaflet-control-hidden');
          btn.classList.add('collapsed');
          btn.innerHTML = '⯇';
        } else {
          leafletLayerControl.classList.remove('leaflet-control-hidden');
          btn.classList.remove('collapsed');
          btn.innerHTML = '⯈';
    }
      };
    }
  }, 0);

  // --- Map Size Toggle Functionality ---
  const mapSizeToggleBtn = document.getElementById('mapSizeToggleBtn');
  const mapElement = document.getElementById('map');
  // 0 = small, 1 = semi, 2 = full
  let mapSizeState = 0;
  function setMapSizeState(state) {
    mapElement.classList.remove('fullscreen', 'semi', 'smaller');
    if (state === 0) {
      mapElement.classList.add('smaller');
      mapSizeToggleBtn.textContent = '⛶';
    } else if (state === 1) {
      mapElement.classList.add('semi');
      mapSizeToggleBtn.textContent = '🗖';
    } else {
      mapElement.classList.add('fullscreen');
      mapSizeToggleBtn.textContent = '🗗';
    }
    setTimeout(() => map.invalidateSize(), 350);
  }
  setMapSizeState(0);
  if (mapSizeToggleBtn) {
    mapSizeToggleBtn.onclick = function() {
      mapSizeState = (mapSizeState + 1) % 3;
      setMapSizeState(mapSizeState);
    };
  }

  // Apply saved map size on load
  // Remove all updateMapSize() calls (already removed in previous edits)

  // --- Satellite Image Toggle (Latest Still Satellite Overlay) ---
  const satelliteImageBtn = document.getElementById('satelliteImageBtn');
  let satelliteVisible = false;

  if (satelliteImageBtn) {
    satelliteImageBtn.onclick = function() {
      if (!satelliteVisible) {
        if (!satelliteLayer) {
          satelliteLayer = L.tileLayer('https://maps.open-meteo.com/satellite/latest/{z}/{x}/{y}.jpg', {
            attribution: 'Satellite: Open-Meteo',
            maxZoom: 12,
            opacity: 0.85
          });
        }
        satelliteLayer.addTo(map);
        satelliteImageBtn.textContent = 'Hide Satellite Image';
        satelliteVisible = true;
      } else {
        if (satelliteLayer) map.removeLayer(satelliteLayer);
        satelliteImageBtn.textContent = 'Show Satellite Image';
        satelliteVisible = false;
      }
    };
  }

  // --- Himawari-8 Satellite Cloud Image Toggle (inside map, always on top) ---
  const himawariBtn = document.getElementById('himawariBtn');
  let himawariVisible = false;

  if (himawariBtn) {
    himawariBtn.onclick = function() {
      if (!himawariVisible) {
        if (!rainviewerLayer) { // Use rainviewerLayer for Himawari-8
          showRainviewerAnim();
        }
        himawariBtn.textContent = 'Hide Himawari-8 Satellite';
        himawariVisible = true;
      } else {
        hideRainviewerAnim();
        himawariBtn.textContent = 'Show Himawari-8 Satellite';
        himawariVisible = false;
      }
    };
  }

  // --- Cloud Overlay Toggle Button (NASA GIBS only) ---
  // const cloudBtnContainer = document.createElement('div'); // This line is removed
  // cloudBtnContainer.style.position = 'absolute'; // This line is removed
  // cloudBtnContainer.style.top = '60px'; // This line is removed
  // cloudBtnContainer.style.right = '18px'; // This line is removed
  // cloudBtnContainer.style.zIndex = 1005; // This line is removed
  // cloudBtnContainer.style.background = 'rgba(30,30,30,0.92)'; // This line is removed
  // cloudBtnContainer.style.borderRadius = '8px'; // This line is removed
  // cloudBtnContainer.style.padding = '6px 8px'; // This line is removed
  // cloudBtnContainer.style.display = 'flex'; // This line is removed
  // cloudBtnContainer.style.flexDirection = 'column'; // This line is removed
  // cloudBtnContainer.style.gap = '6px'; // This line is removed

  // function makeCloudBtn(label) { // This function is removed
  //   const btn = document.createElement('button'); // This line is removed
  //   btn.textContent = label; // This line is removed
  //   btn.style.background = '#fff'; // This line is removed
  //   btn.style.color = '#222'; // This line is removed
  //   btn.style.border = '1px solid #bbb'; // This line is removed
  //   btn.style.borderRadius = '5px'; // This line is removed
  //   btn.style.padding = '4px 10px'; // This line is removed
  //   btn.style.fontSize = '13px'; // This line is removed
  //   btn.style.cursor = 'pointer'; // This line is removed
  //   btn.style.opacity = '0.92'; // This line is removed
  //   btn.onmouseenter = () => btn.style.background = '#e0f7fa'; // This line is removed
  //   btn.onmouseleave = () => btn.style.background = '#fff'; // This line is removed
  //   return btn; // This line is removed
  // } // This block is removed

  // const btnGibs = makeCloudBtn('NASA GIBS (Daily)'); // This line is removed

  // function clearCloudLayers() { // This function is removed
  //   map.removeLayer(gibsLayer); // This line is removed
  // } // This block is removed

  // btnGibs.onclick = function() { // This line is removed
  //   clearCloudLayers(); // This line is removed
  //   gibsLayer.addTo(map); // This line is removed
  // }; // This block is removed

  // cloudBtnContainer.appendChild(btnGibs); // This line is removed
  // document.getElementById('map').appendChild(cloudBtnContainer); // This line is removed

  // Start with NASA GIBS by default // This line is removed
  // btnGibs.click(); // This line is removed

  // const controlsToggleBtn = document.getElementById('controlsToggleBtn'); // This line is removed
  // const controlsRowPanel = document.getElementById('controls-row'); // This line is removed
  // let controlsHidden = false; // This line is removed
  // if (controlsToggleBtn && controlsRowPanel) { // This block is removed
  //   controlsToggleBtn.onclick = function() { // This line is removed
  //     controlsHidden = !controlsHidden; // This line is removed
  //     if (controlsHidden) { // This line is removed
  //       controlsRowPanel.classList.add('hidden'); // This line is removed
  //       controlsToggleBtn.classList.add('collapsed'); // This line is removed
  //       controlsToggleBtn.innerHTML = '⯇'; // This line is removed
  //     } else { // This line is removed
  //       controlsRowPanel.classList.remove('hidden'); // This line is removed
  //       controlsToggleBtn.classList.remove('collapsed'); // This line is removed
  //       controlsToggleBtn.innerHTML = '⯈'; // This line is removed
  //     } // This block is removed
  //   }; // This line is removed
  // } // This block is removed

  // --- Draggable Wind Radii Feature ---
  let orangeWindCenter = null; // [lat, lon] or null for default
  let redWindCenter = null;    // [lat, lon] or null for default
  let orangeWindHandle = null;
  let redWindHandle = null;

  const orangeWindDraggable = document.getElementById('orangeWindDraggable');
  const redWindDraggable = document.getElementById('redWindDraggable');
  const orangeWindSnapBtn = document.getElementById('orangeWindSnapBtn');
  const redWindSnapBtn = document.getElementById('redWindSnapBtn');

  function createDraggableHandle(center, color, onDrag, onDragEnd) {
    return L.marker(center, {
      draggable: true,
      icon: L.divIcon({
        className: '',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
        html: `<div style="width:16px;height:16px;background:${color};border:2px solid #fff;border-radius:3px;box-shadow:0 1px 4px rgba(0,0,0,0.18);"></div>`
      }),
      zIndexOffset: 3000
    })
    .on('drag', onDrag)
    .on('dragend', onDragEnd);
  }

  if (orangeWindDraggable) orangeWindDraggable.onchange = updateWindCircles;
  if (redWindDraggable) redWindDraggable.onchange = updateWindCircles;

  if (orangeWindSnapBtn) orangeWindSnapBtn.onclick = function() {
    if (forecastPoints[0]) {
      orangeWindCenter = [forecastPoints[0].lat, forecastPoints[0].lon];
      updateWindCircles();
    }
  };
  if (redWindSnapBtn) redWindSnapBtn.onclick = function() {
    if (forecastPoints[0]) {
      redWindCenter = [forecastPoints[0].lat, forecastPoints[0].lon];
      updateWindCircles();
    }
  };

  function updateWindCircles() {
    // Remove previous handles
    if (orangeWindHandle) { map.removeLayer(orangeWindHandle); orangeWindHandle = null; }
    if (redWindHandle) { map.removeLayer(redWindHandle); redWindHandle = null; }
    // Remove previous wind circles
    windCircles.forEach(c => map.removeLayer(c));
    windCircles = [];
    // Orange wind circle
    let orangeVisible = windRadiiVisibility.orange;
    let orangeCenter = orangeWindCenter || (forecastPoints[0] ? [forecastPoints[0].lat, forecastPoints[0].lon] : null);
    let orangeCircle = null;
    if (orangeVisible && orangeCenter) {
      orangeCircle = L.circle(orangeCenter, {
        radius: windRadiiValues.orange, color: '#a67c52', fillColor: '#a67c52', fillOpacity: 0.35, weight: 1
      }).addTo(map);
      windCircles.push(orangeCircle);
      if (orangeWindDraggable && orangeWindDraggable.checked) {
        orangeWindHandle = createDraggableHandle(
          orangeCenter,
          '#a67c52',
          function(e) {
            orangeWindCenter = [e.target.getLatLng().lat, e.target.getLatLng().lng];
            if (orangeCircle) {
              orangeCircle.setLatLng(e.target.getLatLng());
            }
          },
          function(e) {
            orangeWindCenter = [e.target.getLatLng().lat, e.target.getLatLng().lng];
            updateWindCircles();
          }
        );
        orangeWindHandle.addTo(map);
      }
    }
    // Red wind circle
    let redVisible = windRadiiVisibility.red;
    let redCenter = redWindCenter || (forecastPoints[0] ? [forecastPoints[0].lat, forecastPoints[0].lon] : null);
    let redCircle = null;
    if (redVisible && redCenter) {
      redCircle = L.circle(redCenter, {
        radius: windRadiiValues.red, color: '#e74c3c', fillColor: '#e74c3c', fillOpacity: 0.5, weight: 1
      }).addTo(map);
      windCircles.push(redCircle);
      if (redWindDraggable && redWindDraggable.checked) {
        redWindHandle = createDraggableHandle(
          redCenter,
          '#e74c3c',
          function(e) {
            redWindCenter = [e.target.getLatLng().lat, e.target.getLatLng().lng];
            if (redCircle) {
              redCircle.setLatLng(e.target.getLatLng());
            }
          },
          function(e) {
            redWindCenter = [e.target.getLatLng().lat, e.target.getLatLng().lng];
            updateWindCircles();
          }
        );
        redWindHandle.addTo(map);
      }
    }
  }

  // Call updateWindCircles whenever wind radii, visibility, or forecastPoints change
  // Replace/add calls to updateWindCircles() after relevant actions
  // Example: after drawTrack(), updateConeLayer(), etc.

  // --- Custom Highlight Drawing Tool ---
  let drawingHighlight = false;
  let highlightPoints = [];
  let highlightLayer = null;

  // Create highlight control buttons
  const startHighlightBtn = document.createElement('button');
  startHighlightBtn.textContent = 'Start Highlight';
  startHighlightBtn.type = 'button';
  startHighlightBtn.style.margin = '6px';

  const finishHighlightBtn = document.createElement('button');
  finishHighlightBtn.textContent = 'Finish Highlight';
  finishHighlightBtn.type = 'button';
  finishHighlightBtn.style.margin = '6px';
  finishHighlightBtn.style.display = 'none';

  const removeHighlightBtn = document.createElement('button');
  removeHighlightBtn.textContent = 'Remove Highlight';
  removeHighlightBtn.type = 'button';
  removeHighlightBtn.style.margin = '6px';
  removeHighlightBtn.style.display = 'none';

  // Add to controls row
  if (controlsRow) {
    controlsRow.appendChild(startHighlightBtn);
    controlsRow.appendChild(finishHighlightBtn);
    controlsRow.appendChild(removeHighlightBtn);
  }

  startHighlightBtn.onclick = function() {
    drawingHighlight = true;
    highlightPoints = [];
    if (highlightLayer) { map.removeLayer(highlightLayer); highlightLayer = null; }
    startHighlightBtn.style.display = 'none';
    finishHighlightBtn.style.display = '';
    map.getContainer().style.cursor = 'crosshair';
  };

  finishHighlightBtn.onclick = function() {
    drawingHighlight = false;
    if (highlightLayer) { map.removeLayer(highlightLayer); highlightLayer = null; }
    if (highlightPoints.length > 2) {
      highlightLayer = L.polygon(highlightPoints, {
        color: '#ffe44c',
        weight: 2,
        fillColor: '#ffe44c',
        fillOpacity: 0.7
      }).addTo(map);
      removeHighlightBtn.style.display = '';
    }
    startHighlightBtn.style.display = '';
    finishHighlightBtn.style.display = 'none';
    map.getContainer().style.cursor = '';
  };

  removeHighlightBtn.onclick = function() {
    if (highlightLayer) { map.removeLayer(highlightLayer); highlightLayer = null; }
    highlightPoints = [];
    removeHighlightBtn.style.display = 'none';
  };

  map.on('click', function(e) {
    if (drawingHighlight) {
      highlightPoints.push([e.latlng.lat, e.latlng.lng]);
      if (highlightLayer) { map.removeLayer(highlightLayer); highlightLayer = null; }
      if (highlightPoints.length > 1) {
        highlightLayer = L.polygon(highlightPoints, {
          color: '#ffe44c',
          weight: 2,
          fillColor: '#ffe44c',
          fillOpacity: 0.3
        }).addTo(map);
      }
    }
  });

  // --- Province-aware Magic Fill Tool ---
  let provinceLayer = null;
  let filledProvinces = {}; // { provinceName: color }
  let magicFillActive = false;
  let selectedFillColor = '#ffe44c'; // Default yellow

  // Create Magic Fill toggle button
  const magicFillBtn = document.createElement('button');
  magicFillBtn.textContent = 'Magic Fill';
  magicFillBtn.type = 'button';
  magicFillBtn.style.margin = '6px';
  if (controlsRow) {
    controlsRow.appendChild(magicFillBtn);
  }
  magicFillBtn.onclick = function() {
    magicFillActive = !magicFillActive;
    magicFillBtn.style.background = magicFillActive ? selectedFillColor : '';
    magicFillBtn.style.color = magicFillActive ? '#222' : '';
    if (magicFillActive) {
      map.getContainer().style.cursor = 'cell';
      colorPickerRow.style.display = '';
    } else {
      map.getContainer().style.cursor = '';
      colorPickerRow.style.display = 'none';
    }
  };

  // --- Rainfall Color Picker Buttons ---
  const colorPickerRow = document.createElement('div');
  colorPickerRow.style.display = 'none';
  colorPickerRow.style.margin = '6px 0';
  colorPickerRow.style.gap = '8px';
  colorPickerRow.style.display = 'flex';
  colorPickerRow.style.alignItems = 'center';

  const yellowBtn = document.createElement('button');
  yellowBtn.textContent = 'Yellow (50-100mm)';
  yellowBtn.style.background = '#ffe44c';
  yellowBtn.style.color = '#222';
  yellowBtn.style.border = '1px solid #aaa';
  yellowBtn.style.marginRight = '4px';
  yellowBtn.onclick = function() {
    selectedFillColor = '#ffe44c';
    magicFillBtn.style.background = magicFillActive ? selectedFillColor : '';
  };

  const orangeBtn = document.createElement('button');
  orangeBtn.textContent = 'Orange (100-200mm)';
  orangeBtn.style.background = '#ffb84c';
  orangeBtn.style.color = '#222';
  orangeBtn.style.border = '1px solid #aaa';
  orangeBtn.style.marginRight = '4px';
  orangeBtn.onclick = function() {
    selectedFillColor = '#ffb84c';
    magicFillBtn.style.background = magicFillActive ? selectedFillColor : '';
  };

  const redBtn = document.createElement('button');
  redBtn.textContent = 'Red (200mm+)';
  redBtn.style.background = '#e74c3c';
  redBtn.style.color = '#fff';
  redBtn.style.border = '1px solid #aaa';
  redBtn.onclick = function() {
    selectedFillColor = '#e74c3c';
    magicFillBtn.style.background = magicFillActive ? selectedFillColor : '';
  };

  colorPickerRow.appendChild(yellowBtn);
  colorPickerRow.appendChild(orangeBtn);
  colorPickerRow.appendChild(redBtn);
  if (controlsRow) controlsRow.appendChild(colorPickerRow);

  // Create Clear Province Fills button
  const clearProvinceFillsBtn = document.createElement('button');
  clearProvinceFillsBtn.textContent = 'Clear Fills';
  clearProvinceFillsBtn.type = 'button';
  clearProvinceFillsBtn.style.margin = '6px';
  clearProvinceFillsBtn.style.display = 'none';
  if (controlsRow) {
    controlsRow.appendChild(clearProvinceFillsBtn);
  }

  function styleProvince(feature) {
    const name = feature.properties && feature.properties.NAME_1;
    let fillColor = 'rgba(0,0,0,0)';
    let fillOpacity = 0.1;
    if (filledProvinces[name]) {
      // Brighter color mapping
      if (filledProvinces[name] === '#ffe44c') fillColor = '#fff94c'; // Brighter yellow
      else if (filledProvinces[name] === '#ffb84c') fillColor = '#ff9900'; // Brighter orange
      else if (filledProvinces[name] === '#e74c3c') fillColor = '#ff3333'; // Brighter red
      else fillColor = filledProvinces[name];
      fillOpacity = 0.85;
    }
      return {
        color: '#444',
        weight: 0.5,
        fill: true,
      fillColor: fillColor,
      fillOpacity: fillOpacity,
        opacity: 0.9
      };
  }

  function resetProvinceFills() {
    filledProvinces = {};
    if (provinceLayer) provinceLayer.setStyle(styleProvince);
    clearProvinceFillsBtn.style.display = 'none';
  }

  clearProvinceFillsBtn.onclick = resetProvinceFills;

  fetch('ph-provinces.json')
    .then(res => res.json())
    .then(data => {
      provinceLayer = L.geoJSON(data, {
        style: styleProvince,
        onEachFeature: function(feature, layer) {
          layer.options.className = (layer.options.className || '') + ' leaflet-province-outline';
          layer.on('click', function(e) {
            if (magicFillActive && !drawingHighlight) {
              const name = feature.properties && feature.properties.NAME_1;
              filledProvinces[name] = selectedFillColor;
              provinceLayer.setStyle(styleProvince);
              clearProvinceFillsBtn.style.display = '';
              L.DomEvent.stopPropagation(e);
            }
          });
        },
        interactive: true
      });
      // Add to rainfallAdvisoryLayerGroup for toggling
      rainfallAdvisoryLayerGroup.addLayer(provinceLayer);
      rainfallAdvisoryLoaded = true;
    })
    .catch(err => {
      console.warn('Province boundary file missing or invalid:', err);
    });

  // --- NASA GIBS Satellite Imagery (latest only, no animation) ---
  let gibsLayer = null;

  function getLatestGibsDate() {
    const today = new Date();
    const yyyy = today.getUTCFullYear();
    const mm = String(today.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(today.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function showGibsLatest() {
    if (gibsLayer) map.removeLayer(gibsLayer);
    const date = getLatestGibsDate();
    gibsLayer = L.tileLayer(
      `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/${date}/250m/{z}/{y}/{x}.jpg`,
      { attribution: 'NASA GIBS', maxZoom: 9, opacity: 0.85 }
    );
    gibsLayer.addTo(map);
  }

  function removeGibsLayer() {
    if (gibsLayer) { map.removeLayer(gibsLayer); gibsLayer = null; }
  }

  map.on('overlayadd', function(e) {
    if (e.name === 'Satellite Imagery') {
      showGibsLatest();
    }
  });
  map.on('overlayremove', function(e) {
    if (e.name === 'Satellite Imagery') {
      removeGibsLayer();
    }
  });

  // --- Pointer Circle Tool ---
  let pointerCircleToolActive = false;
  let pointerCircleOverlays = [];
  const togglePointerCircleTool = document.getElementById('togglePointerCircleTool');
  if (togglePointerCircleTool) {
    togglePointerCircleTool.addEventListener('change', function() {
      pointerCircleToolActive = togglePointerCircleTool.checked;
      map.getContainer().style.cursor = pointerCircleToolActive ? 'crosshair' : '';
    });
  }
  // Add Clear Pointer Circles button
  const clearPointerCirclesBtn = document.createElement('button');
  clearPointerCirclesBtn.textContent = 'Clear Pointer Circles';
  clearPointerCirclesBtn.type = 'button';
  clearPointerCirclesBtn.style.margin = '6px';
  const controlsRow1 = document.getElementById('controls-row-1') || document.getElementById('controls-row');
  if (controlsRow1) controlsRow1.appendChild(clearPointerCirclesBtn);
  clearPointerCirclesBtn.onclick = function() {
    pointerCircleOverlays.forEach(o => map.removeLayer(o));
    pointerCircleOverlays = [];
  };
  // Helper to create SVG overlay for pointer circle + L
  function createPointerCircleOverlay(latlng, radiusMeters) {
    // Calculate bounds for the SVG overlay
    const bounds = L.latLngBounds(
      map.layerPointToLatLng(map.latLngToLayerPoint(latlng).subtract([radiusMeters / map.options.crs.R, radiusMeters / map.options.crs.R])),
      map.layerPointToLatLng(map.latLngToLayerPoint(latlng).add([radiusMeters / map.options.crs.R, radiusMeters / map.options.crs.R]))
    );
    // But for simplicity, use a large enough bounds around the center
    const d = radiusMeters * 1.1 / 111320; // ~deg per meter
    const overlayBounds = [
      [latlng.lat - d, latlng.lng - d],
      [latlng.lat + d, latlng.lng + d]
    ];
    // SVG overlay content
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.setAttribute('viewBox', '0 0 200 200');
    // Circle
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', '100');
    circle.setAttribute('cy', '100');
    circle.setAttribute('r', '90');
    circle.setAttribute('stroke', '#eee');
    circle.setAttribute('stroke-width', '4');
    circle.setAttribute('fill', '#fff');
    circle.setAttribute('fill-opacity', '0.08');
    circle.setAttribute('stroke-dasharray', '12 8');
    svg.appendChild(circle);
    // L
    const lText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    lText.setAttribute('x', '100');
    lText.setAttribute('y', '120');
    lText.setAttribute('text-anchor', 'middle');
    lText.setAttribute('font-size', '70');
    lText.setAttribute('font-weight', 'bold');
    lText.setAttribute('fill', '#eee');
    lText.setAttribute('stroke', '#222');
    lText.setAttribute('stroke-width', '2');
    lText.setAttribute('paint-order', 'stroke');
    lText.textContent = 'L';
    svg.appendChild(lText);
    // SVG overlay
    const overlay = L.svgOverlay(svg, overlayBounds, {interactive: false});
    overlay.addTo(map);
    return overlay;
  }
  // Add pointer circle on map click if tool is active
  map.on('click', function(e) {
    if (pointerCircleToolActive) {
      const overlay = createPointerCircleOverlay(e.latlng, 120000);
      pointerCircleOverlays.push(overlay);
    }
  });
  // On zoom or move, redraw all overlays
  function redrawPointerCircleOverlays() {
    pointerCircleOverlays.forEach(o => map.removeLayer(o));
    pointerCircleOverlays = pointerCircleOverlays.map(o => {
      const center = o.getBounds().getCenter();
      return createPointerCircleOverlay(center, 120000);
    });
  }
  map.on('zoomend moveend', redrawPointerCircleOverlays);

  // --- Typhoon Signal Brush Tool ---
  let phBoundary = null;
  // Load PH boundary as a single unioned MultiPolygon for Cyclone Signal tool
  fetch('ph-provinces.json')
    .then(res => res.json())
    .then(data => {
      // Union all province polygons into one
      let unioned = null;
      data.features.forEach((feature, idx) => {
        const geom = feature.geometry;
        let poly = null;
        if (geom.type === 'Polygon') {
          poly = turf.polygon(geom.coordinates);
        } else if (geom.type === 'MultiPolygon') {
          poly = turf.multiPolygon(geom.coordinates);
        }
        if (poly) {
          if (!unioned) unioned = poly;
          else unioned = turf.union(unioned, poly);
        }
      });
      phBoundary = unioned;
    });
  let activeSignalBrush = null;
  let drawingSignal = false;
  let currentSignalLine = null;
  let typhoonSignalLines = [];
  const signalColors = {
    1: '#12dfdc',
    2: 'yellow',
    3: 'orange',
    4: 'red',
    5: '#ed20dc'
  };
  // Handle signal brush button activation
  const signalBrushBtns = Array.from(document.getElementsByClassName('signal-brush-btn'));
  signalBrushBtns.forEach(btn => {
    btn.addEventListener('click', function() {
      // Toggle active state
      if (activeSignalBrush === btn.dataset.signal) {
        activeSignalBrush = null;
        btn.classList.remove('active');
        map.getContainer().style.cursor = '';
      } else {
        activeSignalBrush = btn.dataset.signal;
        signalBrushBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        map.getContainer().style.cursor = 'crosshair';
      }
    });
  });
  // Cyclone Signal Brush Size Slider
  let signalBrushSize = 3;
  const signalBrushSizeSlider = document.getElementById('signalBrushSizeSlider');
  const signalBrushSizeValue = document.getElementById('signalBrushSizeValue');
  if (signalBrushSizeSlider && signalBrushSizeValue) {
    signalBrushSizeSlider.value = signalBrushSize;
    signalBrushSizeValue.textContent = signalBrushSize;
    signalBrushSizeSlider.addEventListener('input', function() {
      signalBrushSize = parseInt(signalBrushSizeSlider.value);
      signalBrushSizeValue.textContent = signalBrushSize;
    });
  }
  // Drawing logic
  map.on('mousedown', function(e) {
    if (activeSignalBrush && !drawingSignal && typhoonSignalLinesVisible) {
      drawingSignal = true;
      currentSignalLine = L.polyline([e.latlng], {
        color: signalColors[activeSignalBrush],
        weight: signalBrushSize,
        opacity: 1,
        smoothFactor: 1.0,
        lineCap: 'round',
        lineJoin: 'round',
        interactive: false
      }).addTo(map);
      typhoonSignalLines.push(currentSignalLine);
    }
  });
  map.on('mousemove', function(e) {
    if (drawingSignal && currentSignalLine) {
      // Only add point if inside PH
      if (phBoundary) {
        const pt = turf.point([e.latlng.lng, e.latlng.lat]);
        if (!turf.booleanPointInPolygon(pt, phBoundary)) return;
      }
      const latlngs = currentSignalLine.getLatLngs();
      latlngs.push(e.latlng);
      currentSignalLine.setLatLngs(latlngs);
    }
  });
  map.on('mouseup', function(e) {
    if (drawingSignal) {
      drawingSignal = false;
      currentSignalLine = null;
    }
  });
  // Prevent map drag when drawing
  map.on('mousedown', function(e) {
    if (activeSignalBrush) map.dragging.disable();
  });
  map.on('mouseup', function(e) {
    if (activeSignalBrush) map.dragging.enable();
  });
  // Clear all typhoon signal lines
  const clearTyphoonSignalsBtn = document.getElementById('clearTyphoonSignalsBtn');
  if (clearTyphoonSignalsBtn) {
    clearTyphoonSignalsBtn.onclick = function() {
      typhoonSignalLines.forEach(line => map.removeLayer(line));
      typhoonSignalLines = [];
    };
  }

  // Properly initialize the brush row
  const typhoonSignalBrushRow = document.getElementById('typhoon-signal-brush-row');
  // Show/hide typhoon signal brush row and lines based on overlay
  let typhoonSignalLinesVisible = false;
  let typhoonSignalLinesHidden = [];
  map.on('overlayadd', function(e) {
    if (e.name === 'Cyclone Signals') {
      // Show legend/source for Cyclone Signals
      var typhoonSignalLegend = document.getElementById('typhoon-signal-legend-box');
      var typhoonSignalSourceBox = document.getElementById('typhoon-signal-source-box');
      if (typhoonSignalLegend) typhoonSignalLegend.style.display = '';
      if (typhoonSignalSourceBox) typhoonSignalSourceBox.style.display = '';
      // Restore lines
      typhoonSignalLinesVisible = true;
      typhoonSignalLinesHidden.forEach(line => line.addTo(map));
      typhoonSignalLines = typhoonSignalLines.concat(typhoonSignalLinesHidden);
      typhoonSignalLinesHidden = [];
    }
  });
  map.on('overlayremove', function(e) {
    if (e.name === 'Cyclone Signals') {
      // Hide legend/source for Cyclone Signals
      var typhoonSignalLegend = document.getElementById('typhoon-signal-legend-box');
      var typhoonSignalSourceBox = document.getElementById('typhoon-signal-source-box');
      if (typhoonSignalLegend) typhoonSignalLegend.style.display = 'none';
      if (typhoonSignalSourceBox) typhoonSignalSourceBox.style.display = 'none';
      // Remove lines but keep in memory
      typhoonSignalLinesVisible = false;
      typhoonSignalLinesHidden = typhoonSignalLines;
      typhoonSignalLines.forEach(line => map.removeLayer(line));
      typhoonSignalLines = [];
    }
  });
  // Only add new lines to map if visible
  map.on('mousedown', function(e) {
    if (activeSignalBrush && !drawingSignal && typhoonSignalLinesVisible) {
      drawingSignal = true;
      currentSignalLine = L.polyline([e.latlng], {
        color: signalColors[activeSignalBrush],
        weight: signalBrushSize,
        opacity: 1,
        smoothFactor: 1.0,
        lineCap: 'round',
        lineJoin: 'round',
        interactive: false
      }).addTo(map);
      typhoonSignalLines.push(currentSignalLine);
    }
  });
} 