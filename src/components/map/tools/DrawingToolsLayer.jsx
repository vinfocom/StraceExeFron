import React, { useEffect, useRef, useCallback, useState, memo } from "react";
import { toast } from "react-toastify";
import { createAdvancedMarker, getAdvancedMarkerLatLngEvent, isSatelliteMapType, orientAdvancedMarkerLabel, refreshAdvancedMarkerLabelTheme, setAdvancedMarkerLabel } from "@/lib/advancedMarkers";

// --- Helper Functions (Same as before, collapsed for brevity) ---
function toLatLng(item) {
  const lat = Number(item.lat ?? item.latitude ?? item.start_lat ?? item.Latitude ?? item.LAT);
  const lng = Number(item.lng ?? item.lon ?? item.longitude ?? item.start_lon ?? item.LNG);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return new window.google.maps.LatLng(lat, lng);
}

const MAX_ROUTE_BUFFER_POINTS = 220;
const MAX_ROUTE_BUFFER_CELLS = 90000;
const MAX_ROUTE_EXTERIOR_CELLS = 300000;

function simplifyClosedGridPath(points, maxPoints, initialTolerance = 0.5) {
  if (!Array.isArray(points) || points.length <= 3) return points || [];

  const distanceToSegment = (point, start, end) => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);
    const ratio = Math.max(
      0,
      Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared),
    );
    return Math.hypot(
      point.x - (start.x + ratio * dx),
      point.y - (start.y + ratio * dy),
    );
  };

  const simplifyOpen = (line, tolerance) => {
    if (line.length <= 2) return line;
    const keep = new Set([0, line.length - 1]);
    const stack = [[0, line.length - 1]];
    while (stack.length) {
      const [startIndex, endIndex] = stack.pop();
      let farthestIndex = -1;
      let farthestDistance = tolerance;
      for (let index = startIndex + 1; index < endIndex; index += 1) {
        const distance = distanceToSegment(
          line[index],
          line[startIndex],
          line[endIndex],
        );
        if (distance > farthestDistance) {
          farthestDistance = distance;
          farthestIndex = index;
        }
      }
      if (farthestIndex !== -1) {
        keep.add(farthestIndex);
        stack.push([startIndex, farthestIndex], [farthestIndex, endIndex]);
      }
    }
    return [...keep].sort((a, b) => a - b).map((index) => line[index]);
  };

  let splitIndex = 1;
  let farthestDistance = -1;
  for (let index = 1; index < points.length; index += 1) {
    const distance =
      (points[index].x - points[0].x) ** 2 +
      (points[index].y - points[0].y) ** 2;
    if (distance > farthestDistance) {
      farthestDistance = distance;
      splitIndex = index;
    }
  }

  const simplifyAtTolerance = (tolerance) => {
    const firstHalf = simplifyOpen(points.slice(0, splitIndex + 1), tolerance);
    const secondHalf = simplifyOpen(
      [...points.slice(splitIndex), points[0]],
      tolerance,
    );
    return [...firstHalf.slice(0, -1), ...secondHalf.slice(0, -1)];
  };

  let tolerance = initialTolerance;
  let simplified = simplifyAtTolerance(tolerance);
  while (simplified.length > maxPoints) {
    tolerance *= 1.5;
    simplified = simplifyAtTolerance(tolerance);
  }
  return simplified.length >= 3 ? simplified : points.slice(0, 3);
}

function getLogRouteOrder(log, fallbackIndex) {
  const raw =
    log?.timestamp ??
    log?.Timestamp ??
    log?.time_stamp ??
    log?.timeStamp ??
    log?.log_time ??
    log?.logTime ??
    log?.created_at ??
    log?.createdAt ??
    log?.id ??
    log?.Id ??
    log?.log_id ??
    log?.LogId ??
    fallbackIndex;

  if (raw instanceof Date) {
    const time = raw.getTime();
    return Number.isFinite(time) ? time : fallbackIndex;
  }

  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : fallbackIndex;
  }

  const numeric = Number(raw);
  if (Number.isFinite(numeric)) return numeric;

  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : fallbackIndex;
}

function sortLogsByRouteOrder(logs) {
  return (logs || [])
    .map((log, index) => ({ log, index, order: getLogRouteOrder(log, index) }))
    .sort((a, b) => (a.order === b.order ? a.index - b.index : a.order - b.order))
    .map((item) => item.log);
}

function getRouteLogPoints(logs, offsetMeters = 50, maxPoints = MAX_ROUTE_BUFFER_POINTS) {
  const gm = window.google.maps;
  if (!gm?.geometry?.spherical || !Array.isArray(logs)) return [];

  const minPointSpacingMeters = Math.max(1, Math.min(20, Number(offsetMeters) / 4 || 10));
  const points = [];
  sortLogsByRouteOrder(logs).forEach((log) => {
    const point = toLatLng(log);
    if (!point) return;
    const previous = points[points.length - 1];
    if (
      previous &&
      gm.geometry.spherical.computeDistanceBetween(previous, point) < minPointSpacingMeters
    ) {
      return;
    }
    points.push(point);
  });

  return simplifyRoutePoints(points, maxPoints);
}

function simplifyRoutePoints(points, maxPoints, toleranceMeters = 12) {
  if (!Array.isArray(points) || points.length <= maxPoints) return points;

  const gm = window.google.maps;
  if (!gm?.geometry?.spherical) {
    const keep = new Set([0, points.length - 1]);
    const step = (points.length - 1) / (maxPoints - 1);
    for (let i = 1; i < maxPoints - 1; i++) {
      keep.add(Math.round(i * step));
    }
    return [...keep]
      .sort((a, b) => a - b)
      .map((index) => points[index])
      .filter(Boolean);
  }

  const preservedIndexes = new Set([0, points.length - 1]);
  const stack = [[0, points.length - 1]];
  const distanceToSegment = (point, start, end) => {
    const segmentLength = gm.geometry.spherical.computeDistanceBetween(start, end);
    if (!Number.isFinite(segmentLength) || segmentLength < 1) {
      return gm.geometry.spherical.computeDistanceBetween(point, start);
    }

    const startToPoint = gm.geometry.spherical.computeDistanceBetween(start, point);
    const headingSegment = gm.geometry.spherical.computeHeading(start, end);
    const headingPoint = gm.geometry.spherical.computeHeading(start, point);
    const angle = ((headingPoint - headingSegment) * Math.PI) / 180;
    const projected = Math.max(0, Math.min(segmentLength, startToPoint * Math.cos(angle)));
    const crossTrack = Math.abs(startToPoint * Math.sin(angle));

    if (projected <= 0) return gm.geometry.spherical.computeDistanceBetween(point, start);
    if (projected >= segmentLength) return gm.geometry.spherical.computeDistanceBetween(point, end);
    return crossTrack;
  };

  while (stack.length && preservedIndexes.size < maxPoints) {
    const [startIndex, endIndex] = stack.pop();
    let maxDistance = 0;
    let maxIndex = -1;

    for (let i = startIndex + 1; i < endIndex; i++) {
      const distance = distanceToSegment(points[i], points[startIndex], points[endIndex]);
      if (distance > maxDistance) {
        maxDistance = distance;
        maxIndex = i;
      }
    }

    if (maxIndex > -1 && maxDistance >= toleranceMeters) {
      preservedIndexes.add(maxIndex);
      stack.push([startIndex, maxIndex], [maxIndex, endIndex]);
    }
  }

  if (preservedIndexes.size < maxPoints) {
    const step = (points.length - 1) / (maxPoints - 1);
    for (let i = 1; i < maxPoints - 1 && preservedIndexes.size < maxPoints; i++) {
      preservedIndexes.add(Math.round(i * step));
    }
  }

  return [...preservedIndexes]
    .sort((a, b) => a - b)
    .map((index) => points[index])
    .filter(Boolean);
}

function createRouteOffsetPolygonPath(routePoints, offsetMeters) {
  const gm = window.google.maps;
  const offset = Math.max(1, Number(offsetMeters) || 1);
  if (!gm?.geometry?.spherical || !Array.isArray(routePoints) || routePoints.length < 2) {
    return [];
  }

  const { computeHeading, computeOffset, computeDistanceBetween } = gm.geometry.spherical;
  const leftPath = [];
  const rightPath = [];

  routePoints.forEach((point, index) => {
    let from = routePoints[Math.max(0, index - 1)];
    let to = routePoints[Math.min(routePoints.length - 1, index + 1)];

    if (index === 0) {
      from = point;
      to = routePoints[1];
    } else if (index === routePoints.length - 1) {
      from = routePoints[index - 1];
      to = point;
    }

    if (!from || !to || computeDistanceBetween(from, to) < 0.25) return;

    const heading = computeHeading(from, to);
    leftPath.push(computeOffset(point, offset, heading - 90));
    rightPath.push(computeOffset(point, offset, heading + 90));
  });

  if (leftPath.length < 2 || rightPath.length < 2) return [];
  return [...leftPath, ...rightPath.reverse()];
}

function getHeadingDelta(a, b) {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function splitRouteIntoLegs(routePoints, offsetMeters) {
  const gm = window.google.maps;
  if (!gm?.geometry?.spherical || !Array.isArray(routePoints) || routePoints.length < 4) {
    return [routePoints];
  }

  const { computeDistanceBetween, computeHeading } = gm.geometry.spherical;
  const retraceDistanceMeters = Math.max(30, Math.min(120, Number(offsetMeters) * 2 || 60));
  const minRouteDistanceBeforeSplit = Math.max(120, Number(offsetMeters) * 6 || 300);
  const minPointsPerLeg = 3;
  const legs = [];
  let legStart = 0;
  let distanceSinceLegStart = 0;
  let previousHeading = null;

  for (let i = 1; i < routePoints.length; i++) {
    const prev = routePoints[i - 1];
    const current = routePoints[i];
    const stepDistance = computeDistanceBetween(prev, current);
    if (!Number.isFinite(stepDistance) || stepDistance < 0.25) continue;

    distanceSinceLegStart += stepDistance;
    const currentHeading = computeHeading(prev, current);
    let shouldSplit = false;

    if (
      previousHeading !== null &&
      i - legStart >= minPointsPerLeg &&
      routePoints.length - i >= minPointsPerLeg &&
      distanceSinceLegStart >= minRouteDistanceBeforeSplit &&
      getHeadingDelta(previousHeading, currentHeading) >= 150
    ) {
      shouldSplit = true;
    }

    if (!shouldSplit && i - legStart >= minPointsPerLeg && routePoints.length - i >= minPointsPerLeg) {
      for (let j = legStart; j < i - minPointsPerLeg; j++) {
        const routeDistanceGap = i - j;
        if (routeDistanceGap < minPointsPerLeg * 2) continue;
        const retraceDistance = computeDistanceBetween(current, routePoints[j]);
        if (
          Number.isFinite(retraceDistance) &&
          retraceDistance <= retraceDistanceMeters &&
          distanceSinceLegStart >= minRouteDistanceBeforeSplit
        ) {
          shouldSplit = true;
          break;
        }
      }
    }

    if (shouldSplit) {
      const leg = routePoints.slice(legStart, i);
      if (leg.length >= minPointsPerLeg) legs.push(leg);
      legStart = i - 1;
      distanceSinceLegStart = 0;
      previousHeading = null;
      continue;
    }

    previousHeading = currentHeading;
  }

  const lastLeg = routePoints.slice(legStart);
  if (lastLeg.length >= 2) legs.push(lastLeg);
  return legs.length ? legs : [routePoints];
}

function getRouteLegHeading(points) {
  const gm = window.google.maps;
  if (!gm?.geometry?.spherical || !Array.isArray(points) || points.length < 2) return null;
  for (let i = 1; i < points.length; i++) {
    if (gm.geometry.spherical.computeDistanceBetween(points[0], points[i]) > 1) {
      return gm.geometry.spherical.computeHeading(points[0], points[i]);
    }
  }
  return null;
}

function getRouteLength(points) {
  const gm = window.google.maps;
  if (!gm?.geometry?.spherical || !Array.isArray(points) || points.length < 2) return 0;
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    length += gm.geometry.spherical.computeDistanceBetween(points[i - 1], points[i]);
  }
  return length;
}

