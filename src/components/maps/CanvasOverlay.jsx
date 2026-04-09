// src/components/map/CanvasOverlay.jsx
import React, { useEffect, useRef, useCallback, useState } from 'react';

/**
 * Creates the CanvasOverlayView class after Google Maps API is loaded
 */
const createCanvasOverlayClass = () => {
  if (!window.google?.maps?.OverlayView) {
    return null;
  }

  return class CanvasOverlayView extends window.google.maps.OverlayView {
    constructor(options = {}) {
      super();
      this.canvas = null;
      this.ctx = null;
      this.locations = options.locations || [];
      this.getColor = options.getColor || (() => '#3B82F6');
      this.radius = options.radius || 8;
      this.opacity = options.opacity || 0.8;
      this.onClick = options.onClick || null;
      this.onHover = options.onHover || null;
      this.selectedIndex = options.selectedIndex ?? -1;
      this.hoveredIndex = -1;
      this.pixelData = [];
      this.isDrawing = false;
      this.pendingDraw = false;
      this.devicePixelRatio = window.devicePixelRatio || 1;
    }

    

    onAdd() {
      this.canvas = document.createElement('canvas');
      this.canvas.style.position = 'absolute';
      this.canvas.style.pointerEvents = 'auto';
      // ✅ Set a low z-index so logs stay below polygons (which are usually z-index > 100)
      this.canvas.style.zIndex = '1'; 
      
      this.ctx = this.canvas.getContext('2d', { 
        alpha: true,
        desynchronized: true,
      });

      this.boundHandleClick = this.handleClick.bind(this);
      this.boundHandleMouseMove = this.handleMouseMove.bind(this);
      this.boundHandleMouseOut = this.handleMouseOut.bind(this);

      this.canvas.addEventListener('click', this.boundHandleClick);
      this.canvas.addEventListener('mousemove', this.boundHandleMouseMove);
      this.canvas.addEventListener('mouseout', this.boundHandleMouseOut);

      const panes = this.getPanes();
      
      // ✅ CHANGE: Attach to overlayLayer instead of overlayMouseTarget
      // This places the canvas in the same pane as Polygons, allowing Polygons (z-index 5000) 
      // to render ON TOP of the logs (z-index 1).
      if (panes?.overlayLayer) {
        panes.overlayLayer.appendChild(this.canvas);
      }
    }

    onRemove() {
      if (this.canvas) {
        this.canvas.removeEventListener('click', this.boundHandleClick);
        this.canvas.removeEventListener('mousemove', this.boundHandleMouseMove);
        this.canvas.removeEventListener('mouseout', this.boundHandleMouseOut);
        this.canvas.parentNode?.removeChild(this.canvas);
        this.canvas = null;
        this.ctx = null;
      }
    }

    draw() {
      if (!this.canvas || !this.ctx) return;

      if (this.isDrawing) {
        this.pendingDraw = true;
        return;
      }

      this.isDrawing = true;

      const overlayProjection = this.getProjection();
      if (!overlayProjection) {
        this.isDrawing = false;
        return;
      }

      const map = this.getMap();
      if (!map) {
        this.isDrawing = false;
        return;
      }

      const bounds = map.getBounds();
      if (!bounds) {
        this.isDrawing = false;
        return;
      }

      const ne = bounds.getNorthEast();
      const sw = bounds.getSouthWest();

      const nePixel = overlayProjection.fromLatLngToDivPixel(ne);
      const swPixel = overlayProjection.fromLatLngToDivPixel(sw);

      if (!nePixel || !swPixel) {
        this.isDrawing = false;
        return;
      }

      const width = Math.abs(nePixel.x - swPixel.x);
      const height = Math.abs(nePixel.y - swPixel.y);

      if (width <= 0 || height <= 0) {
        this.isDrawing = false;
        return;
      }

      this.canvas.width = width * this.devicePixelRatio;
      this.canvas.height = height * this.devicePixelRatio;
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
      this.canvas.style.left = `${swPixel.x}px`;
      this.canvas.style.top = `${nePixel.y}px`;

      this.ctx.setTransform(this.devicePixelRatio, 0, 0, this.devicePixelRatio, 0, 0);
      this.ctx.clearRect(0, 0, width, height);

      this.pixelData = [];

      const padding = 0.01;
      const visibleBounds = {
        north: ne.lat() + padding,
        south: sw.lat() - padding,
        east: ne.lng() + padding,
        west: sw.lng() - padding,
      };

      const visibleLocations = [];
      const selectedLocations = [];

      for (let i = 0; i < this.locations.length; i++) {
        const loc = this.locations[i];
        
        if (
          loc.lat < visibleBounds.south ||
          loc.lat > visibleBounds.north ||
          loc.lng < visibleBounds.west ||
          loc.lng > visibleBounds.east
        ) {
          continue;
        }

        if (i === this.selectedIndex || i === this.hoveredIndex) {
          selectedLocations.push({ loc, index: i });
        } else {
          visibleLocations.push({ loc, index: i });
        }
      }

      this.drawPoints(visibleLocations, overlayProjection, swPixel, nePixel, false);
      this.drawPoints(selectedLocations, overlayProjection, swPixel, nePixel, true);

      this.isDrawing = false;

      if (this.pendingDraw) {
        this.pendingDraw = false;
        requestAnimationFrame(() => this.draw());
      }
    }

    drawPoints(points, projection, swPixel, nePixel, isHighlighted = false) {
      if (!points.length) return;

      const ctx = this.ctx;
      const radius = this.radius;
      const opacity = this.opacity;

      const colorBatches = new Map();

      for (const { loc, index } of points) {
        const latLng = new window.google.maps.LatLng(loc.lat, loc.lng);
        const pixel = projection.fromLatLngToDivPixel(latLng);
        
        if (!pixel) continue;

        const x = pixel.x - swPixel.x;
        const y = pixel.y - nePixel.y;

        const color = this.getColor(loc, index);
        
        if (!colorBatches.has(color)) {
          colorBatches.set(color, []);
        }
        
        colorBatches.get(color).push({ x, y, index, loc });

        this.pixelData.push({ 
          x, 
          y, 
          index, 
          radius: isHighlighted ? radius + 2 : radius 
        });
      }

      for (const [color, batch] of colorBatches) {
        ctx.beginPath();
        ctx.fillStyle = this.hexToRgba(color, opacity);
        ctx.strokeStyle = isHighlighted 
          ? '#1E40AF' 
          : this.hexToRgba(color, Math.min(opacity + 0.2, 1));
        ctx.lineWidth = isHighlighted ? 2 : 1;

        for (const { x, y, index } of batch) {
          const r = (index === this.selectedIndex || index === this.hoveredIndex) 
            ? radius + 3 
            : radius;
          
          ctx.moveTo(x + r, y);
          ctx.arc(x, y, r, 0, Math.PI * 2);
        }

        ctx.fill();
        ctx.stroke();
      }
    }

    hexToRgba(hex, alpha) {
      if (!hex) return `rgba(128, 128, 128, ${alpha})`;
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      if (result) {
        return `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${alpha})`;
      }
      return hex;
    }

    findPointAtPixel(x, y) {
      for (let i = this.pixelData.length - 1; i >= 0; i--) {
        const point = this.pixelData[i];
        const dx = x - point.x;
        const dy = y - point.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance <= point.radius + 2) {
          return point.index;
        }
      }
      return -1;
    }

    handleClick(event) {
      const rect = this.canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      
      const index = this.findPointAtPixel(x, y);
      
      if (index >= 0 && this.onClick) {
        this.onClick(index, this.locations[index]);
      }
    }

    handleMouseMove(event) {
      const rect = this.canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      
      const index = this.findPointAtPixel(x, y);
      
      if (index !== this.hoveredIndex) {
        const previousHovered = this.hoveredIndex;
        this.hoveredIndex = index;
        
        this.canvas.style.cursor = index >= 0 ? 'pointer' : 'default';
        
        if (this.onHover) {
          this.onHover(
            index >= 0 ? index : null, 
            index >= 0 ? this.locations[index] : null
          );
        }
        
        if (previousHovered !== index) {
          this.draw();
        }
      }
    }

    handleMouseOut() {
      if (this.hoveredIndex >= 0) {
        this.hoveredIndex = -1;
        this.canvas.style.cursor = 'default';
        
        if (this.onHover) {
          this.onHover(null, null);
        }
        
        this.draw();
      }
    }

    setLocations(locations) {
      this.locations = locations || [];
      this.draw();
    }

    setGetColor(getColor) {
      this.getColor = getColor;
      this.draw();
    }

    setRadius(radius) {
      this.radius = radius;
      this.draw();
    }

    setOpacity(opacity) {
      this.opacity = opacity;
      this.draw();
    }

    setSelectedIndex(index) {
      if (this.selectedIndex !== index) {
        this.selectedIndex = index;
        this.draw();
      }
    }
  };
};

