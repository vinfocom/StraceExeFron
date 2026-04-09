// src/components/map/CanvasGridOverlay.jsx
import React, { useEffect, useRef, useState } from 'react';

/**
 * Creates the CanvasGridOverlayView class after Google Maps API is loaded
 */
const createCanvasGridOverlayClass = () => {
  if (!window.google?.maps?.OverlayView) {
    return null;
  }

  return class CanvasGridOverlayView extends window.google.maps.OverlayView {
    constructor(options = {}) {
      super();
      this.canvas = null;
      this.ctx = null;
      this.gridCells = options.gridCells || [];
      this.getColor = options.getColor || (() => '#3B82F6');
      this.opacity = options.opacity || 0.6;
      this.onClick = options.onClick || null;
      this.onHover = options.onHover || null;
      this.selectedCellId = options.selectedCellId ?? null;
      this.hoveredCellId = null;
      this.cellPixelData = [];
      this.isDrawing = false;
      this.pendingDraw = false;
      this.devicePixelRatio = window.devicePixelRatio || 1;
      this.showEmptyCells = options.showEmptyCells ?? true;
    }

    onAdd() {
      this.canvas = document.createElement('canvas');
      this.canvas.style.position = 'absolute';
      this.canvas.style.pointerEvents = 'auto';
      this.ctx = this.canvas.getContext('2d', { alpha: true });

      this.boundHandleClick = this.handleClick.bind(this);
      this.boundHandleMouseMove = this.handleMouseMove.bind(this);
      this.boundHandleMouseOut = this.handleMouseOut.bind(this);

      this.canvas.addEventListener('click', this.boundHandleClick);
      this.canvas.addEventListener('mousemove', this.boundHandleMouseMove);
      this.canvas.addEventListener('mouseout', this.boundHandleMouseOut);

      const panes = this.getPanes();
      if (panes?.overlayMouseTarget) {
        panes.overlayMouseTarget.appendChild(this.canvas);
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

      this.cellPixelData = [];

      const visibleBounds = {
        north: ne.lat(),
        south: sw.lat(),
        east: ne.lng(),
        west: sw.lng(),
      };

      const visibleCells = this.gridCells.filter(cell => {
        if (!this.showEmptyCells && cell.count === 0) return false;
        
        return !(
          cell.bounds.west > visibleBounds.east ||
          cell.bounds.east < visibleBounds.west ||
          cell.bounds.south > visibleBounds.north ||
          cell.bounds.north < visibleBounds.south
        );
      });

      for (const cell of visibleCells) {
        this.drawCell(cell, overlayProjection, swPixel, nePixel);
      }

      this.isDrawing = false;

      if (this.pendingDraw) {
        this.pendingDraw = false;
        requestAnimationFrame(() => this.draw());
      }
    }

    drawCell(cell, projection, swPixel, nePixel) {
      const ctx = this.ctx;
      
      const nwLatLng = new window.google.maps.LatLng(cell.bounds.north, cell.bounds.west);
      const seLatLng = new window.google.maps.LatLng(cell.bounds.south, cell.bounds.east);
      
      const nwPixel = projection.fromLatLngToDivPixel(nwLatLng);
      const sePixel = projection.fromLatLngToDivPixel(seLatLng);

      if (!nwPixel || !sePixel) return;

      const x = nwPixel.x - swPixel.x;
      const y = nwPixel.y - nePixel.y;
      const w = sePixel.x - nwPixel.x;
      const h = sePixel.y - nwPixel.y;

      const isEmpty = cell.count === 0;
      const isSelected = cell.id === this.selectedCellId;
      const isHovered = cell.id === this.hoveredCellId;

      const color = isEmpty ? '#F9FAFB' : this.getColor(cell);
      const fillOpacity = isEmpty 
        ? 0.3 
        : (isHovered ? Math.min(this.opacity + 0.2, 1) : this.opacity);

      ctx.fillStyle = this.hexToRgba(color, fillOpacity);
      ctx.fillRect(x, y, w, h);

      ctx.strokeStyle = isSelected 
        ? '#1E40AF' 
        : isHovered 
          ? '#3B82F6' 
          : isEmpty 
            ? '#E5E7EB' 
            : '#6B7280';
      ctx.lineWidth = isSelected ? 2 : isHovered ? 1.5 : 0.5;
      ctx.strokeRect(x, y, w, h);

      this.cellPixelData.push({
        id: cell.id,
        x,
        y,
        w,
        h,
        cell,
      });
    }

    hexToRgba(hex, alpha) {
      if (!hex) return `rgba(128, 128, 128, ${alpha})`;
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      if (result) {
        return `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${alpha})`;
      }
      return hex;
    }

    findCellAtPixel(px, py) {
      for (let i = this.cellPixelData.length - 1; i >= 0; i--) {
        const { x, y, w, h, cell } = this.cellPixelData[i];
        if (px >= x && px <= x + w && py >= y && py <= y + h) {
          return cell;
        }
      }
      return null;
    }

    handleClick(event) {
      const rect = this.canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      
      const cell = this.findCellAtPixel(x, y);
      
      if (cell && this.onClick) {
        this.onClick(cell);
      }
    }

    handleMouseMove(event) {
      const rect = this.canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      
      const cell = this.findCellAtPixel(x, y);
      const cellId = cell?.id ?? null;
      
      if (cellId !== this.hoveredCellId) {
        this.hoveredCellId = cellId;
        this.canvas.style.cursor = cell ? 'pointer' : 'default';
        
        if (this.onHover) {
          this.onHover(cell);
        }
        
        this.draw();
      }
    }

    handleMouseOut() {
      if (this.hoveredCellId !== null) {
        this.hoveredCellId = null;
        this.canvas.style.cursor = 'default';
        
        if (this.onHover) {
          this.onHover(null);
        }
        
        this.draw();
      }
    }

    setGridCells(gridCells) {
      this.gridCells = gridCells || [];
      this.draw();
    }

    setGetColor(getColor) {
      this.getColor = getColor;
      this.draw();
    }

    setOpacity(opacity) {
      this.opacity = opacity;
      this.draw();
    }

    setSelectedCellId(id) {
      if (this.selectedCellId !== id) {
        this.selectedCellId = id;
        this.draw();
      }
    }

    setShowEmptyCells(show) {
      if (this.showEmptyCells !== show) {
        this.showEmptyCells = show;
        this.draw();
      }
    }
  };
};

/**
 * React component wrapper for CanvasGridOverlayView
 */
const CanvasGridOverlay = ({
  map,
  gridCells = [],
  getColor,
  opacity = 0.6,
  selectedCellId = null,
  showEmptyCells = true,
  onClick,
  onHover,
}) => {
  const overlayRef = useRef(null);
  const [OverlayClass, setOverlayClass] = useState(null);

  // Create the class once Google Maps is available
  useEffect(() => {
    if (window.google?.maps?.OverlayView && !OverlayClass) {
      const cls = createCanvasGridOverlayClass();
      setOverlayClass(() => cls);
    }
  }, [map, OverlayClass]);

  // Initialize overlay
  useEffect(() => {
    if (!map || !OverlayClass) return;

    const overlay = new OverlayClass({
      gridCells,
      getColor,
      opacity,
      selectedCellId,
      showEmptyCells,
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

  // Update grid cells
  useEffect(() => {
    if (overlayRef.current) {
      overlayRef.current.setGridCells(gridCells);
    }
  }, [gridCells]);

  // Update getColor
  useEffect(() => {
    if (overlayRef.current && getColor) {
      overlayRef.current.setGetColor(getColor);
    }
  }, [getColor]);

  // Update opacity
  useEffect(() => {
    if (overlayRef.current) {
      overlayRef.current.setOpacity(opacity);
    }
  }, [opacity]);

  // Update selected cell
  useEffect(() => {
    if (overlayRef.current) {
      overlayRef.current.setSelectedCellId(selectedCellId);
    }
  }, [selectedCellId]);

  // Update show empty cells
  useEffect(() => {
    if (overlayRef.current) {
      overlayRef.current.setShowEmptyCells(showEmptyCells);
    }
  }, [showEmptyCells]);

  return null;
};

export default CanvasGridOverlay;