function getLocalRouteHeading(points, index) {
  const gm = window.google.maps;
  if (!gm?.geometry?.spherical || !Array.isArray(points) || points.length < 2) return null;

  const point = points[index];
  let from = points[Math.max(0, index - 1)];
  let to = points[Math.min(points.length - 1, index + 1)];
  if (index === 0) {
    from = point;
    to = points[1];
  } else if (index === points.length - 1) {
    from = points[index - 1];
    to = point;
  }
  if (!from || !to || gm.geometry.spherical.computeDistanceBetween(from, to) < 0.25) {
    return null;
  }
  return gm.geometry.spherical.computeHeading(from, to);
}

function projectLateralFromReference(point, referencePoint, referenceHeading) {
  const gm = window.google.maps;
  const distance = gm.geometry.spherical.computeDistanceBetween(referencePoint, point);
  const heading = gm.geometry.spherical.computeHeading(referencePoint, point);
  const delta = ((heading - referenceHeading) * Math.PI) / 180;
  return distance * Math.sin(delta);
}

function createRouteEnvelopePolygonPath(routeLegs, offsetMeters) {
  const gm = window.google.maps;
  const offset = Math.max(1, Number(offsetMeters) || 1);
  const legs = (routeLegs || []).filter((leg) => Array.isArray(leg) && leg.length >= 2);
  if (!gm?.geometry?.spherical || !legs.length) return [];

  const { computeHeading, computeOffset, computeDistanceBetween } = gm.geometry.spherical;
  const reference = legs.reduce(
    (best, leg) => (getRouteLength(leg) > getRouteLength(best) ? leg : best),
    legs[0],
  );
  const referenceHeading = getRouteLegHeading(reference);
  if (referenceHeading === null) return [];

  const alignedLegs = legs.map((leg) => {
    const legHeading = getRouteLegHeading(leg);
    if (legHeading !== null && getHeadingDelta(referenceHeading, legHeading) > 90) {
      return [...leg].reverse();
    }
    return leg;
  });

  const leftSide = [];
  const rightSide = [];
  const searchRadiusMeters = Math.max(40, Math.min(250, offset * 5));

  reference.forEach((referencePoint, referenceIndex) => {
    const localHeading = getLocalRouteHeading(reference, referenceIndex);
    if (localHeading === null) return;

    let minCandidate = null;
    let maxCandidate = null;

    alignedLegs.forEach((leg) => {
      let nearestIndex = -1;
      let nearestDistance = Infinity;
      leg.forEach((point, index) => {
        const distance = computeDistanceBetween(referencePoint, point);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      });

      if (nearestIndex < 0 || nearestDistance > searchRadiusMeters) return;
      const routePoint = leg[nearestIndex];
      const legHeading = getLocalRouteHeading(leg, nearestIndex) ?? localHeading;
      const normalizedHeading =
        getHeadingDelta(legHeading, localHeading) > 90 ? legHeading + 180 : legHeading;

      [normalizedHeading - 90, normalizedHeading + 90].forEach((sideHeading) => {
        const offsetPoint = computeOffset(routePoint, offset, sideHeading);
        const lateral = projectLateralFromReference(offsetPoint, referencePoint, localHeading);
        const candidate = { point: offsetPoint, lateral };
        if (!minCandidate || lateral < minCandidate.lateral) minCandidate = candidate;
        if (!maxCandidate || lateral > maxCandidate.lateral) maxCandidate = candidate;
      });
    });

    if (maxCandidate?.point && minCandidate?.point) {
      leftSide.push(maxCandidate.point);
      rightSide.push(minCandidate.point);
    }
  });

  if (leftSide.length < 2 || rightSide.length < 2) return [];

  return [...leftSide, ...rightSide.reverse()];
}

// Builds a sparse, bounded corridor around all selected route samples. Repeated
// drives add to the same cells. Point connections are based only on geographic
// proximity; timestamps and session ordering are deliberately ignored.
function createRasterRouteBufferPath(logs, offsetMeters) {
  const gm = window.google.maps;
  const offset = Math.max(1, Number(offsetMeters) || 1);
  if (!gm?.geometry?.spherical || !Array.isArray(logs) || logs.length < 2) return [];

  const allPoints = logs.map(toLatLng).filter(Boolean);
  if (allPoints.length < 2) return [];

  const originLat = allPoints[0].lat();
  const originLng = allPoints[0].lng();
  const metersPerLat = 111320;
  const metersPerLng = Math.max(
    1000,
    metersPerLat * Math.cos((originLat * Math.PI) / 180),
  );
  const cellSize = Math.max(3, Math.min(18, offset / 4));
  const radiusCells = Math.ceil(offset / cellSize);
  const maxLinkMeters = Math.max(80, Math.min(300, offset * 4));
  const maxLinkCells = maxLinkMeters / cellSize;
  const occupied = new Set();
  const centerlineCells = new Set();
  const spatialPoints = new Map();
  let bufferTooLarge = false;
  const keyOf = (x, y) => `${x},${y}`;
  const toGridPoint = (point) => ({
    x: ((point.lng() - originLng) * metersPerLng) / cellSize,
    y: ((point.lat() - originLat) * metersPerLat) / cellSize,
  });

  const markDisc = ({ x: pointX, y: pointY }) => {
    if (bufferTooLarge) return;
    const baseX = Math.floor(pointX);
    const baseY = Math.floor(pointY);
    for (let y = baseY - radiusCells; y <= baseY + radiusCells; y += 1) {
      for (let x = baseX - radiusCells; x <= baseX + radiusCells; x += 1) {
        const dx = x + 0.5 - pointX;
        const dy = y + 0.5 - pointY;
        if (dx * dx + dy * dy <= radiusCells * radiusCells) {
          occupied.add(keyOf(x, y));
          if (occupied.size > MAX_ROUTE_BUFFER_CELLS) {
            bufferTooLarge = true;
            return;
          }
        }
      }
    }
  };
  const addSpatialPoint = ({ x, y }) => {
    const cellX = Math.floor(x);
    const cellY = Math.floor(y);
    spatialPoints.set(keyOf(cellX, cellY), {
      x: cellX + 0.5,
      y: cellY + 0.5,
      cellX,
      cellY,
    });
  };
  const markCenterline = ({ x, y }) => {
    centerlineCells.add(keyOf(Math.floor(x), Math.floor(y)));
  };

  allPoints.forEach((point) => addSpatialPoint(toGridPoint(point)));
  if (spatialPoints.size > MAX_ROUTE_BUFFER_CELLS) return [];

  const points = [...spatialPoints.values()];
  points.forEach((point, index) => {
    point.index = index;
  });
  const parents = points.map((_, index) => index);
  const findRoot = (index) => {
    let root = index;
    while (parents[root] !== root) root = parents[root];
    while (parents[index] !== index) {
      const next = parents[index];
      parents[index] = root;
      index = next;
    }
    return root;
  };
  const unionPoints = (a, b) => {
    const rootA = findRoot(a.index);
    const rootB = findRoot(b.index);
    if (rootA !== rootB) parents[rootB] = rootA;
  };
  const bucketSize = Math.max(1, Math.ceil(maxLinkCells));
  const buckets = new Map();
  points.forEach((point) => {
    const bucketKey = keyOf(
      Math.floor(point.x / bucketSize),
      Math.floor(point.y / bucketSize),
    );
    const bucket = buckets.get(bucketKey) || [];
    bucket.push(point);
    buckets.set(bucketKey, bucket);
  });

  const markConnection = (start, end) => {
    unionPoints(start, end);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy)));
    for (let step = 0; step <= steps; step += 1) {
      const ratio = step / steps;
      markCenterline({ x: start.x + dx * ratio, y: start.y + dy * ratio });
    }
  };

  points.forEach((point) => {
    markCenterline(point);
    const bucketX = Math.floor(point.x / bucketSize);
    const bucketY = Math.floor(point.y / bucketSize);
    let nearest = null;
    let secondNearest = null;

    for (let y = bucketY - 1; y <= bucketY + 1; y += 1) {
      for (let x = bucketX - 1; x <= bucketX + 1; x += 1) {
        (buckets.get(keyOf(x, y)) || []).forEach((candidate) => {
          if (candidate === point) return;
          const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
          if (distance > maxLinkCells) return;
          const match = { candidate, distance };
          if (!nearest || distance < nearest.distance) {
            secondNearest = nearest;
            nearest = match;
          } else if (!secondNearest || distance < secondNearest.distance) {
            secondNearest = match;
          }
        });
      }
    }

    if (nearest) markConnection(point, nearest.candidate);
    if (secondNearest) markConnection(point, secondNearest.candidate);
  });

  const buildComponents = () => {
    const components = new Map();
    points.forEach((point) => {
      const root = findRoot(point.index);
      let component = components.get(root);
      if (!component) {
        component = {
          points: [],
          minX: point.x,
          maxX: point.x,
          minY: point.y,
          maxY: point.y,
        };
        components.set(root, component);
      }
      component.points.push(point);
      component.minX = Math.min(component.minX, point.x);
      component.maxX = Math.max(component.maxX, point.x);
      component.minY = Math.min(component.minY, point.y);
      component.maxY = Math.max(component.maxY, point.y);
    });
    return [...components.values()];
  };

  const boundsDistanceSquared = (a, b) => {
    const dx = Math.max(0, a.minX - b.maxX, b.minX - a.maxX);
    const dy = Math.max(0, a.minY - b.maxY, b.minY - a.maxY);
    return dx * dx + dy * dy;
  };

  // A logging gap creates separate spatial clusters. Join the two closest
  // clusters repeatedly so every log selected by the rectangle contributes to
  // one continuous route without consulting time or session order.
  let components = buildComponents();
  let componentGuard = 0;
  while (components.length > 1 && componentGuard < points.length) {
    componentGuard += 1;
    let closestComponents = null;
    let closestBoundsDistance = Infinity;
    for (let a = 0; a < components.length - 1; a += 1) {
      for (let b = a + 1; b < components.length; b += 1) {
        const distance = boundsDistanceSquared(components[a], components[b]);
        if (distance < closestBoundsDistance) {
          closestBoundsDistance = distance;
          closestComponents = [components[a], components[b]];
        }
      }
    }

    if (!closestComponents) break;
    let closestPoints = null;
    let closestPointDistance = Infinity;
    closestComponents[0].points.forEach((a) => {
      closestComponents[1].points.forEach((b) => {
        const distance = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
        if (distance < closestPointDistance) {
          closestPointDistance = distance;
          closestPoints = [a, b];
        }
      });
    });

    if (!closestPoints) break;
    markConnection(closestPoints[0], closestPoints[1]);
    components = buildComponents();
  }

  if (centerlineCells.size > MAX_ROUTE_BUFFER_CELLS) return [];
  centerlineCells.forEach((key) => {
    const [x, y] = key.split(",").map(Number);
    markDisc({ x: x + 0.5, y: y + 0.5 });
  });
  if (bufferTooLarge) return [];

  let minOccupiedX = Infinity;
  let maxOccupiedX = -Infinity;
  let minOccupiedY = Infinity;
  let maxOccupiedY = -Infinity;
  occupied.forEach((key) => {
    const [x, y] = key.split(",").map(Number);
    minOccupiedX = Math.min(minOccupiedX, x);
    maxOccupiedX = Math.max(maxOccupiedX, x);
    minOccupiedY = Math.min(minOccupiedY, y);
    maxOccupiedY = Math.max(maxOccupiedY, y);
  });

  const floodMinX = minOccupiedX - 1;
  const floodMaxX = maxOccupiedX + 1;
  const floodMinY = minOccupiedY - 1;
  const floodMaxY = maxOccupiedY + 1;
  const floodCellCount =
    (floodMaxX - floodMinX + 1) * (floodMaxY - floodMinY + 1);
  let exterior = null;
  if (floodCellCount <= MAX_ROUTE_EXTERIOR_CELLS) {
    exterior = new Set();
    const queue = [[floodMinX, floodMinY]];
    exterior.add(keyOf(floodMinX, floodMinY));
    for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
      const [x, y] = queue[queueIndex];
      [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].forEach(
        ([nextX, nextY]) => {
          if (
            nextX < floodMinX ||
            nextX > floodMaxX ||
            nextY < floodMinY ||
            nextY > floodMaxY
          ) {
            return;
          }
          const nextKey = keyOf(nextX, nextY);
          if (occupied.has(nextKey) || exterior.has(nextKey)) return;
          exterior.add(nextKey);
          queue.push([nextX, nextY]);
        },
      );
    }
  }

  const outgoing = new Map();
  const addEdge = (startX, startY, endX, endY, direction) => {
    const startKey = keyOf(startX, startY);
    const edges = outgoing.get(startKey) || [];
    edges.push({ x: endX, y: endY, direction });
    outgoing.set(startKey, edges);
  };
  const isOutside = (x, y) => {
    const key = keyOf(x, y);
    return !occupied.has(key) && (!exterior || exterior.has(key));
  };

  occupied.forEach((key) => {
    const [x, y] = key.split(",").map(Number);
    if (isOutside(x, y - 1)) addEdge(x, y, x + 1, y, 0);
    if (isOutside(x + 1, y)) addEdge(x + 1, y, x + 1, y + 1, 1);
    if (isOutside(x, y + 1)) addEdge(x + 1, y + 1, x, y + 1, 2);
    if (isOutside(x - 1, y)) addEdge(x, y + 1, x, y, 3);
  });

  const loops = [];
  while (outgoing.size) {
    const [startKey] = outgoing.keys();
    const [startX, startY] = startKey.split(",").map(Number);
    const loop = [{ x: startX, y: startY }];
    let currentKey = startKey;
    let previousDirection = null;
    let guard = 0;
    let closed = false;

    while (guard < MAX_ROUTE_BUFFER_CELLS * 4) {
      guard += 1;
      const edges = outgoing.get(currentKey);
      if (!edges?.length) break;
      let edgeIndex = edges.length - 1;
      if (previousDirection !== null && edges.length > 1) {
        const turnPriority = [0, 1, 3, 2];
        edgeIndex = edges.reduce((bestIndex, edge, index) => {
          const bestTurn =
            (edges[bestIndex].direction - previousDirection + 4) % 4;
          const nextTurn = (edge.direction - previousDirection + 4) % 4;
          return turnPriority.indexOf(nextTurn) < turnPriority.indexOf(bestTurn)
            ? index
            : bestIndex;
        }, 0);
      }
      const [next] = edges.splice(edgeIndex, 1);
      if (!edges.length) outgoing.delete(currentKey);
      previousDirection = next.direction;
      if (next.x === startX && next.y === startY) {
        closed = true;
        break;
      }
      loop.push(next);
      currentKey = keyOf(next.x, next.y);
    }
    if (closed && loop.length >= 4) loops.push(loop);
  }

  const signedArea = (loop) =>
    loop.reduce((area, point, index) => {
      const next = loop[(index + 1) % loop.length];
      return area + point.x * next.y - next.x * point.y;
    }, 0) / 2;
  const boundary = loops.sort(
    (a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)),
  )[0];
  if (!boundary?.length) return [];

  const simplifiedBoundary = simplifyClosedGridPath(
    boundary,
    MAX_ROUTE_BUFFER_POINTS,
    Math.max(0.35, 2 / cellSize),
  );
  const path = simplifiedBoundary.map(
    ({ x, y }) =>
      new gm.LatLng(
        originLat + (y * cellSize) / metersPerLat,
        originLng + (x * cellSize) / metersPerLng,
      ),
  );
  return path;
}

