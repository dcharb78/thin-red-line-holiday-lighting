/**
 * Roof/light line estimator using public geospatial data (Nominatim + Overpass)
 * with manual fallback inputs.
 */

(function () {
  const cfg = window.SITE_CONFIG?.estimator || {};
  const priceMin = cfg.pricePerFootMin ?? 8;
  const priceMax = cfg.pricePerFootMax ?? 15;
  const perimeterFactor = cfg.perimeterFactor ?? 4.2;
  const storyMultipliers = cfg.storyMultipliers || { 1: 1, 2: 1.35, 3: 1.55 };
  const roofMultipliers = cfg.roofTypeMultipliers || {
    gable: 1,
    hip: 1.15,
    flat: 0.85,
    complex: 1.35,
  };
  const coverageOptions = cfg.coverageOptions || {
    front: 0.35,
    'front-sides': 0.6,
    full: 1.0,
  };

  function haversineMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /** Shoelace formula — returns area in m² for lat/lon polygon (local projection). */
  function polygonAreaSqMeters(coords) {
    if (coords.length < 3) return 0;
    const centerLat =
      coords.reduce((s, c) => s + c.lat, 0) / coords.length;
    const toXY = (lat, lon) => {
      const x = haversineMeters(centerLat, lon, centerLat, coords[0].lon);
      const y = haversineMeters(lat, coords[0].lon, centerLat, coords[0].lon);
      const signX = lon >= coords[0].lon ? 1 : -1;
      const signY = lat >= centerLat ? 1 : -1;
      return { x: x * signX, y: y * signY };
    };
    let area = 0;
    for (let i = 0; i < coords.length; i++) {
      const j = (i + 1) % coords.length;
      const pi = toXY(coords[i].lat, coords[i].lon);
      const pj = toXY(coords[j].lat, coords[j].lon);
      area += pi.x * pj.y - pj.x * pi.y;
    }
    return Math.abs(area) / 2;
  }

  function polygonPerimeterMeters(coords) {
    let p = 0;
    for (let i = 0; i < coords.length; i++) {
      const j = (i + 1) % coords.length;
      p += haversineMeters(
        coords[i].lat,
        coords[i].lon,
        coords[j].lat,
        coords[j].lon
      );
    }
    return p;
  }

  function sqMetersToSqFeet(m2) {
    return m2 * 10.7639;
  }

  function metersToFeet(m) {
    return m * 3.28084;
  }

  async function geocodeAddress(address) {
    const params = new URLSearchParams({
      q: address,
      format: 'json',
      limit: '1',
      addressdetails: '1',
      countrycodes: 'us',
    });
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?${params}`,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': cfg.nominatimUserAgent || 'ThinRedLineEstimator/1.0',
        },
      }
    );
    if (!res.ok) throw new Error('Geocoding service unavailable.');
    const data = await res.json();
    if (!data.length) throw new Error('Address not found. Try manual entry.');
    return {
      lat: parseFloat(data[0].lat),
      lon: parseFloat(data[0].lon),
      displayName: data[0].display_name,
    };
  }

  async function fetchBuildingFootprint(lat, lon) {
    const radius = 40;
    const query = `
      [out:json][timeout:25];
      (
        way["building"](around:${radius},${lat},${lon});
        relation["building"](around:${radius},${lat},${lon});
      );
      out geom;
    `;
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: query,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    if (!res.ok) throw new Error('Building data service unavailable.');
    const data = await res.json();
    const elements = data.elements || [];
    if (!elements.length) return null;

    let best = null;
    let bestDist = Infinity;
    for (const el of elements) {
      const coords = extractCoords(el);
      if (coords.length < 3) continue;
      const cx = coords.reduce((s, c) => s + c.lat, 0) / coords.length;
      const cy = coords.reduce((s, c) => s + c.lon, 0) / coords.length;
      const dist = haversineMeters(lat, lon, cx, cy);
      const area = polygonAreaSqMeters(coords);
      if (dist < bestDist && area > 20) {
        bestDist = dist;
        best = { coords, areaSqM: area, perimeterM: polygonPerimeterMeters(coords) };
      }
    }
    return best;
  }

  function extractCoords(element) {
    if (element.type === 'way' && element.geometry) {
      return element.geometry.map((g) => ({ lat: g.lat, lon: g.lon }));
    }
    if (element.type === 'relation' && element.members) {
      for (const m of element.members) {
        if (m.role === 'outer' && m.geometry) {
          return m.geometry.map((g) => ({ lat: g.lat, lon: g.lon }));
        }
      }
    }
    return [];
  }

  function estimateFromInputs({
    footprintSqFt,
    stories = 1,
    roofType = 'gable',
    coverage = 'front-sides',
    perimeterFt = null,
    dataSource = 'manual',
  }) {
    const storyMult = storyMultipliers[stories] ?? storyMultipliers[1];
    const roofMult = roofMultipliers[roofType] ?? 1;
    const coverageMult = coverageOptions[coverage] ?? 0.6;

    let rooflineFt;
    if (perimeterFt) {
      rooflineFt = perimeterFt * storyMult * roofMult * coverageMult;
    } else {
      const approxPerimeter = Math.sqrt(footprintSqFt) * perimeterFactor;
      rooflineFt = approxPerimeter * storyMult * roofMult * coverageMult;
    }

    const priceLow = Math.round(rooflineFt * priceMin);
    const priceHigh = Math.round(rooflineFt * priceMax);

    return {
      rooflineFt: Math.round(rooflineFt),
      priceLow,
      priceHigh,
      footprintSqFt: Math.round(footprintSqFt),
      dataSource,
      assumptions: buildAssumptions(stories, roofType, coverage, dataSource),
    };
  }

  function buildAssumptions(stories, roofType, coverage, dataSource) {
    const parts = [];
    if (dataSource === 'osm') {
      parts.push('Building footprint from OpenStreetMap (may not match your exact roofline).');
    } else {
      parts.push('Estimate based on entered square footage and typical home proportions.');
    }
    parts.push(`${stories}-story home, ${roofType} roof, ${coverage.replace('-', ' & ')} coverage.`);
    parts.push(`Pricing range $${priceMin}–$${priceMax}/linear foot installed (materials, labor, removal & storage).`);
    parts.push('Final quote may differ based on roof access, tree obstructions, and design complexity.');
    return parts;
  }

  function renderResult(container, result) {
    container.classList.remove('empty');
    container.innerHTML = `
      <p class="estimate-detail">Estimated roofline for lights</p>
      <p class="estimate-price">${result.rooflineFt.toLocaleString()} linear ft</p>
      <p class="estimate-detail">Ballpark installed price</p>
      <p class="estimate-price">$${result.priceLow.toLocaleString()} – $${result.priceHigh.toLocaleString()}</p>
      ${result.footprintSqFt ? `<p class="estimate-detail">Footprint: ~${result.footprintSqFt.toLocaleString()} sq ft (${result.dataSource === 'osm' ? 'OpenStreetMap' : 'manual'})</p>` : ''}
      <div class="disclaimer">
        <strong>Estimate only.</strong>
        <ul style="margin:0.5rem 0 0; padding-left:1.1rem;">
          ${result.assumptions.map((a) => `<li>${a}</li>`).join('')}
        </ul>
      </div>
      <p style="margin-top:1rem;">
        <a href="#contact" class="btn btn-primary">Get Your Free Quote</a>
      </p>
    `;
  }

  function setStatus(el, type, msg) {
    if (!el) return;
    el.className = `status-msg ${type}`;
    el.textContent = msg;
  }

  async function runAddressEstimate(form, resultEl, statusEl) {
    const address = form.querySelector('[name="address"]').value.trim();
    const stories = parseInt(form.querySelector('[name="stories"]').value, 10);
    const roofType = form.querySelector('[name="roofType"]').value;
    const coverage = form.querySelector('[name="coverage"]').value;

    if (!address) {
      setStatus(statusEl, 'error', 'Please enter an address.');
      return;
    }

    setStatus(statusEl, 'loading', 'Looking up address and building footprint…');
    resultEl.classList.add('empty');
    resultEl.textContent = 'Calculating…';

    try {
      const geo = await geocodeAddress(address);
      setStatus(statusEl, 'loading', `Found: ${geo.displayName.split(',').slice(0, 3).join(',')}…`);

      const building = await fetchBuildingFootprint(geo.lat, geo.lon);
      let footprintSqFt;
      let perimeterFt = null;
      let dataSource = 'manual';

      if (building) {
        footprintSqFt = sqMetersToSqFeet(building.areaSqM);
        perimeterFt = metersToFeet(building.perimeterM);
        dataSource = 'osm';
        setStatus(statusEl, 'success', 'Building footprint found via OpenStreetMap.');
      } else {
        footprintSqFt = parseInt(form.querySelector('[name="fallbackSqFt"]').value, 10) || 2000;
        dataSource = 'manual';
        setStatus(
          statusEl,
          'success',
          'No OSM building outline found — using fallback square footage.'
        );
      }

      const result = estimateFromInputs({
        footprintSqFt,
        stories,
        roofType,
        coverage,
        perimeterFt,
        dataSource,
      });
      renderResult(resultEl, result);
    } catch (err) {
      setStatus(statusEl, 'error', err.message || 'Estimate failed. Try manual entry.');
      resultEl.classList.add('empty');
      resultEl.textContent = 'Enter an address or switch to manual entry.';
    }
  }

  function runManualEstimate(form, resultEl, statusEl) {
    const sqFt = parseInt(form.querySelector('[name="sqFt"]').value, 10);
    const stories = parseInt(form.querySelector('[name="storiesManual"]').value, 10);
    const roofType = form.querySelector('[name="roofTypeManual"]').value;
    const coverage = form.querySelector('[name="coverageManual"]').value;

    if (!sqFt || sqFt < 400) {
      setStatus(statusEl, 'error', 'Enter a valid home square footage (400+ sq ft).');
      return;
    }

    setStatus(statusEl, 'success', 'Estimate calculated from your inputs.');
    const result = estimateFromInputs({
      footprintSqFt: sqFt,
      stories,
      roofType,
      coverage,
      dataSource: 'manual',
    });
    renderResult(resultEl, result);
  }

  function initEstimator() {
    const addressForm = document.getElementById('estimator-address-form');
    const manualForm = document.getElementById('estimator-manual-form');
    const resultEl = document.getElementById('estimate-result');
    const statusEl = document.getElementById('estimate-status');
    const tabs = document.querySelectorAll('.tab');
    const addressPanel = document.getElementById('panel-address');
    const manualPanel = document.getElementById('panel-manual');

    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        tabs.forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        const mode = tab.dataset.tab;
        addressPanel.hidden = mode !== 'address';
        manualPanel.hidden = mode !== 'manual';
      });
    });

    addressForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      runAddressEstimate(addressForm, resultEl, statusEl);
    });

    manualForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      runManualEstimate(manualForm, resultEl, statusEl);
    });
  }

  document.addEventListener('DOMContentLoaded', initEstimator);
})();
