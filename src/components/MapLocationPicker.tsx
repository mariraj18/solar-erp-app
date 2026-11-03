import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Search, Navigation, Compass, Layers, CheckCircle, AlertTriangle, Crosshair, Move, Maximize2 } from 'lucide-react';
import { api } from '../lib/api';

export interface MapLocationPickerProps {
  latitude: number | null | undefined;
  longitude: number | null | undefined;
  radiusMeters?: number;
  accuracyThreshold?: number;
  onChange?: (coords: { latitude: number; longitude: number; radiusMeters: number; accuracyThreshold?: number }) => void;
  readOnly?: boolean;
  workerPosition?: { latitude: number; longitude: number; accuracy?: number } | null;
  height?: string;
  showControls?: boolean;
  label?: string;
}

// Calculate destination point on circumference due East (bearing 90°)
function getCircleEdgeLatLng(centerLat: number, centerLng: number, radiusMeters: number): L.LatLng {
  const earthRadius = 6371000;
  const dLng = (radiusMeters / (earthRadius * Math.cos((centerLat * Math.PI) / 180))) * (180 / Math.PI);
  return L.latLng(centerLat, centerLng + dLng);
}

// SVG Icons for Leaflet markers
function createSiteIcon() {
  return L.divIcon({
    className: 'custom-site-pin',
    html: `
      <div style="position: relative; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;">
        <div style="width: 32px; height: 32px; background: #014025; border: 2.5px solid #ffffff; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); box-shadow: 0 4px 10px rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center;">
          <div style="width: 10px; height: 10px; background: #ffffff; border-radius: 50%; transform: rotate(45deg);"></div>
        </div>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -36],
  });
}

function createRadiusHandleIcon(radius: number) {
  return L.divIcon({
    className: 'custom-radius-handle',
    html: `
      <div style="
        display: flex;
        align-items: center;
        background: #014025;
        color: #ffffff;
        padding: 3px 9px;
        border-radius: 9999px;
        font-size: 11px;
        font-weight: 700;
        font-family: monospace;
        border: 2px solid #ffffff;
        box-shadow: 0 4px 12px rgba(0,0,0,0.38);
        cursor: grab;
        white-space: nowrap;
        user-select: none;
        transition: transform 0.1s ease;
      ">
        <span style="font-size: 13px; margin-right: 4px; color: #a7f3d0;">⟷</span>
        <span>${radius}m</span>
      </div>
    `,
    iconSize: [68, 26],
    iconAnchor: [34, 13],
  });
}

function createWorkerIcon(isInside: boolean) {
  const color = isInside ? '#10b981' : '#ef4444';
  const pulseColor = isInside ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)';
  return L.divIcon({
    className: 'custom-worker-pin',
    html: `
      <div style="position: relative; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;">
        <div style="position: absolute; width: 28px; height: 28px; border-radius: 50%; background: ${pulseColor}; animation: pulse 1.5s infinite;"></div>
        <div style="width: 16px; height: 16px; background: ${color}; border: 2.5px solid #ffffff; border-radius: 50%; box-shadow: 0 2px 6px rgba(0,0,0,0.35);"></div>
      </div>
      <style>
        @keyframes pulse {
          0% { transform: scale(0.8); opacity: 0.8; }
          50% { transform: scale(1.4); opacity: 0.2; }
          100% { transform: scale(0.8); opacity: 0.8; }
        }
      </style>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

export function MapLocationPicker({
  latitude,
  longitude,
  radiusMeters = 150,
  accuracyThreshold = 50,
  onChange,
  readOnly = false,
  workerPosition,
  height = '340px',
  showControls = true,
  label = 'Geofenced Site Location',
}: MapLocationPickerProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const centerMarkerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const radiusHandleRef = useRef<L.Marker | null>(null);
  const radiusLineRef = useRef<L.Polyline | null>(null);
  const workerMarkerRef = useRef<L.Marker | null>(null);

  // Fallback coords (e.g. Bangalore center)
  const defaultLat = 12.9715987;
  const defaultLng = 77.5945627;

  const currentLat = typeof latitude === 'number' && !isNaN(latitude) && latitude !== 0 ? latitude : defaultLat;
  const currentLng = typeof longitude === 'number' && !isNaN(longitude) && longitude !== 0 ? longitude : defaultLng;

  const [currentRadius, setCurrentRadius] = useState<number>(radiusMeters);
  const [clickMode, setClickMode] = useState<'move_center' | 'set_radius'>('move_center');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [locatingUser, setLocatingUser] = useState(false);
  const [locationFeedback, setLocationFeedback] = useState<string | null>(null);

  // Keep ref to latest props for event handlers
  const propsRef = useRef({ currentLat, currentLng, currentRadius, accuracyThreshold, onChange, clickMode });
  propsRef.current = { currentLat, currentLng, currentRadius, accuracyThreshold, onChange, clickMode };

  // Sync radius state when prop changes
  useEffect(() => {
    if (radiusMeters && radiusMeters !== currentRadius) {
      setCurrentRadius(radiusMeters);
    }
  }, [radiusMeters]);

  // Function to update radius on map & state
  const applyRadius = useCallback((newRadius: number, notify = true) => {
    const clamped = Math.max(20, Math.min(2500, Math.round(newRadius)));
    setCurrentRadius(clamped);

    if (circleRef.current) {
      circleRef.current.setRadius(clamped);
    }

    if (centerMarkerRef.current && radiusHandleRef.current) {
      const center = centerMarkerRef.current.getLatLng();
      const edge = getCircleEdgeLatLng(center.lat, center.lng, clamped);
      radiusHandleRef.current.setLatLng(edge);
      radiusHandleRef.current.setIcon(createRadiusHandleIcon(clamped));

      if (radiusLineRef.current) {
        radiusLineRef.current.setLatLngs([center, edge]);
      }
    }

    if (notify && propsRef.current.onChange) {
      propsRef.current.onChange({
        latitude: Number(propsRef.current.currentLat.toFixed(6)),
        longitude: Number(propsRef.current.currentLng.toFixed(6)),
        radiusMeters: clamped,
        accuracyThreshold: propsRef.current.accuracyThreshold,
      });
    }
  }, []);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [currentLat, currentLng],
        zoom: 16,
        zoomControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      // 1. Center site marker
      const siteMarker = L.marker([currentLat, currentLng], {
        icon: createSiteIcon(),
        draggable: !readOnly,
      }).addTo(map);

      // 2. Circular Geofence
      const geofenceCircle = L.circle([currentLat, currentLng], {
        radius: currentRadius,
        color: '#014025',
        fillColor: '#456B5A',
        fillOpacity: 0.22,
        weight: 2.5,
        dashArray: '5, 5',
      }).addTo(map);

      // 3. Radius measurement dashed line
      const initialEdge = getCircleEdgeLatLng(currentLat, currentLng, currentRadius);
      const radiusLine = L.polyline([[currentLat, currentLng], [initialEdge.lat, initialEdge.lng]], {
        color: '#014025',
        weight: 2,
        dashArray: '3, 4',
        opacity: 0.8,
      }).addTo(map);

      // 4. Draggable Radius Handle on Circumference
      const radiusHandle = L.marker(initialEdge, {
        icon: createRadiusHandleIcon(currentRadius),
        draggable: !readOnly,
        zIndexOffset: 1000,
      }).addTo(map);

      centerMarkerRef.current = siteMarker;
      circleRef.current = geofenceCircle;
      radiusHandleRef.current = radiusHandle;
      radiusLineRef.current = radiusLine;
      mapInstanceRef.current = map;

      if (!readOnly) {
        // Drag Center Marker
        siteMarker.on('drag', () => {
          const center = siteMarker.getLatLng();
          geofenceCircle.setLatLng(center);
          const edge = getCircleEdgeLatLng(center.lat, center.lng, propsRef.current.currentRadius);
          radiusHandle.setLatLng(edge);
          radiusLine.setLatLngs([center, edge]);
        });

        siteMarker.on('dragend', () => {
          const center = siteMarker.getLatLng();
          geofenceCircle.setLatLng(center);
          const edge = getCircleEdgeLatLng(center.lat, center.lng, propsRef.current.currentRadius);
          radiusHandle.setLatLng(edge);
          radiusLine.setLatLngs([center, edge]);

          if (propsRef.current.onChange) {
            propsRef.current.onChange({
              latitude: Number(center.lat.toFixed(6)),
              longitude: Number(center.lng.toFixed(6)),
              radiusMeters: propsRef.current.currentRadius,
              accuracyThreshold: propsRef.current.accuracyThreshold,
            });
          }
        });

        // Drag Radius Handle directly on circumference to adjust radius
        radiusHandle.on('drag', () => {
          const center = siteMarker.getLatLng();
          const handlePos = radiusHandle.getLatLng();
          const dist = Math.max(20, Math.min(2500, Math.round(center.distanceTo(handlePos))));

          geofenceCircle.setRadius(dist);
          radiusHandle.setIcon(createRadiusHandleIcon(dist));
          radiusLine.setLatLngs([center, handlePos]);
          setCurrentRadius(dist);
        });

        radiusHandle.on('dragend', () => {
          const center = siteMarker.getLatLng();
          const handlePos = radiusHandle.getLatLng();
          const dist = Math.max(20, Math.min(2500, Math.round(center.distanceTo(handlePos))));

          // Re-align handle nicely to East
          const finalEdge = getCircleEdgeLatLng(center.lat, center.lng, dist);
          radiusHandle.setLatLng(finalEdge);
          radiusLine.setLatLngs([center, finalEdge]);
          applyRadius(dist, true);
        });

        // Click anywhere on map
        map.on('click', (e: L.LeafletMouseEvent) => {
          const { lat, lng } = e.latlng;
          const center = siteMarker.getLatLng();

          if (propsRef.current.clickMode === 'set_radius') {
            // Click to set radius from center
            const clickedDistance = Math.max(20, Math.min(2500, Math.round(center.distanceTo(e.latlng))));
            applyRadius(clickedDistance, true);
            setLocationFeedback(`Radius set to ${clickedDistance}m from clicked point.`);
          } else {
            // Click to move site center
            siteMarker.setLatLng([lat, lng]);
            geofenceCircle.setLatLng([lat, lng]);
            const edge = getCircleEdgeLatLng(lat, lng, propsRef.current.currentRadius);
            radiusHandle.setLatLng(edge);
            radiusLine.setLatLngs([[lat, lng], [edge.lat, edge.lng]]);

            if (propsRef.current.onChange) {
              propsRef.current.onChange({
                latitude: Number(lat.toFixed(6)),
                longitude: Number(lng.toFixed(6)),
                radiusMeters: propsRef.current.currentRadius,
                accuracyThreshold: propsRef.current.accuracyThreshold,
              });
            }
          }
        });
      }
    } else {
      // Update existing map
      centerMarkerRef.current?.setLatLng([currentLat, currentLng]);
      circleRef.current?.setLatLng([currentLat, currentLng]);
      circleRef.current?.setRadius(currentRadius);
      const edge = getCircleEdgeLatLng(currentLat, currentLng, currentRadius);
      radiusHandleRef.current?.setLatLng(edge);
      radiusHandleRef.current?.setIcon(createRadiusHandleIcon(currentRadius));
      radiusLineRef.current?.setLatLngs([[currentLat, currentLng], [edge.lat, edge.lng]]);

      if (mapInstanceRef.current) {
        const center = mapInstanceRef.current.getCenter();
        const dist = center.distanceTo(L.latLng(currentLat, currentLng));
        if (dist > 50) {
          mapInstanceRef.current.panTo([currentLat, currentLng], { animate: true, duration: 0.5 });
        }
      }
    }
  }, [currentLat, currentLng, readOnly, applyRadius]);

  // Sync radius changes to Leaflet Circle and Handle
  useEffect(() => {
    if (circleRef.current && radiusHandleRef.current && radiusLineRef.current && centerMarkerRef.current) {
      circleRef.current.setRadius(currentRadius);
      const center = centerMarkerRef.current.getLatLng();
      const edge = getCircleEdgeLatLng(center.lat, center.lng, currentRadius);
      radiusHandleRef.current.setLatLng(edge);
      radiusHandleRef.current.setIcon(createRadiusHandleIcon(currentRadius));
      radiusLineRef.current.setLatLngs([center, edge]);
    }
  }, [currentRadius]);

  // Worker live position rendering
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    if (workerPosition && typeof workerPosition.latitude === 'number' && typeof workerPosition.longitude === 'number') {
      const wLat = workerPosition.latitude;
      const wLng = workerPosition.longitude;

      const siteLatLng = L.latLng(currentLat, currentLng);
      const workerLatLng = L.latLng(wLat, wLng);
      const distance = Math.round(siteLatLng.distanceTo(workerLatLng));
      const isInside = distance <= currentRadius;

      if (!workerMarkerRef.current) {
        workerMarkerRef.current = L.marker([wLat, wLng], {
          icon: createWorkerIcon(isInside),
        }).addTo(map);
      } else {
        workerMarkerRef.current.setLatLng([wLat, wLng]);
        workerMarkerRef.current.setIcon(createWorkerIcon(isInside));
      }

      workerMarkerRef.current.bindPopup(
        `<div style="font-size:12px;font-weight:600;color:#014025;">
          ${isInside ? '✅ Inside Allowed Range' : '⚠️ Outside Geofence'}
          <div style="font-size:11px;color:#666;font-weight:normal;margin-top:2px;">
            Distance to site: ${distance}m (Allowed: ${currentRadius}m)
          </div>
        </div>`
      );

      const bounds = L.latLngBounds([siteLatLng, workerLatLng]);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });
    } else if (workerMarkerRef.current) {
      workerMarkerRef.current.remove();
      workerMarkerRef.current = null;
    }
  }, [workerPosition, currentLat, currentLng, currentRadius]);

  // Search Address with OpenStreetMap Nominatim and Local Worksites (via proxy)
  const handleSearch = async (e?: React.SyntheticEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const q = searchQuery.trim();
    if (!q) return;

    setIsSearching(true);
    setSearchResults([]);
    setLocationFeedback(null);

    try {
      // 1. Query server-side proxy (fast, reliable, has proper User-Agent and searches local worksites)
      const data = await api.geo.search(q);
      if (Array.isArray(data) && data.length > 0) {
        setSearchResults(data);
        setLocationFeedback(`Found ${data.length} locations matching "${q}". Click one to set map pin.`);
      } else {
        // 2. Direct client fallback if proxy returned empty
        const resp = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=6`
        );
        const directData = await resp.json();
        if (Array.isArray(directData) && directData.length > 0) {
          setSearchResults(directData);
          setLocationFeedback(`Found ${directData.length} locations. Click one to pin on map.`);
        } else {
          setLocationFeedback('No locations found. Try searching by city, district, town, or landmark.');
        }
      }
    } catch {
      try {
        const resp = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=6`
        );
        const directData = await resp.json();
        if (Array.isArray(directData) && directData.length > 0) {
          setSearchResults(directData);
          setLocationFeedback(`Found ${directData.length} locations. Click one to pin on map.`);
        } else {
          setLocationFeedback('No locations found. Try searching by city, district, town, or landmark.');
        }
      } catch {
        setLocationFeedback('Location search request failed. Please check internet connection.');
      }
    } finally {
      setIsSearching(false);
    }
  };

  const selectSearchResult = (item: any) => {
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lon);
    if (!isNaN(lat) && !isNaN(lng)) {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.flyTo([lat, lng], 17, { animate: true, duration: 0.8 });
      }
      if (centerMarkerRef.current && circleRef.current && radiusHandleRef.current && radiusLineRef.current) {
        centerMarkerRef.current.setLatLng([lat, lng]);
        circleRef.current.setLatLng([lat, lng]);
        const edge = getCircleEdgeLatLng(lat, lng, currentRadius);
        radiusHandleRef.current.setLatLng(edge);
        radiusLineRef.current.setLatLngs([[lat, lng], [edge.lat, edge.lng]]);
      }
      setSearchResults([]);
      const shortName = (item.display_name || '').split(',')[0];
      setSearchQuery(shortName);
      setLocationFeedback(`Location selected: ${item.display_name.split(',').slice(0, 3).join(', ')}`);

      if (onChange) {
        onChange({
          latitude: Number(lat.toFixed(6)),
          longitude: Number(lng.toFixed(6)),
          radiusMeters: currentRadius,
          accuracyThreshold,
        });
      }
    }
  };

  // Detect Current Location
  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      setLocationFeedback('Geolocation is not supported by your browser.');
      return;
    }

    setLocatingUser(true);
    setLocationFeedback(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocatingUser(false);
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const acc = Math.round(pos.coords.accuracy);

        if (mapInstanceRef.current && centerMarkerRef.current && circleRef.current && radiusHandleRef.current && radiusLineRef.current) {
          mapInstanceRef.current.flyTo([lat, lng], 17);
          centerMarkerRef.current.setLatLng([lat, lng]);
          circleRef.current.setLatLng([lat, lng]);
          const edge = getCircleEdgeLatLng(lat, lng, currentRadius);
          radiusHandleRef.current.setLatLng(edge);
          radiusLineRef.current.setLatLngs([[lat, lng], [edge.lat, edge.lng]]);
        }

        setLocationFeedback(`Captured current GPS fix (accuracy ~${acc}m)`);

        if (onChange) {
          onChange({
            latitude: Number(lat.toFixed(6)),
            longitude: Number(lng.toFixed(6)),
            radiusMeters: currentRadius,
            accuracyThreshold: Math.max(accuracyThreshold, acc + 10),
          });
        }
      },
      (err) => {
        setLocatingUser(false);
        setLocationFeedback(`Location capture failed: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  return (
    <div className="space-y-2.5">
      {/* Header and Controls */}
      {showControls && (
        <div className="space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center space-x-2 text-xs font-semibold text-[#014025]">
              <MapPin className="w-4 h-4 text-[#014025]" />
              <span>{label}</span>
              <span className="text-[11px] font-normal text-slate-500">
                (Click map or drag handles directly on real map)
              </span>
            </div>

            {!readOnly && (
              <button
                type="button"
                onClick={handleDetectLocation}
                disabled={locatingUser}
                className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-medium rounded-md bg-[#014025]/10 text-[#014025] hover:bg-[#014025]/20 border border-[#456B5A]/30 transition-colors"
              >
                <Crosshair className={`w-3.5 h-3.5 ${locatingUser ? 'animate-spin' : ''}`} />
                <span>{locatingUser ? 'Detecting...' : 'Detect Current Location'}</span>
              </button>
            )}
          </div>

          {/* Search Bar - Note: Uses div instead of form to avoid triggering parent form submission */}
          {!readOnly && (
            <div className="relative">
              <div className="flex items-center gap-1.5">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        e.stopPropagation();
                        handleSearch();
                      }
                    }}
                    placeholder="Search place, site address, or landmark on map..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#014025] focus:border-[#014025]"
                  />
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSearch();
                  }}
                  disabled={isSearching}
                  className="px-3 py-1.5 text-xs font-semibold bg-[#014025] hover:bg-[#456B5A] text-white rounded-md shadow-xs transition-colors shrink-0 disabled:opacity-50 flex items-center space-x-1 cursor-pointer"
                >
                  {isSearching ? (
                    <>
                      <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Searching...</span>
                    </>
                  ) : (
                    <>
                      <Search className="w-3.5 h-3.5" />
                      <span>Search</span>
                    </>
                  )}
                </button>
              </div>

              {/* Search Results Dropdown */}
              {searchResults.length > 0 && (
                <div className="absolute z-[1000] left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden max-h-48 overflow-y-auto">
                  {searchResults.map((item, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => selectSearchResult(item)}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-[#014025]/5 border-b border-slate-100 last:border-b-0 flex items-start space-x-2 transition-colors"
                    >
                      <MapPin className="w-3.5 h-3.5 text-[#014025] shrink-0 mt-0.5" />
                      <span className="line-clamp-2 text-slate-800">{item.display_name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {locationFeedback && (
            <div className="text-[11px] text-[#014025] font-medium bg-[#014025]/5 border border-[#456B5A]/20 px-2.5 py-1 rounded">
              {locationFeedback}
            </div>
          )}
        </div>
      )}

      {/* Real Interactive Map Canvas */}
      <div className="relative rounded-lg overflow-hidden border border-slate-300 shadow-inner">
        <div ref={mapContainerRef} style={{ width: '100%', height }} className="z-0" />

        {/* IN-MAP REAL-TIME INTERACTION CONTROLS (Floating Over Map) */}
        {!readOnly && (
          <div className="absolute top-2 left-2 z-[400] flex flex-wrap items-center gap-1.5 bg-white/95 backdrop-blur-xs p-1.5 rounded-lg shadow-md border border-slate-200 text-xs">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1">Map Click Mode:</span>
            <button
              type="button"
              onClick={() => setClickMode('move_center')}
              className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center space-x-1 transition-all ${
                clickMode === 'move_center'
                  ? 'bg-[#014025] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Move className="w-3 h-3" />
              <span>📍 Move Location</span>
            </button>
            <button
              type="button"
              onClick={() => setClickMode('set_radius')}
              className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center space-x-1 transition-all ${
                clickMode === 'set_radius'
                  ? 'bg-[#014025] text-white shadow-xs ring-2 ring-emerald-400'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Maximize2 className="w-3 h-3" />
              <span>📏 Click to Set Radius</span>
            </button>
          </div>
        )}

        {/* IN-MAP REAL-TIME QUICK RADIUS CHIPS (Floating Top-Right) */}
        {!readOnly && (
          <div className="absolute top-2 right-2 z-[400] hidden sm:flex items-center gap-1 bg-white/95 backdrop-blur-xs px-2 py-1 rounded-lg shadow-md border border-slate-200 text-[11px]">
            <span className="font-semibold text-slate-500 mr-0.5">Radius:</span>
            {[50, 100, 150, 200, 300, 500].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => applyRadius(preset, true)}
                className={`px-1.5 py-0.5 rounded font-mono font-bold transition-all ${
                  currentRadius === preset
                    ? 'bg-[#014025] text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {preset}m
              </button>
            ))}
          </div>
        )}

        {/* Floating Coordinates & Range Pill (Bottom Overlay) */}
        <div className="absolute bottom-2 left-2 right-2 sm:right-auto z-[400] bg-white/95 backdrop-blur-xs px-3 py-2 rounded-lg shadow-md border border-slate-200 text-[11px] text-slate-700 flex flex-wrap items-center gap-x-3 gap-y-1">
          <div>
            <span className="text-slate-400 font-mono">LAT:</span>{' '}
            <span className="font-semibold text-slate-900 font-mono">{currentLat.toFixed(5)}</span>
          </div>
          <div>
            <span className="text-slate-400 font-mono">LON:</span>{' '}
            <span className="font-semibold text-slate-900 font-mono">{currentLng.toFixed(5)}</span>
          </div>
          <div className="flex items-center space-x-1.5 text-[#014025] font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-[#014025]"></span>
            <span>Radius: {currentRadius} Metres</span>
          </div>
          {!readOnly && (
            <span className="text-[10px] text-slate-500 font-medium">
              (Drag the ⟷ handle on circle to expand/shrink)
            </span>
          )}
        </div>
      </div>

      {/* Synchronized Radius Range Slider & Quick Presets */}
      {showControls && !readOnly && (
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-700 flex items-center space-x-1.5">
              <Compass className="w-3.5 h-3.5 text-[#014025]" />
              <span>Fine-Tune Radius (From Selected Map Center):</span>
            </label>
            <span className="text-xs font-bold text-[#014025] bg-[#014025]/10 px-2 py-0.5 rounded font-mono">
              {currentRadius} Metres
            </span>
          </div>

          <div className="flex items-center space-x-3">
            <input
              type="range"
              min={20}
              max={1000}
              step={10}
              value={currentRadius}
              onChange={(e) => applyRadius(Number(e.target.value), true)}
              className="w-full accent-[#014025] cursor-pointer"
            />
          </div>

          {/* Quick preset chips */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            <span className="text-[11px] text-slate-400 self-center mr-1">Presets:</span>
            {[30, 50, 100, 150, 200, 250, 300, 500, 750].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => applyRadius(preset, true)}
                className={`px-2 py-0.5 text-[11px] rounded transition-colors font-medium ${
                  currentRadius === preset
                    ? 'bg-[#014025] text-white shadow-2xs'
                    : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {preset}m
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