function normalizeMetricKey(m) {
  if (!m) return "rsrp";
  const s = String(m).toLowerCase();
  const map = {
    "dl-throughput": "dl_thpt",
    "ul-throughput": "ul_thpt",
    "lte-bler": "lte_bler"
  };
  return map[s] || s;
}

const metricKeyMap = {
  rsrp: ["rsrp", "lte_rsrp", "rsrp_dbm"],
  rsrq: ["rsrq"],
  sinr: ["sinr"],
  dl_thpt: ["dl_thpt", "dl_throughput", "download_mbps"],
  ul_thpt: ["ul_thpt", "ul_throughput", "upload_mbps"],
  mos: ["mos", "voice_mos"],
  lte_bler: ["lte_bler", "bler"],
};

function getMetricValue(log, selectedMetric) {
  const key = normalizeMetricKey(selectedMetric);
  const candidates = metricKeyMap[key] || [key];
  for (const k of candidates) {
    const v = Number(log[k]);
    if (Number.isFinite(v)) return v;
  }
  return null;
}

function computeStats(values) {
  if (!values.length) return { mean: null, median: null, max: null, min: null, count: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((acc, v) => acc + v, 0);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return {
    mean: sum / values.length,
    median,
    max: sorted[sorted.length - 1],
    min: sorted[0],
    count: values.length
  };
}

function pickColorForValue(value, selectedMetric, thresholds) {
  const key = normalizeMetricKey(selectedMetric);
  const arr = thresholds?.[key];
  if (Array.isArray(arr) && arr.length) {
    const sorted = [...arr].sort((a, b) => {
      const aMin = parseFloat(a.min ?? a.from ?? -Infinity);
      const bMin = parseFloat(b.min ?? b.from ?? -Infinity);
      return aMin - bMin;
    });
    for (let i = 0; i < sorted.length; i++) {
      const t = sorted[i];
      const min = parseFloat(t.min ?? t.from ?? -Infinity);
      const max = parseFloat(t.max ?? t.to ?? Infinity);
      const val = parseFloat(t.value);
      const isLast = i === sorted.length - 1;
      
      if (Number.isFinite(val)) {
        if (value <= val) return t.color || "#4ade80";
      } else if (value >= min && (isLast ? value <= max : value < max)) {
        return t.color || "#4ade80";
      }
    }
    
    // Fallbacks boundary
    if (value < parseFloat(sorted[0].min ?? sorted[0].from ?? -Infinity)) return sorted[0].color || "#4ade80";
    const last = sorted[sorted.length - 1];
    if (value > parseFloat(last.max ?? last.to ?? Infinity)) return last.color || "#4ade80";
  }
  return "#93c5fd";
}

function buildPolygonBounds(polygon) {
  const path = polygon.getPath()?.getArray?.() || [];
  const bounds = new window.google.maps.LatLngBounds();
  path.forEach((ll) => bounds.extend(ll));
  return bounds;
}

function filterItemsInside(type, overlay, items) {
  if (!items || !items.length) return [];
  const gm = window.google.maps;
  
  let bb = null;
  if (type === "rectangle" || type === "circle") bb = overlay.getBounds();
  else if (type === "polygon") bb = buildPolygonBounds(overlay);

  const pre = items.filter((item) => {
    const pt = toLatLng(item);
    return pt && (!bb || bb.contains(pt));
  });

  return pre.filter((item) => {
    const pt = toLatLng(item);
    if (!pt) return false;
    if (type === "rectangle") return overlay.getBounds().contains(pt);
    if (type === "polygon") return gm.geometry.poly.containsLocation(pt, overlay);
    if (type === "circle") {
      const d = gm.geometry.spherical.computeDistanceBetween(pt, overlay.getCenter());
      return Number.isFinite(d) && d <= overlay.getRadius();
    }
    return false;
  });
}

function pixelateShape(type, overlay, logs, selectedMetric, thresholds, cellSizeMeters, map, gridOverlays, colorizeCells) {
  const gm = window.google.maps;
  if (type === "polyline") return { cellsDrawn: 0, cellsWithLogs: 0, cellData: [] };
  const bounds = type === "polygon" ? buildPolygonBounds(overlay) : overlay.getBounds();
  if (!bounds) return { cellsDrawn: 0, cellsWithLogs: 0, cellData: [] };

  const metersPerDegLat = 111320;
  const centerLat = bounds.getCenter().lat();
  const metersPerDegLng = 111320 * Math.cos((centerLat * Math.PI) / 180);
  const stepLat = cellSizeMeters / metersPerDegLat;
  const stepLng = cellSizeMeters / (metersPerDegLng > 0 ? metersPerDegLng : metersPerDegLat);

  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  const south = sw.lat();
  const west = sw.lng();
  
  const rows = Math.ceil(Math.abs(ne.lat() - south) / stepLat);
  const cols = Math.ceil(Math.abs(ne.lng() - west) / stepLng);

  const preFilteredLogs = logs.map(l => ({ log: l, pt: toLatLng(l) })).filter(x => x.pt && bounds.contains(x.pt));
  
  let cellsDrawn = 0;
  let cellsWithLogs = 0;
  const cellData = [];

  for (let i = 0; i < rows; i++) {
    const lat = south + i * stepLat;
    for (let j = 0; j < cols; j++) {
      const lng = west + j * stepLng;
      const cellBounds = new gm.LatLngBounds(new gm.LatLng(lat, lng), new gm.LatLng(lat + stepLat, lng + stepLng));
      const cellCenter = cellBounds.getCenter();
      let isInside = false;

      if (type === "rectangle") isInside = overlay.getBounds().contains(cellCenter);
      else if (type === "polygon") isInside = gm.geometry.poly.containsLocation(cellCenter, overlay);
      else if (type === "circle") isInside = gm.geometry.spherical.computeDistanceBetween(cellCenter, overlay.getCenter()) <= overlay.getRadius();

      if (!isInside) continue;

      const inCell = preFilteredLogs.filter(x => cellBounds.contains(x.pt));
      let fillColor = "#808080";
      let fillOpacity = 0.1;
      let cellStats = null;

      if (inCell.length > 0) {
        cellsWithLogs++;
        const vals = inCell.map(x => getMetricValue(x.log, selectedMetric)).filter(Number.isFinite);
        if (vals.length > 0) {
          cellStats = computeStats(vals);
          fillColor = colorizeCells ? pickColorForValue(cellStats.mean, selectedMetric, thresholds) : "#9ca3af";
          fillOpacity = 0.6;
        } else { fillOpacity = 0.3; }
      }

      const rect = new gm.Rectangle({
        map,
        bounds: cellBounds,
        strokeWeight: 0.4,
        strokeColor: "#111827",
        fillOpacity,
        fillColor,
        clickable: false,
        zIndex: 50,
      });

      gridOverlays.push(rect);
      cellsDrawn++;
      cellData.push({ row: i, col: j, bounds: { south: lat, west: lng, north: lat + stepLat, east: lng + stepLng }, center: { lat: cellCenter.lat(), lng: cellCenter.lng() }, logsCount: inCell.length, stats: cellStats, color: fillColor });
    }
  }
  return { cellsDrawn, cellsWithLogs, cellData, gridRows: rows, gridCols: cols };
}

function serializeOverlay(type, overlay) {
  if (!overlay) return null;
  if (type === "polyline") {
    const path = overlay.getPath?.()?.getArray?.()?.map(p => ({ lat: p.lat(), lng: p.lng() })) || [];
    return { type, path };
  }
  const bounds = type === "polygon" ? buildPolygonBounds(overlay) : overlay.getBounds();
  if (!bounds) return { type };
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  const boundObj = { south: sw.lat(), west: sw.lng(), north: ne.lat(), east: ne.lng() };

  if (type === "polygon") {
    const path = overlay.getPath?.()?.getArray?.()?.map(p => ({ lat: p.lat(), lng: p.lng() })) || [];
    return { type, polygon: path, bounds: boundObj };
  }
  if (type === "rectangle") return { type, rectangle: { sw: { lat: sw.lat(), lng: sw.lng() }, ne: { lat: ne.lat(), lng: ne.lng() } } };
  if (type === "circle") return { type, circle: { center: { lat: overlay.getCenter().lat(), lng: overlay.getCenter().lng() }, radius: overlay.getRadius() } };
  return { type };
}

// Screen-space angle of a segment (Web Mercator is conformal, so this is zoom-independent),
// flipped when needed so text along the line is never upside down.
function getScreenAngleDeg(a, b) {
  const mercY = (latDeg) => Math.log(Math.tan(Math.PI / 4 + (latDeg * Math.PI) / 360));
  const dx = ((b.lng() - a.lng()) * Math.PI) / 180;
  const dy = -(mercY(b.lat()) - mercY(a.lat()));
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) return 0;
  let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (deg > 90) deg -= 180;
  else if (deg < -90) deg += 180;
  return deg;
}