/**
 * React component wrapper for CanvasOverlayView
 */
const CanvasOverlay = ({
  map,
  locations = [],
  getColor,
  radius = 8,
  opacity = 0.8,
  selectedIndex = -1,
  onClick,
  onHover,
}) => {
  const overlayRef = useRef(null);
  const [OverlayClass, setOverlayClass] = useState(null);

  // Create the class once Google Maps is available
  useEffect(() => {
    if (window.google?.maps?.OverlayView && !OverlayClass) {
      const cls = createCanvasOverlayClass();
      setOverlayClass(() => cls);
    }
  }, [map, OverlayClass]);

  // Initialize overlay
  useEffect(() => {
    if (!map || !OverlayClass) return;

    const overlay = new OverlayClass({
      locations,
      getColor,
      radius,
      opacity,
      selectedIndex,
      onClick,
      onHover,
    });

    overlay.setMap(map);
    overlayRef.current = overlay;

    return () => {
      if (overlayRef.current) {
        overlayRef.current.setMap(null);
        overlayRef.current = null;
      }
    };
  }, [map, OverlayClass]);

  // Update locations
  useEffect(() => {
    if (overlayRef.current) {
      overlayRef.current.setLocations(locations);
    }
  }, [locations]);

  // Update getColor function
  useEffect(() => {
    if (overlayRef.current && getColor) {
      overlayRef.current.setGetColor(getColor);
    }
  }, [getColor]);

  // Update radius
  useEffect(() => {
    if (overlayRef.current) {
      overlayRef.current.setRadius(radius);
    }
  }, [radius]);

  
  useEffect(() => {
    if (overlayRef.current) {
      overlayRef.current.setOpacity(opacity);
    }
  }, [opacity]);

  
  useEffect(() => {
    if (overlayRef.current) {
      overlayRef.current.setSelectedIndex(selectedIndex);
    }
  }, [selectedIndex]);

  return null;
};

export default CanvasOverlay;