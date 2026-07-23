/**
 * Roof/light line estimator — Google Solar API (when configured), OSM footprint,
 * or manual fallback inputs.
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
  const SQFT_PER_SQM = 10.7639;

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

  function polygonAreaSqMeters(coords) {
    if (coords.length < 3) return 0;
    const centerLat = coords.reduce((s, c) => s + c.lat, 0) / coords.length;
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
      p += haversineMeters(coords[i].lat, coords[i].lon, coords[j].lat, coords[j].lon);
    }
    return p;
  }

  function sqMetersToSqFeet(m2) {
    return m2 * SQFT_PER_SQM;
  }

  function metersToFeet(m) {
    return m * 3.28084;
  }

  function pitchDegToRoofType(pitchDeg) {
    if (pitchDeg == null) return null;
    if (pitchDeg < 5) return 'flat';
    if (pitchDeg < 15) return 'gable';
    if (pitchDeg < 30) return 'hip';
    return 'complex';
  }

  function parseSolarResponse(data) {
    const sp = data.solarPotential;
    if (!sp) return null;
    const whole = sp.wholeRoofStats || {};
    const roofM2 = whole.areaMeters2;
    if (!roofM2) return null;

    const segs = sp.roofSegmentStats || [];
    const biggest = segs.reduce(
      (best, seg) =>
        (seg.stats?.areaMeters2 || 0) > (best.stats?.areaMeters2 || 0) ? seg : best,
      segs[0] || {}
    );
    const pitchDeg =
      biggest?.pitchDegrees != null ? Math.round(biggest.pitchDegrees * 10) / 10 : null;
    const groundM2 = segs.reduce((sum, seg) => sum + (seg.stats?.groundAreaMeters2 || 0), 0) || null;

    const img = data.imageryDate || {};
    const imageryDate = img.year
      ? `${img.year}-${String(img.month || 1).padStart(2, '0')}`
      : null;

    return {
      roofAreaSqFt: Math.round(roofM2 * SQFT_PER_SQM),
      groundAreaSqFt: groundM2 ? Math.round(groundM2 * SQFT_PER_SQM) : null,
      segments: segs.length,
      pitchDeg,
      imageryQuality: data.imageryQuality || null,
      imageryDate,
      inferredRoofType: pitchDegToRoofType(pitchDeg),
    };
  }

  async function fetchGoogleSolar(lat, lon) {
    try {
      const proxy = await fetch(`/api/solar?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`);
      if (proxy.ok) {
        const parsed = parseSolarResponse(await proxy.json());
        if (parsed) return parsed;
      }
    } catch (_) {
      /* proxy unavailable locally — try direct key */
    }

    const key = (cfg.googleMapsApiKey || '').trim();
    if (!key) return null;

    const url = new URL('https://solar.googleapis.com/v1/buildingInsights:findClosest');
    url.searchParams.set('location.latitude', String(lat));
    url.searchParams.set('location.longitude', String(lon));
    url.searchParams.set('requiredQuality', 'BASE');
    url.searchParams.set('key', key);

    try {
      const res = await fetch(url.toString());
      if (!res.ok) return null;
      return parseSolarResponse(await res.json());
    } catch (_) {
      return null;
    }
  }

  async function geocodeAddress(address) {
    const params = new URLSearchParams({
      q: address,
      format: 'json',
      limit: '1',
      addressdetails: '1',
      countrycodes: 'us',
    });
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': cfg.nominatimUserAgent || 'ThinRedLineEstimator/1.0',
      },
    });
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
    solarMeta = null,
  }) {
    const effectiveRoofType =
      dataSource === 'google-solar' && solarMeta?.inferredRoofType
        ? solarMeta.inferredRoofType
        : roofType;
    const storyMult = storyMultipliers[stories] ?? storyMultipliers[1];
    const roofMult = roofMultipliers[effectiveRoofType] ?? 1;
    const coverageMult = coverageOptions[coverage] ?? 0.6;
    const segmentMult =
      solarMeta?.segments > 2 ? 1 + Math.min(0.25, (solarMeta.segments - 2) * 0.06) : 1;

    let rooflineFt;
    if (perimeterFt) {
      rooflineFt = perimeterFt * storyMult * roofMult * coverageMult * segmentMult;
    } else {
      const approxPerimeter = Math.sqrt(footprintSqFt) * perimeterFactor;
      rooflineFt = approxPerimeter * storyMult * roofMult * coverageMult * segmentMult;
    }

    const priceLow = Math.round(rooflineFt * priceMin);
    const priceHigh = Math.round(rooflineFt * priceMax);

    return {
      rooflineFt: Math.round(rooflineFt),
      priceLow,
      priceHigh,
      footprintSqFt: Math.round(footprintSqFt),
      roofAreaSqFt: solarMeta?.roofAreaSqFt || null,
      dataSource,
      effectiveRoofType,
      solarMeta,
      assumptions: buildAssumptions(stories, effectiveRoofType, coverage, dataSource, solarMeta),
    };
  }

  function buildAssumptions(stories, roofType, coverage, dataSource, solarMeta) {
    const parts = [];
    if (dataSource === 'google-solar') {
      parts.push(
        `Measured roof data from Google Solar (${solarMeta.segments} segment${solarMeta.segments !== 1 ? 's' : ''}` +
          (solarMeta.pitchDeg != null ? `, ~${solarMeta.pitchDeg}° pitch` : '') +
          ').'
      );
      if (solarMeta.imageryDate) {
        parts.push(`Satellite imagery dated ${solarMeta.imageryDate}.`);
      }
    } else if (dataSource === 'osm') {
      parts.push('Building footprint from OpenStreetMap (may not match your exact roofline).');
    } else {
      parts.push('Estimate based on entered square footage and typical home proportions.');
    }
    parts.push(`${stories}-story home, ${roofType} roof, ${coverage.replace('-', ' & ')} coverage.`);
    parts.push(
      `Pricing range $${priceMin}–$${priceMax}/linear foot installed (materials, labor, removal & storage).`
    );
    parts.push('Final quote may differ based on roof access, tree obstructions, and design complexity.');
    return parts;
  }

  function sourceLabel(dataSource) {
    if (dataSource === 'google-solar') return 'Google Solar';
    if (dataSource === 'osm') return 'OpenStreetMap';
    return 'manual';
  }

  function renderResult(container, result, lead) {
    container.classList.remove('empty');
    const solarExtra =
      result.dataSource === 'google-solar' && result.roofAreaSqFt
        ? `<p class="estimate-detail">Roof area: ~${result.roofAreaSqFt.toLocaleString()} sq ft (measured)</p>`
        : '';
    const estimateSummary = [
      `Online estimate: ~${result.rooflineFt.toLocaleString()} linear ft`,
      `Ballpark price: $${result.priceLow.toLocaleString()} – $${result.priceHigh.toLocaleString()}`,
    ];
    container.innerHTML = `
      <p class="estimate-detail">Estimated roofline for Christmas lights</p>
      <p class="estimate-price">${result.rooflineFt.toLocaleString()} linear ft</p>
      <p class="estimate-detail">Ballpark installed price</p>
      <p class="estimate-price">$${result.priceLow.toLocaleString()} – $${result.priceHigh.toLocaleString()}</p>
      ${result.footprintSqFt ? `<p class="estimate-detail">Footprint: ~${result.footprintSqFt.toLocaleString()} sq ft (${sourceLabel(result.dataSource)})</p>` : ''}
      ${solarExtra}
      <div class="disclaimer">
        <strong>Estimate only.</strong>
        <ul style="margin:0.5rem 0 0; padding-left:1.1rem;">
          ${result.assumptions.map((a) => `<li>${a}</li>`).join('')}
        </ul>
      </div>
      <p style="margin-top:1rem;">
        <button type="button" class="btn btn-primary" id="estimate-quote-btn">Get Your Free Quote</button>
      </p>
    `;
    const quoteBtn = container.querySelector('#estimate-quote-btn');
    quoteBtn?.addEventListener('click', () => {
      window.LeadCapture?.openQuoteSms(lead, [
        '---',
        ...estimateSummary,
        'Please send my free personalized quote.',
      ]);
    });
  }

  function setStatus(el, type, msg) {
    if (!el) return;
    el.className = `status-msg ${type}`;
    el.textContent = msg;
  }

  async function runAddressEstimate(form, resultEl, statusEl) {
    const addressInput = form.querySelector('[name="address"]');
    const lc = window.LeadCapture;
    if (!lc?.validateLeadFields(form.closest('.estimator-panel'), addressInput)) {
      setStatus(statusEl, 'error', 'Please complete your contact information and address.');
      return;
    }

    const lead = lc.readLeadFromEstimator(addressInput);
    const address = addressInput.value.trim();
    const stories = parseInt(form.querySelector('[name="stories"]').value, 10);
    const roofType = form.querySelector('[name="roofType"]').value;
    const coverage = form.querySelector('[name="coverage"]').value;

    if (!address) {
      setStatus(statusEl, 'error', 'Please enter an address.');
      return;
    }

    setStatus(statusEl, 'loading', 'Looking up address and roof measurements…');
    resultEl.classList.add('empty');
    resultEl.textContent = 'Calculating…';

    try {
      const geo = await geocodeAddress(address);
      setStatus(statusEl, 'loading', `Found: ${geo.displayName.split(',').slice(0, 3).join(',')}…`);

      let footprintSqFt;
      let perimeterFt = null;
      let dataSource = 'manual';
      let solarMeta = null;

      setStatus(statusEl, 'loading', 'Checking Google Solar roof data…');
      const solar = await fetchGoogleSolar(geo.lat, geo.lon);
      if (solar) {
        footprintSqFt = solar.groundAreaSqFt || solar.roofAreaSqFt;
        solarMeta = solar;
        dataSource = 'google-solar';
        setStatus(statusEl, 'success', 'Roof measured via Google Solar API.');
      } else {
        const building = await fetchBuildingFootprint(geo.lat, geo.lon);
        if (building) {
          footprintSqFt = sqMetersToSqFeet(building.areaSqM);
          perimeterFt = metersToFeet(building.perimeterM);
          dataSource = 'osm';
          setStatus(statusEl, 'success', 'Building footprint found via OpenStreetMap.');
        } else {
          footprintSqFt = parseInt(form.querySelector('[name="fallbackSqFt"]').value, 10) || 2000;
          dataSource = 'manual';
          setStatus(statusEl, 'success', 'No roof data found — using fallback square footage.');
        }
      }

      const result = estimateFromInputs({
        footprintSqFt,
        stories,
        roofType,
        coverage,
        perimeterFt,
        dataSource,
        solarMeta,
      });
      renderResult(resultEl, result, lead);
    } catch (err) {
      setStatus(statusEl, 'error', err.message || 'Estimate failed. Try manual entry.');
      resultEl.classList.add('empty');
      resultEl.textContent = 'Enter an address or switch to manual entry.';
    }
  }

  function runManualEstimate(form, resultEl, statusEl) {
    const addressInput = form.querySelector('[name="address"]');
    const lc = window.LeadCapture;
    if (!lc?.validateLeadFields(form.closest('.estimator-panel'), addressInput)) {
      setStatus(statusEl, 'error', 'Please complete your contact information and address.');
      return;
    }

    const lead = lc.readLeadFromEstimator(addressInput);
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
    renderResult(resultEl, result, lead);
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

    const panel = document.querySelector('#estimator .estimator-panel');
    panel?.querySelectorAll('input').forEach((input) => {
      input.addEventListener('input', () => window.LeadCapture?.showFieldError(input, ''));
    });
  }

  document.addEventListener('DOMContentLoaded', initEstimator);
})();