function getPolylineDetails(polyline) {
  const gm = window.google.maps;
  const path = polyline.getPath?.();
  if (!path) return { length: 0, center: null, angle: 0 };
  const len = gm.geometry.spherical.computeLength(path);
  const points = path.getArray();
  if (points.length < 2) return { length: 0, center: points[0], angle: 0 };

  let dist = 0;
  const targetDist = len / 2;
  let mid = points[0];
  let angle = 0;

  for (let i = 0; i < points.length - 1; i++) {
    const segLen = gm.geometry.spherical.computeDistanceBetween(points[i], points[i+1]);
    if (dist + segLen >= targetDist) {
      const fraction = (targetDist - dist) / segLen;
      mid = gm.geometry.spherical.interpolate(points[i], points[i+1], fraction);
      angle = getScreenAngleDeg(points[i], points[i+1]);
      break;
    }
    dist += segLen;
  }
  return { length: len, center: mid, angle };
}

const clampOpacity = (value, fallback = 0.35) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1, parsed));
};

// One color per tool family: blue = areas, orange = measurement lines, teal = log selection.
// Satellite imagery gets brighter, slightly thicker strokes so they stay visible.
const SHAPE_COLORS = {
  area: { light: "#2563eb", satellite: "#60a5fa" },
  line: { light: "#ea580c", satellite: "#fb923c" },
  select: { light: "#0f766e", satellite: "#2dd4bf" },
};
const DRAWING_Z_INDEX = 10000;
const getShapeColor = (kind, satellite) => SHAPE_COLORS[kind][satellite ? "satellite" : "light"];

const getShapeOptions = (type, polygonOpacity, polygonFillOpacity, satellite = false) => {
  const strokeWeight = satellite ? 3 : 2;

  if (type === "polyline") {
    return {
      clickable: true,
      editable: false,
      draggable: true,
      zIndex: DRAWING_Z_INDEX,
      strokeWeight,
      strokeColor: getShapeColor("line", satellite),
    };
  }

  return {
    clickable: true,
    editable: false,
    draggable: true,
    zIndex: DRAWING_Z_INDEX,
    strokeWeight,
    strokeColor: getShapeColor("area", satellite),
    strokeOpacity: polygonOpacity,
    fillColor: getShapeColor("area", satellite),
    fillOpacity: polygonFillOpacity,
  };
};

const fmtLength = (m) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`);
const fmtArea = (m2) =>
  m2 >= 1e6 ? `${(m2 / 1e6).toFixed(2)} km²` : m2 >= 1e4 ? `${(m2 / 1e4).toFixed(2)} ha` : `${Math.round(m2)} m²`;

const createLabelMarker = (map, position) => {
  const AdvancedMarkerElement = window.google?.maps?.marker?.AdvancedMarkerElement;
  return AdvancedMarkerElement ? new AdvancedMarkerElement({ map, position, zIndex: 1000 }) : null;
};

// Pill used for the live readout that follows the cursor while drawing.
const getLivePillStyle = (satellite) => ({
  fontSize: "12px",
  fontWeight: "600",
  padding: "3px 9px",
  borderRadius: "999px",
  color: satellite ? "#f8fafc" : "#0f172a",
  background: satellite ? "rgba(15, 23, 42, 0.85)" : "rgba(255, 255, 255, 0.95)",
  border: satellite ? "1px solid rgba(255,255,255,0.25)" : "1px solid rgba(15,23,42,0.15)",
  boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
  textShadow: "none",
});

const setLiveLabel = (marker, position, text, satellite) => {
  if (!marker) return;
  marker.position = position;
  setAdvancedMarkerLabel(marker, text, getLivePillStyle(satellite));
  orientAdvancedMarkerLabel(marker, 0, -22);
};

const getAreaMeasureInfo = (type, overlay) => {
  const gm = window.google.maps;
  const spherical = gm.geometry.spherical;
  if (type === "circle") {
    const r = overlay.getRadius?.() ?? 0;
    return { center: overlay.getCenter(), text: `r ${fmtLength(r)} · ${fmtArea(Math.PI * r * r)}` };
  }
  let points;
  if (type === "rectangle") {
    const b = overlay.getBounds?.();
    if (!b) return null;
    const ne = b.getNorthEast();
    const sw = b.getSouthWest();
    points = [sw, new gm.LatLng(ne.lat(), sw.lng()), ne, new gm.LatLng(sw.lat(), ne.lng())];
  } else {
    points = overlay.getPath?.()?.getArray?.() || [];
  }
  if (points.length < 3) return null;
  const bounds = new gm.LatLngBounds();
  points.forEach((pt) => bounds.extend(pt));
  return {
    center: bounds.getCenter(),
    text: `${fmtArea(spherical.computeArea(points))} · P ${fmtLength(spherical.computeLength([...points, points[0]]))}`,
  };
};

const createBoundsFromLatLngs = (a, b) => {
  const gm = window.google.maps;
  const bounds = new gm.LatLngBounds();
  bounds.extend(a);
  bounds.extend(b);
  return bounds;
};

const getLatLngDistance = (a, b) => {
  const gm = window.google?.maps;
  if (!a || !b) return Infinity;
  if (gm?.geometry?.spherical) {
    return gm.geometry.spherical.computeDistanceBetween(a, b);
  }
  const latDiff = Math.abs(a.lat() - b.lat());
  const lngDiff = Math.abs(a.lng() - b.lng());
  return Math.max(latDiff, lngDiff) * 111320;
};

const isDuplicateVertex = (points, nextPoint) => {
  const lastPoint = points[points.length - 1];
  return lastPoint && getLatLngDistance(lastPoint, nextPoint) < 0.5;
};

const isClosingVertex = (points, nextPoint) => {
  const firstPoint = points[0];
  return points.length >= 3 && firstPoint && getLatLngDistance(firstPoint, nextPoint) < 25;
};

const isEndingPolyline = (points, nextPoint) => {
  const lastPoint = points[points.length - 1];
  return points.length >= 2 && lastPoint && getLatLngDistance(lastPoint, nextPoint) < 25;
};

const getVertexMarkerIcon = (type, isFirst = false) => {
  const gm = window.google.maps;
  const color = type === "polyline" ? "#ea580c" : "#1d4ed8";
  return {
    path: gm.SymbolPath.CIRCLE,
    scale: isFirst ? 3.6 : 3,
    fillColor: color,
    fillOpacity: 1,
    strokeColor: "#ffffff",
    strokeOpacity: 1,
    strokeWeight: 1.2,
  };
};

const createVertexMarker = ({
  map,
  position,
  type,
  index,
  title,
  draggable = false,
  onClick,
  onDrag,
  onDragEnd,
}) => {
  const gm = window.google.maps;
  const isFirst = index === 0;
  const marker = createAdvancedMarker({
    map,
    position,
    draggable,
    icon: getVertexMarkerIcon(type, isFirst),
    title: title || "Vertex",
    zIndex: 3000 + index,
  });
  if (!marker) return null;
  marker.style.cursor = draggable ? "grab" : "pointer";
  const listeners = [];
  const listen = (eventName, callback) => {
    const handler = (event) => callback(event);
    marker.addEventListener(eventName, handler);
    listeners.push(() => marker.removeEventListener(eventName, handler));
  };

  if (onClick) {
    listen("gmp-click", (event) => onClick(getAdvancedMarkerLatLngEvent(marker, event), index));
  }
  if (onDrag) {
    listen("gmp-drag", (event) => onDrag(getAdvancedMarkerLatLngEvent(marker, event), index));
  }
  if (onDragEnd) {
    listen("gmp-dragend", (event) => onDragEnd(getAdvancedMarkerLatLngEvent(marker, event), index));
  }
  if (draggable) {
    listen("gmp-dragstart", () => { marker.style.cursor = "grabbing"; });
    listen("gmp-dragend", () => { marker.style.cursor = "grab"; });
  }

  return { marker, listeners };
};

const clearVertexMarkers = (vertexMarkers = []) => {
  vertexMarkers.forEach(({ marker, listeners = [] }) => {
    listeners.forEach((removeListener) => removeListener?.());
    if (marker) marker.map = null;
  });
};

const syncVertexMarkerPositions = (vertexMarkers = [], path) => {
  if (!path) return;
  vertexMarkers.forEach(({ marker }, index) => {
    const position = path.getAt?.(index);
    if (position && marker) marker.position = position;
  });
};

// --- Component Definition ---

function DrawingToolsLayerComponent({
  map,
  enabled,
  shapeMode,
  showDrawingControl = false,
  logs,
  sessions,
  selectedMetric,
  thresholds,
  pixelateRect = false,
  cellSizeMeters = 100,
  onSummary,
  onDrawingsChange,
  clearSignal = 0,
  colorizeCells = true,
  polygonOpacity = 0.35,
  polygonFillOpacity = null,
  logPolygonOffsetMeters = 50,
  onUIChange,
  terrainEnabled = false,
  showSegmentLabels = false,
}) {
  const [activeDraft, setActiveDraft] = useState(null);
  const [isSatellite, setIsSatellite] = useState(() => isSatelliteMapType(map?.getMapTypeId?.()));
  const activeDrawingRef = useRef(null);
  const logsRef = useRef(logs);
  const shapesRef = useRef([]);
  const collectedDrawingRef = useRef([]);
  const lastClearSignalRef = useRef(clearSignal);
  const callbacksRef = useRef({ onSummary, onDrawingsChange, onUIChange });
  const reAnalyzeShapeRef = useRef(null);
  const registerCompletedShapeRef = useRef(null);
  const finishActiveDrawingRef = useRef(null);
  const cancelActiveDrawingRef = useRef(null);
  const undoActiveDrawingRef = useRef(null);
  const isSatelliteRef = useRef(isSatellite);
  isSatelliteRef.current = isSatellite;
  const showSegmentLabelsRef = useRef(showSegmentLabels);
  showSegmentLabelsRef.current = showSegmentLabels;
  const shapeModeRef = useRef(shapeMode);
  const resolvedPolygonOpacity = clampOpacity(polygonOpacity);
  const resolvedPolygonFillOpacity =
    polygonFillOpacity === null ? resolvedPolygonOpacity : clampOpacity(polygonFillOpacity, 0);

  const requestTerrainMetrics = useCallback(async (path) => {
    const gm = window.google?.maps;
    if (!terrainEnabled || !gm?.ElevationService || !gm?.geometry?.spherical || path.length < 2) {
      return null;
    }

    const samples = Math.min(256, Math.max(path.length, path.length * 4));
    const elevationService = new gm.ElevationService();
    const results = await new Promise((resolve, reject) => {
      elevationService.getElevationAlongPath(
        { path, samples },
        (response, status) => {
          if (status === "OK" && Array.isArray(response) && response.length > 1) {
            resolve(response);
          } else {
            reject(new Error(`Elevation request failed: ${status || "unknown status"}`));
          }
        },
      );
    });

    let terrainDistance = 0;
    let elevationGain = 0;
    let elevationLoss = 0;
    let minElevation = Infinity;
    let maxElevation = -Infinity;
    let cumulativeDistance = 0;
    const elevationProfile = [];

    if (Number.isFinite(Number(results[0]?.elevation))) {
      elevationProfile.push({
        distance: 0,
        elevation: Number(results[0].elevation),
      });
    }

    for (let index = 1; index < results.length; index += 1) {
      const previous = results[index - 1];
      const current = results[index];
      const previousElevation = Number(previous?.elevation);
      const currentElevation = Number(current?.elevation);
      if (!Number.isFinite(previousElevation) || !Number.isFinite(currentElevation)) continue;

      const segmentHorizontal = gm.geometry.spherical.computeDistanceBetween(
        previous.location,
        current.location,
      );
      const elevationDelta = currentElevation - previousElevation;
      terrainDistance += Math.sqrt(
        segmentHorizontal ** 2 + elevationDelta ** 2,
      );
      cumulativeDistance += segmentHorizontal;
      elevationProfile.push({
        distance: cumulativeDistance,
        elevation: currentElevation,
      });
      if (elevationDelta > 0) elevationGain += elevationDelta;
      if (elevationDelta < 0) elevationLoss += Math.abs(elevationDelta);
      minElevation = Math.min(minElevation, previousElevation, currentElevation);
      maxElevation = Math.max(maxElevation, previousElevation, currentElevation);
    }

    if (!Number.isFinite(terrainDistance)) return null;
    return {
      terrainDistance,
      terrainLengthInKm: (terrainDistance / 1000).toFixed(3),
      elevationGain,
      elevationLoss,
      minElevation,
      maxElevation,
      samples: results.length,
      elevationProfile,
    };
  }, [terrainEnabled]);

  const applyTerrainMetrics = useCallback(async (shapeObj, entry) => {
    if (!terrainEnabled || shapeObj.type !== "polyline") return;
    const path = shapeObj.overlay?.getPath?.()?.getArray?.() || [];
    if (path.length < 2) return;

    const requestId = (shapeObj.terrainRequestId || 0) + 1;
    shapeObj.terrainRequestId = requestId;
    try {
      const metrics = await requestTerrainMetrics(path);
      if (!metrics || shapeObj.terrainRequestId !== requestId) return;
      const updatedEntry = { ...entry, ...metrics, terrainMode: true };
      const index = collectedDrawingRef.current.findIndex((drawing) => drawing.id === shapeObj.id);
      if (index < 0) return;
      collectedDrawingRef.current[index] = updatedEntry;
      callbacksRef.current.onDrawingsChange?.([...collectedDrawingRef.current]);
      callbacksRef.current.onSummary?.(updatedEntry);
      if (shapeObj.labelMarker) {
        const text = metrics.terrainDistance >= 1000
          ? `${metrics.terrainLengthInKm} km terrain`
          : `${Math.round(metrics.terrainDistance)} m terrain`;
        setAdvancedMarkerLabel(shapeObj.labelMarker, text);
      }
    } catch (error) {
      if (shapeObj.terrainRequestId === requestId) {
        console.warn("[UnifiedMap] Terrain elevation request failed:", error);
      }
    }
  }, [requestTerrainMetrics, terrainEnabled]);

  useEffect(() => {
    callbacksRef.current = { onSummary, onDrawingsChange, onUIChange };
  }, [onSummary, onDrawingsChange, onUIChange]);
  useEffect(() => {
    logsRef.current = logs;
  }, [logs]);
  useEffect(() => {
    shapeModeRef.current = shapeMode;
  }, [shapeMode]);

  const reAnalyzeShape = useCallback((shapeObj) => {
    const { type, overlay, id } = shapeObj;
    const gm = window.google.maps;
    if (shapeObj.gridOverlays?.length) {
      shapeObj.gridOverlays.forEach(rect => rect.setMap(null));
      shapeObj.gridOverlays = [];
    }

    const allLogs = shapeObj.analysisLogs || logs || [];
    const geometry = serializeOverlay(type, overlay);
    let areaInMeters = 0;
    let lengthInMeters = 0;

    if (gm.geometry?.spherical) {
      if (type === "polygon") {
        const path = overlay.getPath?.();
        if (path) areaInMeters = gm.geometry.spherical.computeArea(path);
      }
      else if (type === "rectangle") {
        const b = overlay.getBounds();
        const p = [b.getNorthEast(), new gm.LatLng(b.getNorthEast().lat(), b.getSouthWest().lng()), b.getSouthWest(), new gm.LatLng(b.getSouthWest().lat(), b.getNorthEast().lng())];
        areaInMeters = gm.geometry.spherical.computeArea(p);
      } else if (type === "circle") areaInMeters = Math.PI * Math.pow(overlay.getRadius(), 2);
      else if (type === "polyline") {
        const path = overlay.getPath?.();
        if (path) lengthInMeters = gm.geometry.spherical.computeLength(path);
      }
    }

    const insideLogs = type === "polyline" ? [] : filterItemsInside(type, overlay, allLogs);
    const validValues = insideLogs.map(l => getMetricValue(l, selectedMetric)).filter(Number.isFinite);
    const stats = computeStats(validValues);
    
    const intersectingSessions = type === "polyline" ? [] : filterItemsInside(type, overlay, sessions || []);
    const uniqueSessionsMap = new Map();
    insideLogs.forEach(l => { if (l.session_id) uniqueSessionsMap.set(l.session_id, l.session_id); });
    const uniqueSessionsFromLogs = Array.from(uniqueSessionsMap.values());

    let gridInfo = null;
    if (pixelateRect && type !== "polyline" && !shapeObj.suppressGridAnalysis) {
      const gridResult = pixelateShape(type, overlay, allLogs, selectedMetric, thresholds, cellSizeMeters, map, shapeObj.gridOverlays, colorizeCells);
      gridInfo = { cells: gridResult.cellsDrawn, cellsWithLogs: gridResult.cellsWithLogs, cellSizeMeters, totalGridArea: (cellSizeMeters ** 2) * gridResult.cellsWithLogs, gridRows: gridResult.gridRows, gridCols: gridResult.gridCols, cellData: gridResult.cellData };
    }

    const entry = {
      id, type, geometry, selectedMetric, stats, count: insideLogs.length,
      session: uniqueSessionsFromLogs, intersectingSessions, sessionCount: uniqueSessionsFromLogs.length,
      logs: insideLogs, grid: gridInfo, createdAt: shapeObj.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(),
      area: areaInMeters, areaInSqKm: (areaInMeters / 1e6).toFixed(4), length: lengthInMeters, lengthInKm: (lengthInMeters / 1000).toFixed(3),
    };

    const idx = collectedDrawingRef.current.findIndex(d => d.id === id);
    if (idx >= 0) collectedDrawingRef.current[idx] = entry;
    else collectedDrawingRef.current.push(entry);

    callbacksRef.current.onDrawingsChange?.([...collectedDrawingRef.current]);
    callbacksRef.current.onSummary?.(entry);
    void applyTerrainMetrics(shapeObj, entry);
    return entry;
  }, [logs, sessions, selectedMetric, thresholds, pixelateRect, cellSizeMeters, map, colorizeCells, applyTerrainMetrics]);
  useEffect(() => {
    reAnalyzeShapeRef.current = reAnalyzeShape;
  }, [reAnalyzeShape]);

  const cleanupActiveDrawing = useCallback((keepOverlay = false, { completeIfPossible = false } = {}) => {
    const active = activeDrawingRef.current;
    if (!active) return;

    const pointCount = active.points?.length ?? active.path?.getLength?.() ?? 0;
    const minPoints = active.type === "polygon" ? 3 : 2;

    active.listeners?.forEach((listener) =>
      window.google.maps.event.removeListener(listener),
    );
    clearVertexMarkers(active.vertexMarkers);
    if (active.liveLabel) active.liveLabel.map = null;

    if (completeIfPossible && active.overlay && pointCount >= minPoints) {
      if (active.points) active.overlay.setPath(active.points);
      active.overlay.setOptions?.({
        clickable: true,
        editable: false,
        draggable: true,
        ...(active.finalOptions || {}),
      });
      activeDrawingRef.current = null;
      setActiveDraft(null);
      registerCompletedShapeRef.current?.(active.type, active.overlay);
      return;
    }

    if (!keepOverlay) active.overlay?.setMap(null);
    activeDrawingRef.current = null;
    setActiveDraft(null);
  }, []);

  const registerCompletedShape = useCallback((type, overlay, options = {}) => {
    if (!overlay) return;

    const shapeObj = {
      id: Date.now(),
      type,
      overlay,
      gridOverlays: [],
      vertexMarkers: [],
      analysisLogs: options.analysisLogs,
      suppressVertexMarkers: options.suppressVertexMarkers === true,
      suppressGridAnalysis: options.suppressGridAnalysis === true,
      createdAt: new Date().toISOString(),
    };
    shapesRef.current.push(shapeObj);
    const isMeasurementTool = type === "polyline";
    const entry = reAnalyzeShapeRef.current?.(shapeObj);
    const listeners = [];
    // Polygons/polylines are edited through the small custom vertex dots. Google's native
    // edit handles (large white circles) are only shown for the one selected rectangle/circle.
    if (type === "rectangle" || type === "circle") {
      listeners.push(
        window.google.maps.event.addListener(overlay, "click", () => {
          shapesRef.current.forEach((s) => {
            if (s.type === "rectangle" || s.type === "circle") {
              s.overlay.setOptions?.({ editable: s === shapeObj });
            }
          });
        }),
      );
    }
    const update = () => {
      window.clearTimeout(shapeObj.analysisTimer);
      shapeObj.analysisTimer = window.setTimeout(
        () => reAnalyzeShapeRef.current?.(shapeObj),
        180,
      );
    };
    const isAreaShape = type === "polygon" || type === "rectangle" || type === "circle";
    const updateMeasureLabel = () => {
      if (!isAreaShape) return;
      const info = getAreaMeasureInfo(type, overlay);
      if (!info) return;
      shapeObj.labelMarker = shapeObj.labelMarker || createLabelMarker(map, info.center);
      if (!shapeObj.labelMarker) return;
      shapeObj.labelMarker.position = info.center;
      setAdvancedMarkerLabel(shapeObj.labelMarker, info.text, { fontSize: "13px" });
      orientAdvancedMarkerLabel(shapeObj.labelMarker, 0, 0);
    };
    // Optional per-segment lengths, only at street-level zoom so they never clutter the map.
    const rebuildSegmentLabels = () => {
      (shapeObj.segmentLabels || []).forEach((m) => { m.map = null; });
      shapeObj.segmentLabels = [];
      if (type !== "polygon" && type !== "polyline") return;
      if (!showSegmentLabelsRef.current || (map.getZoom?.() ?? 0) < 15) return;
      const pts = overlay.getPath?.()?.getArray?.() || [];
      const segCount = type === "polygon" ? pts.length : pts.length - 1;
      if (segCount < 1 || segCount > 60 || (type === "polyline" && segCount === 1)) return;
      const spherical = window.google.maps.geometry.spherical;
      for (let i = 0; i < segCount; i += 1) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        const marker = createLabelMarker(map, spherical.interpolate(a, b, 0.5));
        if (!marker) continue;
        setAdvancedMarkerLabel(marker, fmtLength(spherical.computeDistanceBetween(a, b)), {
          fontSize: "11px",
          fontWeight: "600",
        });
        orientAdvancedMarkerLabel(marker, getScreenAngleDeg(a, b), -9);
        shapeObj.segmentLabels.push(marker);
      }
    };
    shapeObj.rebuildSegmentLabels = rebuildSegmentLabels;
    const refreshLabels = () => {
      updateMeasureLabel();
      rebuildSegmentLabels();
    };
    const rebuildVertexMarkers = () => {
      if (shapeObj.suppressVertexMarkers) return;
      if (type !== "polygon" && type !== "polyline") return;

      const path = overlay.getPath?.();
      if (!path) return;

      clearVertexMarkers(shapeObj.vertexMarkers);
      shapeObj.vertexMarkers = path.getArray().map((position, index) =>
        createVertexMarker({
          map,
          position,
          type,
          index,
          title: "Drag vertex",
          draggable: true,
          onDrag: (event, markerIndex) => {
            if (!event.latLng) return;
            path.setAt(markerIndex, event.latLng);
          },
        }),
      ).filter(Boolean);
    };

    if (type === "polyline") {
      const updateDistanceLabel = () => {
        const { length, center, angle } = getPolylineDetails(overlay);
        const displayedLength = terrainEnabled && shapeObj.terrainDistance
          ? shapeObj.terrainDistance
          : length;
        const text = displayedLength >= 1000
          ? `${(displayedLength / 1000).toFixed(2)} km${terrainEnabled && shapeObj.terrainDistance ? " terrain" : ""}`
          : `${Math.round(displayedLength)} m${terrainEnabled && shapeObj.terrainDistance ? " terrain" : ""}`;
        if (!shapeObj.labelMarker) {
          const AdvancedMarkerElement = window.google?.maps?.marker?.AdvancedMarkerElement;
          shapeObj.labelMarker = AdvancedMarkerElement
            ? new AdvancedMarkerElement({ map, position: center, zIndex: 1000 })
            : null;
        } else {
          shapeObj.labelMarker.position = center;
        }
        setAdvancedMarkerLabel(shapeObj.labelMarker, text);
        orientAdvancedMarkerLabel(shapeObj.labelMarker, angle);
      };
      const path = overlay.getPath?.();
      if (path) {
        listeners.push(window.google.maps.event.addListener(path, "set_at", () => {
          updateDistanceLabel();
          syncVertexMarkerPositions(shapeObj.vertexMarkers, path);
          rebuildSegmentLabels();
          update();
        }));
        ["insert_at", "remove_at"].forEach((ev) =>
          listeners.push(window.google.maps.event.addListener(path, ev, () => {
            updateDistanceLabel();
            rebuildVertexMarkers();
            rebuildSegmentLabels();
            update();
          })),
        );
        ["drag", "dragend"].forEach((ev) =>
          listeners.push(window.google.maps.event.addListener(overlay, ev, () => {
            updateDistanceLabel();
            syncVertexMarkerPositions(shapeObj.vertexMarkers, path);
            if (ev === "dragend") rebuildSegmentLabels();
          })),
        );
        updateDistanceLabel();
        rebuildVertexMarkers();
        rebuildSegmentLabels();
      }
    } else if (type === "polygon") {
      const path = overlay.getPath?.();
      if (path) {
        listeners.push(window.google.maps.event.addListener(path, "set_at", () => {
          syncVertexMarkerPositions(shapeObj.vertexMarkers, path);
          refreshLabels();
          update();
        }));
        ["insert_at", "remove_at"].forEach((ev) =>
          listeners.push(window.google.maps.event.addListener(path, ev, () => {
            rebuildVertexMarkers();
            refreshLabels();
            update();
          })),
        );
        ["drag", "dragend"].forEach((ev) =>
          listeners.push(window.google.maps.event.addListener(overlay, ev, () => {
            syncVertexMarkerPositions(shapeObj.vertexMarkers, path);
            updateMeasureLabel();
            if (ev === "dragend") rebuildSegmentLabels();
          })),
        );
        rebuildVertexMarkers();
        refreshLabels();
      }
    } else if (type === "rectangle") {
      listeners.push(window.google.maps.event.addListener(overlay, "bounds_changed", () => {
        updateMeasureLabel();
        update();
      }));
      updateMeasureLabel();
    } else if (type === "circle") {
      ["radius_changed", "center_changed"].forEach((ev) =>
        listeners.push(window.google.maps.event.addListener(overlay, ev, () => {
          updateMeasureLabel();
          update();
        })),
      );
      updateMeasureLabel();
    }

    shapeObj.listeners = listeners;

    if (type !== "polyline") {
      const sessionMsg =
        entry?.intersectingSessions?.length > 0
          ? ` Found ${entry.intersectingSessions.length} sessions.`
          : "";
      toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} drawn.${sessionMsg}`, {
        position: "bottom-right",
        autoClose: 3000,
      });
    } else {
      toast.success("Distance measured.", { position: "bottom-right", autoClose: 2000 });
    }

    callbacksRef.current.onUIChange?.({ drawEnabled: false, shapeMode: null });
  }, [map, terrainEnabled]);

  useEffect(() => {
    if (!terrainEnabled) {
      shapesRef.current.forEach((shapeObj) => {
        if (shapeObj.type !== "polyline" || !shapeObj.labelMarker) return;
        const { length } = getPolylineDetails(shapeObj.overlay);
        setAdvancedMarkerLabel(
          shapeObj.labelMarker,
          length >= 1000 ? `${(length / 1000).toFixed(2)} km` : `${Math.round(length)} m`,
        );
      });
      return;
    }
    shapesRef.current.forEach((shapeObj) => {
      if (shapeObj.type !== "polyline") return;
      void reAnalyzeShapeRef.current?.(shapeObj);
    });
  }, [terrainEnabled]);

  useEffect(() => {
    registerCompletedShapeRef.current = registerCompletedShape;
  }, [registerCompletedShape]);

  useEffect(() => {
    if (!map || !window.google?.maps) {
      return undefined;
    }

    cleanupActiveDrawing(false);

    if (!enabled || !shapeMode) {
      return undefined;
    }

    const gm = window.google.maps;
    const type = String(shapeMode).toLowerCase();
    const listeners = [];
    const shapeOptions = getShapeOptions(
      type,
      resolvedPolygonOpacity,
      resolvedPolygonFillOpacity,
      isSatelliteRef.current,
    );

    const finishPathShape = () => {
      const active = activeDrawingRef.current;
      if (!active?.overlay) {
        return;
      }
      const points = active.points || [];
      const pointCount = points.length;
      const minPoints = active.type === "polygon" ? 3 : 2;

      if (pointCount < minPoints) {
        toast.warn(
          active.type === "polygon"
            ? "Add at least 3 points to finish the polygon."
            : "Add at least 2 points to measure distance.",
          { position: "bottom-right", autoClose: 2000 },
        );
        return;
      }

      let finalOverlay;
      if (active.type === "polygon") {
        // While drawing, the overlay is an open preview polyline (so it renders as
        // connected line segments, not a prematurely-closed shape). Build the real
        // closed polygon from the committed points on finish.
        finalOverlay = new gm.Polygon({
          map,
          paths: points,
          ...getShapeOptions(
            "polygon",
            resolvedPolygonOpacity,
            resolvedPolygonFillOpacity,
            isSatelliteRef.current,
          ),
          clickable: true,
          editable: false,
          draggable: true,
        });
        active.overlay.setMap(null);
      } else {
        finalOverlay = active.overlay;
        finalOverlay.setPath(points);
        finalOverlay.setOptions({ clickable: true, editable: false, draggable: true });
      }
      cleanupActiveDrawing(true);
      registerCompletedShape(active.type, finalOverlay);
    };

    finishActiveDrawingRef.current = finishPathShape;
    cancelActiveDrawingRef.current = () => {
      cleanupActiveDrawing();
      callbacksRef.current.onUIChange?.({ drawEnabled: false, shapeMode: null });
    };

    // Shortcuts: Esc cancels, Enter finishes, Backspace / Ctrl+Z removes the last point.
    listeners.push(
      gm.event.addDomListener(window, "keydown", (e) => {
        const tag = e.target?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target?.isContentEditable) return;
        if (e.key === "Escape") {
          cancelActiveDrawingRef.current?.();
        } else if (e.key === "Enter") {
          finishActiveDrawingRef.current?.();
        } else if (e.key === "Backspace" || e.key === "Delete" || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z")) {
          if (undoActiveDrawingRef.current) {
            e.preventDefault();
            undoActiveDrawingRef.current();
          }
        }
      }),
    );

    if (type === "log-polygon") {
      activeDrawingRef.current = { type, overlay: null, listeners };
      let startPoint = null;
      let selectionRect = null;
      let hasDragged = false;

      const resetSelection = () => {
        selectionRect?.setMap(null);
        selectionRect = null;
        startPoint = null;
        hasDragged = false;
        activeDrawingRef.current = { type, overlay: null, listeners };
      };

      const stopRouteTool = () => {
        callbacksRef.current.onUIChange?.({ drawEnabled: false, shapeMode: null });
      };

      const completeRouteSelection = () => {
        if (!selectionRect || !startPoint || !hasDragged) {
          resetSelection();
          return;
        }

        const selectionBounds = selectionRect.getBounds();
        const allLogs = logsRef.current || [];
        const selectedLogs = allLogs.filter((log) => {
          const point = toLatLng(log);
          return point && selectionBounds?.contains(point);
        });

        selectionRect.setMap(null);
        selectionRect = null;

        if (selectedLogs.length < 2) {
          toast.warn("At least two logs inside the selected area are required to create a route polygon.", {
            position: "bottom-right",
            autoClose: 2500,
          });
          resetSelection();
          stopRouteTool();
          return;
        }

        const polygonPath = createRasterRouteBufferPath(selectedLogs, logPolygonOffsetMeters);

        if (polygonPath.length < 3) {
          toast.error("Could not create a polygon around the selected route logs.", {
            position: "bottom-right",
            autoClose: 2500,
          });
          resetSelection();
          stopRouteTool();
          return;
        }

        const overlay = new gm.Polygon({
          map,
          paths: polygonPath,
          ...getShapeOptions(
            "polygon",
            resolvedPolygonOpacity,
            resolvedPolygonFillOpacity,
          ),
          clickable: true,
          editable: false,
          draggable: true,
        });

        cleanupActiveDrawing(true);
        registerCompletedShape("polygon", overlay, {
          analysisLogs: selectedLogs,
          suppressVertexMarkers: true,
          suppressGridAnalysis: true,
        });
        toast.info(
          `Route polygon created around ${selectedLogs.length} selected logs with ${Math.round(Number(logPolygonOffsetMeters) || 0)} m offset.`,
          { position: "bottom-right", autoClose: 2500 },
        );
      };

      listeners.push(
        gm.event.addListener(map, "mousedown", (event) => {
          if (!event.latLng) return;
          startPoint = event.latLng;
          hasDragged = false;
          selectionRect = new gm.Rectangle({
            map,
            bounds: createBoundsFromLatLngs(startPoint, startPoint),
            strokeWeight: 1.5,
            strokeColor: getShapeColor("select", isSatelliteRef.current),
            strokeOpacity: 0.9,
            fillColor: getShapeColor("select", isSatelliteRef.current),
            fillOpacity: 0.08,
            clickable: false,
            editable: false,
            draggable: false,
            zIndex: 450,
          });
          activeDrawingRef.current = { type, overlay: selectionRect, listeners };
        }),
      );

      listeners.push(
        gm.event.addListener(map, "mousemove", (event) => {
          if (!selectionRect || !startPoint || !event.latLng) return;
          const distance = gm.geometry?.spherical
            ? gm.geometry.spherical.computeDistanceBetween(startPoint, event.latLng)
            : 0;
          if (distance > 1) hasDragged = true;
          selectionRect.setBounds(createBoundsFromLatLngs(startPoint, event.latLng));
        }),
      );

      listeners.push(
        gm.event.addListener(map, "mouseup", () => {
          completeRouteSelection();
        }),
      );

      toast.info("Drag a selection box around the log route to create an offset route polygon.", {
        position: "bottom-right",
        autoClose: 3000,
      });
    } else if (type === "polygon" || type === "polyline") {
      const committedPoints = [];
      // Always preview with an OPEN polyline while drawing. A gm.Polygon would draw
      // its closing edge, making it look like a finished polygon after two points.
      const previewOptions =
        type === "polygon"
          ? { strokeWeight: isSatelliteRef.current ? 3 : 2, strokeColor: getShapeColor("area", isSatelliteRef.current), strokeOpacity: resolvedPolygonOpacity }
          : { strokeWeight: isSatelliteRef.current ? 3 : 2, strokeColor: getShapeColor("line", isSatelliteRef.current) };
      const overlay = new gm.Polyline({
        map,
        path: [],
        clickable: false,
        editable: false,
        draggable: false,
        zIndex: 400,
        ...previewOptions,
      });

      activeDrawingRef.current = {
        type,
        overlay,
        path: null,
        points: committedPoints,
        vertexMarkers: [],
        finalOptions: type === "polygon" ? { fillOpacity: resolvedPolygonFillOpacity } : null,
        listeners,
      };
      setActiveDraft({ type, pointCount: 0, canFinish: false, canUndo: false });

      const addDraftVertexMarker = (position, index) => {
        const markerEntry = createVertexMarker({
          map,
          position,
          type,
          index,
          title: index === 0 && type === "polygon"
            ? "Start point - click to finish polygon"
            : type === "polyline" && index > 0
              ? "End point - click to finish line"
              : "Vertex",
          onClick: (event) => {
            event?.domEvent?.preventDefault?.();
            event?.domEvent?.stopPropagation?.();
            if (type === "polygon" && index === 0 && committedPoints.length >= 3) {
              finishPathShape();
            } else if (type === "polyline" && index === committedPoints.length - 1 && committedPoints.length >= 2) {
              finishPathShape();
            }
          },
        });
        activeDrawingRef.current?.vertexMarkers?.push(markerEntry);
      };

      const minPathPoints = type === "polygon" ? 3 : 2;
      let hotIndex = -1;
      const setHotVertex = (index) => {
        if (index === hotIndex) return;
        const markers = activeDrawingRef.current?.vertexMarkers || [];
        const setScale = (i, on) => {
          const el = markers[i]?.marker?.content;
          if (!el) return;
          el.style.transition = "transform 120ms ease-out";
          el.style.transform = on ? "scale(2)" : "";
        };
        if (hotIndex >= 0) setScale(hotIndex, false);
        if (index >= 0) setScale(index, true);
        hotIndex = index;
      };

      undoActiveDrawingRef.current = () => {
        if (activeDrawingRef.current?.overlay !== overlay || committedPoints.length === 0) return;
        setHotVertex(-1);
        committedPoints.pop();
        const last = activeDrawingRef.current.vertexMarkers.pop();
        if (last) clearVertexMarkers([last]);
        overlay.setPath(committedPoints);
        if (committedPoints.length === 0 && activeDrawingRef.current.liveLabel) {
          activeDrawingRef.current.liveLabel.map = null;
          activeDrawingRef.current.liveLabel = null;
        }
        setActiveDraft({
          type,
          pointCount: committedPoints.length,
          canFinish: committedPoints.length >= minPathPoints,
          canUndo: committedPoints.length > 0,
        });
      };

      listeners.push(
        gm.event.addListener(map, "click", (event) => {
          if (!event.latLng) {
            return;
          }
          if (activeDrawingRef.current?.overlay !== overlay) {
            return;
          }
          setHotVertex(-1);
          if (type === "polygon") {
            if (isClosingVertex(committedPoints, event.latLng)) {
              finishPathShape();
              return;
            }

            if (isDuplicateVertex(committedPoints, event.latLng)) {
              return;
            }
            committedPoints.push(event.latLng);
            overlay.setPath(committedPoints);
            addDraftVertexMarker(event.latLng, committedPoints.length - 1);
          } else {
            if (isEndingPolyline(committedPoints, event.latLng)) {
              finishPathShape();
              return;
            }

            if (isDuplicateVertex(committedPoints, event.latLng)) {
              return;
            }
            committedPoints.push(event.latLng);
            overlay.setPath(committedPoints);
            addDraftVertexMarker(event.latLng, committedPoints.length - 1);
          }

          setActiveDraft({
            type,
            pointCount: committedPoints.length,
            canFinish: committedPoints.length >= minPathPoints,
            canUndo: true,
          });
        }),
      );

      listeners.push(
        gm.event.addListener(map, "mousemove", (event) => {
          if (!event.latLng || activeDrawingRef.current?.overlay !== overlay) return;
          if (committedPoints.length === 0) return;
          overlay.setPath([...committedPoints, event.latLng]);

          // Highlight the vertex that a click would close/finish on.
          const closing = type === "polygon"
            ? committedPoints.length >= 3 && isClosingVertex(committedPoints, event.latLng)
            : committedPoints.length >= 2 && isEndingPolyline(committedPoints, event.latLng);
          setHotVertex(closing ? (type === "polygon" ? 0 : committedPoints.length - 1) : -1);

          // Live readout: running total and current segment (plus area for polygons).
          const spherical = gm.geometry?.spherical;
          const active = activeDrawingRef.current;
          if (!spherical || !active) return;
          const segment = spherical.computeDistanceBetween(committedPoints[committedPoints.length - 1], event.latLng);
          const total = spherical.computeLength(committedPoints) + segment;
          let text = `${fmtLength(total)} (+${fmtLength(segment)})`;
          if (type === "polygon" && committedPoints.length >= 2) {
            text = `${fmtArea(spherical.computeArea([...committedPoints, event.latLng]))} · ${text}`;
          }
          if (closing) text = type === "polygon" ? "Click to close shape" : "Click to finish line";
          active.liveLabel = active.liveLabel || createLabelMarker(map, event.latLng);
          setLiveLabel(active.liveLabel, event.latLng, text, isSatelliteRef.current);
        }),
      );

      listeners.push(
        gm.event.addListener(map, "dblclick", (event) => {
          event?.domEvent?.preventDefault?.();
          finishPathShape();
        }),
      );

      listeners.push(
        gm.event.addListener(map, "rightclick", () => {
          finishPathShape();
        }),
      );

      toast.info(
        type === "polygon"
          ? "Click points on the map. Click the first point, double-click, Enter or right-click to finish. Backspace undoes."
          : "Click line points. Click the last point, double-click, Enter or right-click to finish. Backspace undoes.",
        { position: "bottom-right", autoClose: 2500 },
      );
    } else if (type === "rectangle" || type === "circle") {
      let startPoint = null;
      let overlay = null;
      let hasDragged = false;

      let liveLabel = null;
      const removeLiveLabel = () => {
        if (liveLabel) liveLabel.map = null;
        liveLabel = null;
      };

      const resetDragShape = () => {
        removeLiveLabel();
        overlay?.setMap(null);
        overlay = null;
        startPoint = null;
        hasDragged = false;
        activeDrawingRef.current = { type, overlay: null, listeners };
      };

      const completeDragShape = () => {
        if (!overlay || !startPoint) return;
        if (!hasDragged) {
          resetDragShape();
          return;
        }

        const completedOverlay = overlay;
        completedOverlay.setOptions({ clickable: true, editable: false, draggable: true });
        overlay = null;
        startPoint = null;
        hasDragged = false;
        cleanupActiveDrawing(true);
        registerCompletedShape(type, completedOverlay);
      };

      listeners.push(
        gm.event.addListener(map, "mousedown", (event) => {
          if (!event.latLng) return;
          startPoint = event.latLng;
          hasDragged = false;

          if (type === "rectangle") {
            overlay = new gm.Rectangle({
              map,
              bounds: createBoundsFromLatLngs(startPoint, startPoint),
              ...shapeOptions,
              clickable: false,
              editable: false,
              draggable: false,
            });
          } else {
            overlay = new gm.Circle({
              map,
              center: startPoint,
              radius: 1,
              ...shapeOptions,
              clickable: false,
              editable: false,
              draggable: false,
            });
          }

          liveLabel = createLabelMarker(map, startPoint);
          activeDrawingRef.current = { type, overlay, listeners, liveLabel };
        }),
      );

      listeners.push(
        gm.event.addListener(map, "mousemove", (event) => {
          if (!overlay || !startPoint || !event.latLng) return;

          const distance = gm.geometry?.spherical
            ? gm.geometry.spherical.computeDistanceBetween(startPoint, event.latLng)
            : 0;
          if (distance > 1) hasDragged = true;

          if (type === "rectangle") {
            const bounds = createBoundsFromLatLngs(startPoint, event.latLng);
            overlay.setBounds(bounds);
            if (gm.geometry?.spherical) {
              const ne = bounds.getNorthEast();
              const sw = bounds.getSouthWest();
              const w = gm.geometry.spherical.computeDistanceBetween(sw, new gm.LatLng(sw.lat(), ne.lng()));
              const h = gm.geometry.spherical.computeDistanceBetween(sw, new gm.LatLng(ne.lat(), sw.lng()));
              setLiveLabel(liveLabel, event.latLng, `${fmtLength(w)} × ${fmtLength(h)}`, isSatelliteRef.current);
            }
          } else {
            const radius = gm.geometry?.spherical ? distance : 1;
            overlay.setRadius(Math.max(radius, 1));
            setLiveLabel(liveLabel, event.latLng, `r ${fmtLength(radius)}`, isSatelliteRef.current);
          }
        }),
      );

      listeners.push(
        gm.event.addListener(map, "mouseup", () => {
          completeDragShape();
        }),
      );

      toast.info(
        type === "rectangle"
          ? "Drag on the map to draw a rectangle."
          : "Drag from the center to draw a circle.",
        { position: "bottom-right", autoClose: 2200 },
      );
    }

    return () => {
      finishActiveDrawingRef.current = null;
      cancelActiveDrawingRef.current = null;
      undoActiveDrawingRef.current = null;
      cleanupActiveDrawing(false);
    };
  }, [
    map,
    enabled,
    shapeMode,
    cleanupActiveDrawing,
    registerCompletedShape,
    resolvedPolygonOpacity,
    resolvedPolygonFillOpacity,
    showDrawingControl,
    logPolygonOffsetMeters,
  ]);

  useEffect(() => {
    shapesRef.current.forEach(({ type, overlay }) => {
      if (!overlay || type === "polyline") return;
      overlay.setOptions?.({
        strokeOpacity: resolvedPolygonOpacity,
        fillOpacity: resolvedPolygonOpacity,
      });
    });
  }, [resolvedPolygonOpacity]);

  // Keep map and overlay cursor in sync with active drawing mode.
  useEffect(() => {
    if (!map || typeof map.getDiv !== "function") return;

    const isDrawingActive = Boolean(enabled && shapeMode);
    const mapDiv = map.getDiv();
    const originalDraggable = map.get("draggable");
    const originalDisableDoubleClickZoom = map.get("disableDoubleClickZoom");
    const originalMapCursor = mapDiv.style.cursor;
    const canvases = Array.from(mapDiv.querySelectorAll("canvas"));
    const originalCanvasCursors = canvases.map((canvas) => canvas.style.cursor);

    try {
      map.setOptions({
        draggable: isDrawingActive ? false : originalDraggable,
        disableDoubleClickZoom: isDrawingActive ? true : originalDisableDoubleClickZoom,
        draggableCursor: isDrawingActive ? "crosshair" : "",
        draggingCursor: isDrawingActive ? "crosshair" : "",
      });
    } catch {
      // Map can unmount while effects are flushing.
    }

    mapDiv.style.cursor = isDrawingActive ? "crosshair" : "";
    canvases.forEach((canvas) => {
      canvas.style.cursor = isDrawingActive ? "crosshair" : "";
    });

    return () => {
      try {
        map.setOptions({
          draggable: originalDraggable,
          disableDoubleClickZoom: originalDisableDoubleClickZoom,
          draggableCursor: "",
          draggingCursor: "",
        });
      } catch {
        // Ignore map teardown edge cases.
      }
      mapDiv.style.cursor = originalMapCursor;
      canvases.forEach((canvas, idx) => {
        canvas.style.cursor = originalCanvasCursors[idx] ?? "";
      });
    };
  }, [map, enabled, shapeMode]);

  // (Clear signal effect remains the same...)
  useEffect(() => {
    if (clearSignal === 0 || clearSignal === lastClearSignalRef.current) return;
    lastClearSignalRef.current = clearSignal;
    cleanupActiveDrawing(false);
    shapesRef.current.forEach(s => {
      window.clearTimeout(s.analysisTimer);
      s.listeners?.forEach(l => window.google.maps.event.removeListener(l));
      s.overlay?.setMap(null);
      s.gridOverlays?.forEach(r => r.setMap(null));
      if (s.labelMarker) s.labelMarker.map = null;
      (s.segmentLabels || []).forEach((m) => { m.map = null; });
      clearVertexMarkers(s.vertexMarkers);
    });
    shapesRef.current = [];
    collectedDrawingRef.current = [];
    callbacksRef.current.onDrawingsChange?.([]);
    callbacksRef.current.onSummary?.(null);
    toast.info("All drawings cleared", { position: "bottom-right", autoClose: 2000 });
  }, [clearSignal, cleanupActiveDrawing]);

  useEffect(() => {
    if (shapesRef.current.length > 0) {
      shapesRef.current.forEach(reAnalyzeShape);
    }
  }, [logs, sessions, selectedMetric, thresholds, pixelateRect, cellSizeMeters, colorizeCells, reAnalyzeShape]);

  // Recolor existing shapes when the basemap switches between map and satellite.
  useEffect(() => {
    shapesRef.current.forEach((s) => {
      if (s.type === "polyline") {
        s.overlay.setOptions?.({ strokeColor: getShapeColor("line", isSatellite), strokeWeight: isSatellite ? 3 : 2 });
      } else if (s.type === "polygon" || s.type === "rectangle" || s.type === "circle") {
        const color = getShapeColor("area", isSatellite);
        s.overlay.setOptions?.({ strokeColor: color, fillColor: color, strokeWeight: isSatellite ? 3 : 2 });
      }
    });
  }, [isSatellite]);

  // Segment labels follow the toggle and only render at street-level zoom.
  useEffect(() => {
    const refresh = () => shapesRef.current.forEach((s) => s.rebuildSegmentLabels?.());
    refresh();
    if (!map?.addListener) return undefined;
    const listener = map.addListener("idle", refresh);
    return () => listener.remove();
  }, [map, showSegmentLabels]);

  // Clicking empty map deselects rectangle/circle so their native edit handles disappear.
  useEffect(() => {
    if (!map?.addListener) return undefined;
    const listener = map.addListener("click", () => {
      shapesRef.current.forEach((s) => {
        if (s.type === "rectangle" || s.type === "circle") s.overlay.setOptions?.({ editable: false });
      });
    });
    return () => listener.remove();
  }, [map]);

  // Keep text readable on the current basemap: black on map, light on satellite.
  useEffect(() => {
    if (!map?.addListener) return undefined;
    const sync = () => {
      setIsSatellite(isSatelliteMapType(map.getMapTypeId?.()));
      shapesRef.current.forEach((s) => refreshAdvancedMarkerLabelTheme(s.labelMarker));
    };
    sync();
    const listener = map.addListener("maptypeid_changed", sync);
    return () => listener.remove();
  }, [map]);

  if (!activeDraft || !enabled || !shapeMode) return null;

  const draftLabel =
    activeDraft.type === "polygon"
      ? `${activeDraft.pointCount} point${activeDraft.pointCount === 1 ? "" : "s"}`
      : `${activeDraft.pointCount} segment point${activeDraft.pointCount === 1 ? "" : "s"}`;

  const barTone = isSatellite
    ? "border-white/15 bg-slate-900/80 text-slate-100"
    : "border-slate-200 bg-white/95 text-slate-900";
  const cancelTone = isSatellite
    ? "border-white/25 text-slate-100 hover:bg-white/10"
    : "border-slate-300 text-slate-800 hover:bg-slate-100";

  return (
    <div className={`absolute bottom-4 left-1/2 z-[700] -translate-x-1/2 rounded-full border px-4 py-2 shadow-xl backdrop-blur-md ${barTone}`}>
      <div className="flex items-center gap-2.5 text-xs">
        <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
        <span className="font-semibold capitalize">{activeDraft.type}</span>
        <span className="opacity-40">|</span>
        <span className="opacity-80">{draftLabel}</span>
        <span className="hidden text-[10px] opacity-60 md:inline">Backspace undo · Enter finish · Esc cancel</span>
        {undoActiveDrawingRef.current && (
          <button
            type="button"
            disabled={!activeDraft.canUndo}
            onClick={() => undoActiveDrawingRef.current?.()}
            title="Undo last point (Backspace)"
            className={`ml-1 rounded-full border px-3 py-1 font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${cancelTone}`}
          >
            Undo
          </button>
        )}
        <button
          type="button"
          disabled={!activeDraft.canFinish}
          onClick={() => finishActiveDrawingRef.current?.()}
          className="ml-1 rounded-full bg-blue-600 px-3 py-1 font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-400/60"
        >
          Finish
        </button>
        <button
          type="button"
          onClick={() => cancelActiveDrawingRef.current?.()}
          className={`rounded-full border px-3 py-1 font-medium transition ${cancelTone}`}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default memo(DrawingToolsLayerComponent);
